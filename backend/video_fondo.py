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
from db import db_delete_videoclip_oficial, db_get_videoclip_oficial
from logging_config import get_logger
from videoclip import resolver_videoclip
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


def prepare_video(video_id: str, usar_oficial: bool = True) -> None:
    """Descargar mejor vídeo + mejor audio y muxarlos en un único fichero.

    Idempotente: si el vídeo ya está preparado no descarga nada. El progreso
    vive en ``video_progress[video_id]`` y lo lee el SSE de /video/progress.

    Con ``usar_oficial`` se descarga el videoclip oficial de la canción; si no
    tiene, no se descarga nada y el estado queda en ``sin_video`` (la pantalla
    usa la portada). El fichero final sigue llamándose ``{video_id}.mp4``, sea
    cual sea el vídeo descargado.
    """
    _progress(video_id)
    _lock = _get_lock(video_id)
    _lock.acquire()
    try:
        if is_prepared(video_id):
            logger.info("skip vídeo %s: ya preparado", video_id)
            video_progress[video_id] = {
                "status": "done",
                "progress": 100,
                "error": None,
            }
            return

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

        # Cadena de intentos, de mejor calidad disponible a más compatible:
        #   1. `cookies.txt` del usuario, si existe: la vía más fiable; sin
        #      sesión válida YouTube recorta la resolución.
        #   2. cliente «embed» (embed/web): 1080p sin cookies (la causa de que
        #      el resto de intentos anónimos bajen a 360p).
        #   3. mp4 anónimo: la mejor resolución que permita la sesión.
        #   4. mp4 con el cliente "android" (sirve el archivo casi siempre,
        #      aunque sin PO token se quede en 360p).
        #   5. webm (vp9/opus, también jugable por el navegador).
        #   6. cookies del navegador, como último recurso.
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
                "No se pudo preparar el vídeo"
                + (f": {last_error}" if last_error else "")
            )

        if get_output_path(video_id) is None:
            raise RuntimeError("yt-dlp no produjo ningún fichero muxado")

        _evict_if_needed()
        video_progress[video_id] = {"status": "done", "progress": 100, "error": None}
        logger.info(
            "vídeo listo %s (%s, fuente %s)",
            video_id,
            get_output_path(video_id).name,
            fuente_id,
        )
    except Exception as e:  # noqa: BLE001
        video_progress[video_id] = {"status": "error", "progress": 0, "error": str(e)}
        logger.error("Vídeo de fondo: error al preparar %s: %s", video_id, e)
    finally:
        _lock.release()


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
