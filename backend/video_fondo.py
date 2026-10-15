"""OpenWave Backend — Vídeo de fondo de la pantalla de letras.

Descarga el mejor vídeo + el mejor audio de YouTube y los muxea con ffmpeg
(vía yt-dlp) en un único MP4 compatible con el ``<video>`` de la app. El
fichero queda cacheado en ``VIDEO_DIR`` (tope con evicción LRU) para que volver
a abrir la misma canción sea instantáneo: sin streaming ni descarga repetida.

Con ``usar_oficial`` (por defecto) se descarga el **videoclip oficial** de la
canción, resuelto con ``videoclip``; si la canción no tiene videoclip no se
descarga nada y la pantalla de letras se queda con la portada.

El motor solo trabaja para canciones abiertas con el ajuste «Vídeo de fondo»
encendido: coste cero en el resto de la app.
"""

import threading
from contextlib import suppress
from pathlib import Path

import yt_dlp
from cache import video_progress
from config import PROJECT_DIR, VIDEO_CACHE_MAX_BYTES, VIDEO_DIR, YT_DLP_CACHE_DIR
from db import (
    db_delete_videoclip_oficial,
    db_get_desfase_videoclip,
    db_get_videoclip_oficial,
    db_set_desfase_videoclip,
    db_set_videoclip_oficial,
)
from logging_config import get_logger
from videoclip import DESAJUSTE_SIN_MEDIDA, resolver_videoclip
from ytdlp_auth import browser_cookie_opts, cookies_file_opt

logger = get_logger(__name__)

# ── Lock POR VÍDEO ────────────────────────────────────────────────────────────
# Mismo patrón que downloads.py: dos «Preparar» simultáneos del mismo vídeo
# (doble pulsación, reabrir rápido) escribirían el MISMO fichero final. El
# lock serializa y el segundo, al entrar, ve el fichero publicado → no-op.
_locks_guard = threading.Lock()
_locks: dict = {}


def _get_lock(video_id: str) -> threading.Lock:
    with _locks_guard:
        lock = _locks.get(video_id)
        if lock is None:
            lock = threading.Lock()
            _locks[video_id] = lock
        return lock


def _search_ffmpeg_dir() -> str | None:
    """Directorio con el ffmpeg empaquetado (MSI) o preparado en desarrollo.

    Mismas rutas que downloads.py (raíz/ffmpeg, build/staging/ffmpeg…): en la
    instalación el ffmpeg viaja junto al backend para que el mux de yt-dlp
    funcione sin que el usuario tenga que instalarlo en el PATH.
    """
    for d in (
        PROJECT_DIR.parent / "ffmpeg",
        PROJECT_DIR / "build" / "staging" / "ffmpeg",
        PROJECT_DIR.parent,
        PROJECT_DIR.parent / "bin",
        PROJECT_DIR.parent.parent,
    ):
        if (d / "ffmpeg.exe").is_file() or (d / "ffmpeg").is_file():
            return str(d)
    return None


# ── Rutas y estado ────────────────────────────────────────────────────────────
_FINAL_EXTS = ("mp4", "webm")

# Tope de resolución: 1080p. Un videoclip en 4K pesa el triple y, detrás del
# velo del fondo, no se aprecia; 1080p mantiene la caché
# de vídeo razonable. Todas las escaleras terminan en un fallback sin filtro:
# si la sesión no ofrece nada a 1080p o menos, se prefiere algo a nada.
_CAP = "height<=1080"

# Escaleras de formatos. Todas terminan en un fallback sin filtro: si la sesión
# no ofrece el mejor formato, la selección degrada en vez de fallar.
_CADENA_MP4 = (
    f"bv*[{_CAP}][ext=mp4][vcodec^=avc1]+ba[ext=m4a]"
    f"/b[{_CAP}][ext=mp4][vcodec^=avc1]/bv*[{_CAP}]+ba/b[{_CAP}]/bv*+ba/b"
)
_MP4 = {"format": _CADENA_MP4, "merge_output_format": "mp4"}

# Runtimes de JavaScript que resuelven los retos de firma de YouTube (sin uno,
# los formatos con nsig no se pueden descifrar y solo queda el 360p del cliente
# de Android). yt-dlp solo activa deno por defecto; se habilitan todos los que
# soporta y usa el de más prioridad que exista (en Windows suele estar Node).
_JS_RUNTIMES = {"deno": {}, "node": {}, "bun": {}, "quickjs": {}}

# Cliente «embedded» de YouTube: es el único que sirve hasta 1080p sin PO token
# (el resto pide un token o cae a 360p). Necesita un runtime de JS para los
# retos de firma; si no hay ninguno, el intento no encuentra formatos y la
# cadena sigue por los clientes de siempre.
_MP4_EMBEDDED = {
    "format": _CADENA_MP4,
    "merge_output_format": "mp4",
    "extractor_args": {"youtube": {"player_client": ["web_embedded"]}},
}
_MP4_ANDROID = {
    "format": f"bv*[{_CAP}][ext=mp4][vcodec^=avc1]+ba[ext=m4a]"
    f"/b[{_CAP}][ext=mp4][vcodec^=avc1]/b[{_CAP}]/b",
    "merge_output_format": "mp4",
    "extractor_args": {"youtube": {"player_client": ["android"]}},
}
_WEBM_ANDROID = {
    "format": f"bv*[{_CAP}][ext=webm]+ba[ext=webm]/bv*[{_CAP}]+ba/bv*+ba/b",
    "merge_output_format": "webm",
    "extractor_args": {"youtube": {"player_client": ["android"]}},
}


def get_video_path(video_id: str) -> Path:
    """Fichero muxado FINAL de un vídeo (exista o no).

    El nombre es determinista (``{video_id}.mp4``) aunque la evicción lo
    borre; el sondeo real de disco va por ``get_output_path``.
    """
    return VIDEO_DIR / f"{video_id}.mp4"


def get_output_path(video_id: str) -> Path | None:
    """Path del vídeo preparado si existe (mp4 o webm), o None."""
    for ext in _FINAL_EXTS:
        p = VIDEO_DIR / f"{video_id}.{ext}"
        if p.is_file():
            return p
    return None


def is_prepared(video_id: str) -> bool:
    return get_output_path(video_id) is not None


def _progress(video_id: str) -> dict:
    return video_progress.setdefault(
        video_id, {"status": "downloading", "progress": 0, "error": None}
    )


def _hook_for(video_id: str):
    """Hook de yt-dlp: traduce su progreso al dict que lee el SSE."""

    def _hook(d: dict) -> None:
        if d.get("status") == "downloading":
            pct = d.get("_percent_str", "0%").strip().replace("%", "")
            with suppress(Exception):
                _progress(video_id)["progress"] = float(pct)
        elif d.get("status") == "finished":
            # Descarga terminada; toca muxar (lo hace el merger de yt-dlp).
            _progress(video_id).update({"status": "muxing", "progress": 100})

    return _hook


def _dl(fuente_id: str, opts: dict) -> None:
    """Descargar un vídeo concreto (el de la canción o su videoclip oficial)."""
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={fuente_id}"])


def sin_videoclip(video_id: str) -> bool:
    """¿Está resuelto que esta canción NO tiene videoclip oficial?

    Lo dice la caché de ``videoclip_oficial``: así la pantalla puede quedarse con
    la portada sin repetir la búsqueda al volver a abrir la canción.
    """
    consultado, oficial = db_get_videoclip_oficial(video_id)
    return consultado and oficial is None


def _descargar(video_id: str, fuente_id: str) -> None:
    """Descarga y muxea el vídeo de origen en ``{video_id}.mp4``.

    Cadena de intentos, de mejor calidad disponible a más compatible:
      1. `cookies.txt` del usuario, si existe: la vía más fiable; sin
         sesión válida YouTube recorta la resolución.
      2. cliente «embed» (embed/web): 1080p sin cookies (la causa de que
         el resto de intentos anónimos bajen a 360p).
      3. mp4 anónimo: la mejor resolución que permita la sesión.
      4. mp4 con el cliente "android" (sirve el archivo casi siempre,
         aunque sin PO token se quede en 360p).
      5. webm (vp9/opus, también jugable por el navegador).
      6. cookies del navegador, como último recurso.

    Lanza si ningún intento publica el fichero final.
    """
    attempts: list[dict] = []
    file_auth = cookies_file_opt()
    if file_auth:
        attempts.append({**_MP4, **file_auth})
    attempts += [_MP4_EMBEDDED, _MP4, _MP4_ANDROID, _WEBM_ANDROID]
    for auth in browser_cookie_opts():
        attempts.append({**_MP4, **auth})
        attempts.append({**_WEBM_ANDROID, **auth})
    base = {
        "outtmpl": str(VIDEO_DIR / f"{video_id}.%(ext)s"),
        "progress_hooks": [_hook_for(video_id)],
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "cachedir": str(YT_DLP_CACHE_DIR),
        # Para resolver los retos de firma de YouTube (los formatos de más
        # de 360p van firmados): sin runtime, yt-dlp solo ve los bajos.
        "js_runtimes": _JS_RUNTIMES,
    }
    ffmpeg_dir = _search_ffmpeg_dir()
    if ffmpeg_dir:
        base["ffmpeg_location"] = ffmpeg_dir

    last_error: Exception | None = None
    for opts in attempts:
        try:
            _dl(fuente_id, {**base, **opts})
        except yt_dlp.utils.DownloadError as e:
            last_error = e
            logger.warning("vídeo %s intento fallido: %s", video_id, e)
            continue
        if get_output_path(video_id) is not None:
            break
    else:
        # El for-else solo llega aquí si NINGÚN intento publicó un fichero.
        raise RuntimeError(
            "No se pudo preparar el vídeo" + (f": {last_error}" if last_error else "")
        )

    if get_output_path(video_id) is None:
        raise RuntimeError("yt-dlp no produjo ningún fichero muxado")


def _descartar_por_desfase(video_id: str) -> None:
    """El videoclip no encaja con la canción: se borra y se cachea «sin clip».

    Solo llega aquí cuando la comparación de pistas se completó y el vídeo no
    cuadra (no por un fallo transitorio, que se propaga como excepción).
    """
    with suppress(Exception):
        db_set_videoclip_oficial(video_id, None)
    for ext in ("mp4", "webm"):
        p = VIDEO_DIR / f"{video_id}.{ext}"
        with suppress(OSError):
            if p.is_file():
                p.unlink()
    video_progress[video_id] = {
        "status": "sin_video",
        "progress": 100,
        "error": None,
    }
    logger.info("vídeo %s: desfase no medible → se usa la portada", video_id)


def prepare_video(video_id: str, usar_oficial: bool = True) -> None:
    """Descargar mejor vídeo + mejor audio y muxarlos en un único fichero.

    Idempotente: si el vídeo ya está preparado no vuelve a descargarlo. El
    progreso vive en ``video_progress[video_id]`` y lo lee el SSE de
    /video/progress; al empezar se limpia el estado anterior para que ese SSE
    no reciba el resultado de un intento previo («error»/«sin_video») y cierre
    el aviso de la pantalla antes de tiempo.

    Con ``usar_oficial`` se descarga el videoclip oficial de la canción; si no
    tiene, no se descarga nada y el estado queda en ``sin_video`` (la pantalla
    usa la portada). El fichero final sigue llamándose ``{video_id}.mp4``, sea
    cual sea el vídeo descargado.

    El desfase con la canción se calcula siempre que falte, también si el
    fichero ya estaba en disco (así un fallo anterior no deja la medición a
    medias): solo con él publicado se marca el estado ``done``.
    """
    _lock = _get_lock(video_id)
    _lock.acquire()
    try:
        video_progress[video_id] = {
            "status": "downloading",
            "progress": 0,
            "error": None,
        }

        # Fuente del vídeo: el videoclip oficial (resolución cacheada en la
        # base de datos) o, sin él, el propio vídeo de la canción.
        fuente_id = video_id
        if usar_oficial:
            oficial_id = resolver_videoclip(video_id)
            if oficial_id is None:
                logger.info(
                    "vídeo %s: sin videoclip oficial, se usa la portada", video_id
                )
                video_progress[video_id] = {
                    "status": "sin_video",
                    "progress": 100,
                    "error": None,
                }
                return
            fuente_id = oficial_id

        if is_prepared(video_id):
            logger.info("skip descarga %s: ya preparado", video_id)
        else:
            _descargar(video_id, fuente_id)
            _evict_if_needed()

        desfase = _resolver_desfase(video_id, fuente_id, usar_oficial)
        if desfase is None:
            # El vídeo no cuadra con la canción: se descarta (queda la portada)
            # y se cachea para no repetir la descarga entera en cada apertura.
            _descartar_por_desfase(video_id)
            return
        video_progress[video_id] = {
            "status": "done",
            "progress": 100,
            "error": None,
            "desfase": desfase,
        }
        logger.info(
            "vídeo listo %s (%s, fuente %s, desfase %s)",
            video_id,
            get_output_path(video_id).name,
            fuente_id,
            desfase,
        )
    except Exception as e:  # noqa: BLE001
        # Fallo transitorio (red, yt-dlp, ffmpeg…): NO se cachea como
        # «sin videoclip». Si el fichero ya se había descargado se conserva,
        # así el reintento solo repite la medición.
        video_progress[video_id] = {"status": "error", "progress": 0, "error": str(e)}
        logger.error("Vídeo de fondo: error al preparar %s: %s", video_id, e)
    finally:
        _lock.release()


def desfase_guardado(video_id: str) -> float:
    """Desfase medido (o 0.0) con el que el vídeo debe seguir al audio."""
    _, desfase = db_get_desfase_videoclip(video_id)
    return 0.0 if desfase is None else float(desfase)


def _ffmpeg_bin() -> str | None:
    """Ruta del binario de ffmpeg empaquetado, o ``None`` si no está."""
    d = _search_ffmpeg_dir()
    if not d:
        return None
    for nombre in ("ffmpeg.exe", "ffmpeg"):
        if (Path(d) / nombre).is_file():
            return str(Path(d) / nombre)
    return None


def _descargar_audio_cancion(video_id: str, destino: Path) -> Path:
    """Descarga el audio de la canción a un directorio temporal (para medir).

    Usa las mismas vías de autenticación que el vídeo (cookies, cliente
    «embed», anónimo, android). Si ninguna funciona se propaga el error: es un
    fallo transitorio y NO debe cachearse como «la canción no tiene vídeo».
    """
    outtmpl = str(destino / "cancion.%(ext)s")
    base = {
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "cachedir": str(YT_DLP_CACHE_DIR),
        "js_runtimes": _JS_RUNTIMES,
    }
    file_auth = cookies_file_opt()
    intentos: list[dict] = []
    if file_auth:
        intentos.append({**file_auth})
    intentos += [
        {"extractor_args": {"youtube": {"player_client": ["web_embedded"]}}},
        {},
        {"extractor_args": {"youtube": {"player_client": ["android"]}}},
    ]
    for auth in browser_cookie_opts():
        intentos.append({**auth})

    ultima: Exception | None = None
    for opts in intentos:
        try:
            _dl_audio(video_id, {**base, **opts})
        except yt_dlp.utils.DownloadError as e:
            ultima = e
            logger.warning("desfase: descarga de audio fallida: %s", e)
            continue
        # Localizar el fichero publicado (m4a, webm/opus…)
        producidos = [
            p
            for p in destino.glob("cancion.*")
            if p.is_file() and p.suffix not in (".part", ".ytdl")
        ]
        if producidos:
            return producidos[0]
    raise RuntimeError(
        "No se pudo descargar la canción para medir el desfase"
        + (f": {ultima}" if ultima else "")
    )


def _dl_audio(video_id: str, opts: dict) -> None:
    with yt_dlp.YoutubeDL({"format": "bestaudio/best", **opts}) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])


def _resolver_desfase(
    video_id: str, fuente_id: str, usar_oficial: bool
) -> float | None:
    """Desfase con el que el vídeo debe seguir al audio, o ``None`` si no sirve.

    La resolución del videoclip ya sabe cuánto se separan las duraciones:

    - Si cuadran (o no se usa el videoclip oficial, que es justo el audio que
      suena) no hay nada que medir: el vídeo va a la par, desfase 0.
    - Si el videoclip dura bastante más, la canción empieza dentro del vídeo
      (suele llevar una intro). Se descarga el audio de la canción y se
      compara la sonoridad de las dos pistas: la posición en la que encaja es
      el desfase.
    - Si la comparación no da un resultado claro, el vídeo no sirve para esta
      canción: se devuelve ``None`` y el caller lo descarta (queda la portada).

    Los fallos de descarga o de lectura se propagan como excepción: son
    transitorios y NO deben cachearse como «no tiene videoclip».
    """
    desajuste, guardado = db_get_desfase_videoclip(video_id)
    if guardado is not None:
        return guardado
    if (
        not usar_oficial
        or fuente_id == video_id
        or desajuste is None
        or desajuste <= DESAJUSTE_SIN_MEDIDA
    ):
        with suppress(Exception):
            db_set_desfase_videoclip(video_id, 0.0)
        return 0.0

    video_path = get_output_path(video_id)
    ffmpeg = _ffmpeg_bin()
    if video_path is None or ffmpeg is None:
        # Sin ffmpeg no se puede comparar: se va a la par, como antes.
        logger.warning("desfase: no hay ffmpeg para medir el desfase de %s", video_id)
        with suppress(Exception):
            db_set_desfase_videoclip(video_id, 0.0)
        return 0.0

    import shutil
    import tempfile

    import desfase

    destino = Path(tempfile.mkdtemp(prefix="ow-desfase-"))
    try:
        ruta_cancion = _descargar_audio_cancion(video_id, destino)
        offset = desfase.medir(video_path, ruta_cancion, ffmpeg)
    finally:
        with suppress(Exception):
            shutil.rmtree(destino, ignore_errors=True)
    if offset is None:
        return None
    with suppress(Exception):
        db_set_desfase_videoclip(video_id, offset)
    logger.info("desfase de %s: %+.2f s", video_id, offset)
    return offset


def video_cache_size() -> int:
    """Bytes totales de los vídeos finales cacheados."""
    return sum(
        p.stat().st_size
        for p in VIDEO_DIR.glob("*")
        if p.suffix.lstrip(".") in _FINAL_EXTS and p.is_file()
    )


def _evict_if_needed() -> int:
    """Poda LRU (por fecha) hasta dejar VIDEO_DIR bajo el tope.

    Los vídeos son la caché más grande de la app; sin tope, «Preparar» muchas
    canciones llenaría el disco. Se eliminan los menos usados recientemente
    (mtime: al reproducirse el vídeo el navegador no toca el fichero, pero
    «Preparar»/volver a abrir sí lo re-consulta; basta para una LRU simple).
    """
    total = video_cache_size()
    if total <= VIDEO_CACHE_MAX_BYTES:
        return 0
    files = sorted(
        (
            p
            for p in VIDEO_DIR.glob("*")
            if p.suffix.lstrip(".") in _FINAL_EXTS and p.is_file()
        ),
        key=lambda p: p.stat().st_mtime,
    )
    removed = 0
    for p in files:
        if total <= VIDEO_CACHE_MAX_BYTES:
            break
        try:
            size = p.stat().st_size
            p.unlink()
            total -= size
            removed += 1
        except OSError:
            continue
    if removed:
        logger.info("Evicción de vídeos: %d eliminado(s)", removed)
    return removed


def delete_video(video_id: str) -> bool:
    """Borrar el vídeo preparado y los restos de su descarga (intermedios).

    También olvida el videoclip oficial resuelto: si se vuelve a preparar, se
    vuelve a buscar (por si la canción estrenó vídeo mientras tanto).
    """
    removed = False
    for p in VIDEO_DIR.glob(f"{video_id}.*"):
        with suppress(OSError):
            if p.is_file():
                p.unlink()
                removed = True
    with suppress(Exception):
        db_delete_videoclip_oficial(video_id)
    return removed
