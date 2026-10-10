"""OpenWave Backend — Extracción de URLs de audio con yt-dlp."""

import asyncio
import contextlib
import io
import os
import shutil
import subprocess
import sys
import threading
from collections.abc import AsyncIterator
from contextlib import suppress
from pathlib import Path

import httpx
import yt_dlp
from cache import (
    cache_url,
    get_cached_url,
    in_flight,
    in_flight_lock,
)
from config import STREAM_CACHE_DIR, STREAM_CACHE_MAX_BYTES, YT_DLP_CACHE_DIR
from logging_config import get_logger

logger = get_logger(__name__)

# ── Calidad de reproducción ─────────────────────────────────────────────────
# Escalera de formatos de yt-dlp por calidad de streaming. TODAS terminan en
# "18/bestaudio" (itag 18 del client android: mp4 progresivo con rangos
# completos) para que si un formato superior no existe para el vídeo, la
# selección degrade al comportamiento actual y la reproducción nunca se rompa.
QUALITY_FORMATS = {
    # "Baja" se sirve desde el M4A local re-codificado (ver stream_audio_generator);
    # esta escalera solo aplica si se pidiera una URL directa para esa calidad.
    "low": "18/bestaudio",
    "standard": "18/bestaudio",  # comportamiento actual (~128k)
    "high": "251/140/18/bestaudio",  # opus ~160k → m4a ~128k → estándar
}


def sanitize_quality(quality: str) -> str:
    """Normaliza el parámetro de calidad (whitelist → nunca confiar en input)."""
    return quality if quality in QUALITY_FORMATS else "standard"


def _stream_key(video_id: str, quality: str) -> str:
    """Clave de caché por (video, calidad).

    El estándar conserva el video_id simple: es compatible con la caché en
    disco ya escrita y con los tests existentes; el resto se compone.
    """
    return video_id if quality == "standard" else f"{video_id}@{quality}"


# ── Calidad "Baja": re-codificado local a ~64 kb/s ──────────────────────────
# YouTube (sin PO token) solo sirve con rangos completos el itag 18 (~128 kb/s);
# los formatos de audio puro (249/251) rechazan con 403 cualquier rango más
# allá de ~0.9 MB, así que no se pueden reproducir enteros desde el navegador.
# Por eso "Baja" se sirve desde un M4A re-codificado con ffmpeg y cacheado en
# disco (STREAM_CACHE_DIR): el propio backend lo entrega completo y el
# navegador recibe el archivo entero, como con las descargas locales.

LOWQ_EXT = ".64k.m4a"

_lowq_inflight: dict = {}
_lowq_lock = threading.Lock()


def lowq_path(video_id: str):
    """Path del M4A ~64 kb/s cacheado para `video_id`."""
    return STREAM_CACHE_DIR / f"{video_id}{LOWQ_EXT}"


def _bundle_dir(name: str) -> Path | None:
    """Directorio `name` empaquetado junto a la app (raíz de la instalación).

    En el MSI la app vive en `Program Files\\OpenWave` con `runtime\\` y
    `ffmpeg\\` al lado del `.exe`; en desarrollo el mismo layout puede
    existir bajo `build/staging/` (lo crea scripts/prepare-runtime.ps1).
    """
    base = Path(__file__).resolve().parent.parent
    for root in (base, base / "build" / "staging"):
        cand = root / name
        if cand.is_dir():
            return cand
    return None


def _yt_dlp_cmd() -> list:
    """Binario de yt-dlp: runtime empaquetado → PATH → venv → módulo.

    En la instalación de Windows no hay binario suelto: se usa el Python
    embebido (`sys.executable`) con el módulo yt_dlp de
    `runtime/Lib/site-packages`, exactamente la versión que probamos.
    El resto de órdenes cubre desarrollo (venv/bin o PATH).
    """
    bundle = _bundle_dir("runtime")
    if bundle is not None:
        # El intérprete embebido es el que tiene Lib\site-packages: usarlo
        # aunque el proceso actual sea otro Python (arranque suelto de main.py).
        candidates = (
            [bundle / "python.exe", bundle / "bin" / "python3"]
            if os.name == "nt"
            else [bundle / "bin" / "python3", bundle / "python3"]
        )
        for py in candidates:
            if py.is_file():
                return [str(py), "-m", "yt_dlp"]
    exe = shutil.which("yt-dlp")
    if exe:
        return [exe]
    local = Path(sys.executable).resolve().parent / "yt-dlp"
    if local.exists():
        return [str(local)]
    return [sys.executable, "-m", "yt_dlp"]


def _ffmpeg_bin() -> str:
    """Binario de ffmpeg: empaquetado → PATH → ~/.local/bin → PATH."""
    bundle = _bundle_dir("ffmpeg")
    if bundle is not None:
        for name in ("ffmpeg.exe", "ffmpeg"):
            cand = bundle / name
            if cand.is_file():
                return str(cand)
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    local = Path.home() / ".local" / "bin" / "ffmpeg"
    if local.exists():
        return str(local)
    return "ffmpeg"


def _prune_lowq_cache() -> None:
    """Poda LRU: si la caché supera el tope, borra los archivos más antiguos."""
    try:
        files = sorted(
            (f for f in STREAM_CACHE_DIR.glob(f"*{LOWQ_EXT}") if f.is_file()),
            key=lambda f: f.stat().st_mtime,
        )
        total = sum(f.stat().st_size for f in files)
        for f in files:
            if total <= STREAM_CACHE_MAX_BYTES:
                break
            try:
                total -= f.stat().st_size
                f.unlink()
            except OSError:
                pass
    except OSError:
        pass


def _build_low_quality(video_id: str) -> None:
    """Descarga (itag 18) y re-codifica a ~64 kb/s → `lowq_path(video_id)`.

    El itag 18 es el único formato con rangos completos sin PO token; el vídeo
    sobrante se descarta con `-vn`. Escritura atómica (.part → rename) para que
    una petición concurrente nunca vea un archivo a medias.
    """
    out = lowq_path(video_id)
    if out.exists() and out.stat().st_size > 0:
        return

    src_template = STREAM_CACHE_DIR / f".{video_id}.src.%(ext)s"
    subprocess.run(
        _yt_dlp_cmd()
        + [
            "-f",
            "18/bestaudio",
            "--extractor-args",
            "youtube:player_client=android",
            # Caché de yt-dlp dentro del directorio de datos de la app (si
            # no, cae en %USERPROFILE%\.cache\yt-dlp).
            "--cache-dir",
            str(YT_DLP_CACHE_DIR),
            "-o",
            str(src_template),
            "--quiet",
            "--no-warnings",
            "--js-runtimes",
            "deno",
            "--impersonate",
            "chrome",
            f"https://www.youtube.com/watch?v={video_id}",
        ],
        check=True,
        capture_output=True,
        timeout=180,
    )
    src_files = list(STREAM_CACHE_DIR.glob(f".{video_id}.src.*"))
    src_files = [f for f in src_files if not f.name.endswith(".part")]
    if not src_files:
        raise RuntimeError("yt-dlp no produjo ningún archivo de audio")

    tmp = out.parent / f"{out.name}.part"
    try:
        subprocess.run(
            [
                _ffmpeg_bin(),
                "-y",
                "-i",
                str(src_files[0]),
                "-vn",
                "-c:a",
                "aac",
                "-b:a",
                "64k",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
                # El destino termina en .part (escritura atómica) y ffmpeg no
                # infiere el contenedor de esa extensión → declararlo.
                "-f",
                "mp4",
                str(tmp),
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
        tmp.replace(out)
    finally:
        for f in src_files:
            with suppress(OSError):
                f.unlink()
        with suppress(OSError):
            tmp.unlink(missing_ok=True)
    _prune_lowq_cache()


def ensure_low_quality_sync(video_id: str):
    """Devuelve (construyéndolo si hace falta) el M4A ~64 kb/s del vídeo.

    Coordina threads con un evento por vídeo: si dos peticiones llegan a la
    vez, solo una construye y la otra espera el resultado.
    """
    path = lowq_path(video_id)
    if path.exists() and path.stat().st_size > 0:
        return path

    with _lowq_lock:
        ev = _lowq_inflight.get(video_id)
        primary = ev is None
        if primary:
            ev = threading.Event()
            _lowq_inflight[video_id] = ev

    if not primary:
        ev.wait(timeout=240)
        if path.exists() and path.stat().st_size > 0:
            return path
        raise RuntimeError("Audio en baja calidad no disponible")

    try:
        _build_low_quality(video_id)
        return path
    finally:
        with _lowq_lock:
            _lowq_inflight.pop(video_id, None)
        ev.set()


def warm_low_quality(video_id: str) -> None:
    """Construye el audio en baja calidad en un thread daemon (no bloquea)."""
    try:
        if lowq_path(video_id).exists():
            return
    except OSError:
        return

    def _run() -> None:
        try:
            ensure_low_quality_sync(video_id)
        except Exception as e:
            logger.debug("warm low %s: %s", video_id, e)

    threading.Thread(target=_run, daemon=True).start()


def _ydl_get_url(video_id: str, client: str = "", quality: str = "standard") -> tuple:
    """Extraer URL de audio usando yt-dlp.

    Args:
        video_id: ID del video de YouTube.
        client: Client específico ("tv_embedded", "ios", etc.)
                o "" para usar el default (client "android", funciona sin
                cookies y sin PO token; sus URLs aceptan rangos completos).
        quality: "low" | "standard" | "high" (ver QUALITY_FORMATS).

    Nota: el client "android" con itag 18 (mp4 progresivo) es el único que
    sirve el archivo completo; los clients default/web restringen los rangos
    a los primeros ~512KB y devuelven HTTP 403 para el resto.
    """
    opts = {
        "format": QUALITY_FORMATS[sanitize_quality(quality)],
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 8,
        "retries": 0,
        "extractor_retries": 0,
        "extractor_args": {"youtube": {"player_client": [client or "android"]}},
        # Caché de yt-dlp dentro del directorio de datos de la app
        "cachedir": str(YT_DLP_CACHE_DIR),
    }

    with (
        contextlib.redirect_stderr(io.StringIO()),
        yt_dlp.YoutubeDL(opts) as ydl,
    ):
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}", download=False
        )

    url = info.get("url")
    if not url:
        fmts = sorted(
            [
                f
                for f in (info.get("formats") or [])
                if f.get("acodec") != "none" and f.get("vcodec") == "none"
            ],
            key=lambda f: f.get("abr") or 0,
            reverse=True,
        )
        if fmts:
            url = fmts[0].get("url")

    label = client or "default"
    if not url:
        raise RuntimeError(f"Sin URL ({label})")

    logger.info("✓ %s: %s", label, video_id)
    return url, info.get("http_headers", {})


def _ydl_get_url_with_cookies(video_id: str) -> tuple:
    """Extraer URL de audio usando cookies del navegador.

    Intenta extraer cookies de Chrome, Firefox, Edge y Brave
    en secuencia. Si un navegador no tiene cookies para YouTube
    o no está disponible, pasa al siguiente.
    """
    browsers = ["chrome", "firefox", "edge", "brave"]
    last_error = None

    for browser in browsers:
        try:
            with (
                contextlib.redirect_stderr(io.StringIO()),
                yt_dlp.YoutubeDL(
                    {
                        "format": "bestaudio",
                        "quiet": True,
                        "no_warnings": True,
                        "socket_timeout": 10,
                        "retries": 1,
                        "extractor_retries": 1,
                        "cookiesfrombrowser": (browser,),
                        # Caché de yt-dlp dentro del directorio de datos
                        "cachedir": str(YT_DLP_CACHE_DIR),
                    }
                ) as ydl,
            ):
                info = ydl.extract_info(
                    f"https://www.youtube.com/watch?v={video_id}", download=False
                )

            url = info.get("url")
            if not url:
                fmts = sorted(
                    [
                        f
                        for f in (info.get("formats") or [])
                        if f.get("acodec") != "none" and f.get("vcodec") == "none"
                    ],
                    key=lambda f: f.get("abr") or 0,
                    reverse=True,
                )
                if fmts:
                    url = fmts[0].get("url")

            if url:
                logger.info("✓ cookies (%s): %s", browser, video_id)
                return url, info.get("http_headers", {})

            last_error = RuntimeError(f"Sin URL ({browser} con cookies)")
        except Exception as e:
            err_str = str(e).lower()
            # Diferenciar: "no browser" (DEBUG) vs "auth failed" (WARNING)
            if any(
                kw in err_str
                for kw in ["not found", "no cookies", "unable to", "could not find"]
            ):
                logger.debug(
                    "cookies (%s) no disponible para %s: %s", browser, video_id, e
                )
            else:
                logger.warning(
                    "cookies (%s) falló para %s (posible auth expirado): %s",
                    browser,
                    video_id,
                    e,
                )
            last_error = e
            continue

    raise last_error or RuntimeError("Sin URL (cookies)")


def _extract_audio_url_sync(video_id: str, quality: str = "standard") -> tuple:
    """Extraer URL de audio con caché y fallback progresivo.

    Estrategia (de más anónimo a menos):
    1. Caché en memoria/disco
    2. Default (client "android", itag 18, sin cookies ni JS runtime)
    3. tv_embedded (rápido, funciona con advertencia)
    4. Cookies del navegador (Chrome, Firefox, Edge, Brave) — solo si el usuario
       tiene una sesión activa de YouTube en su navegador

    Cada calidad tiene su propia entrada de caché/in-flight: si el usuario
    cambia Baja/Estándar/Alta no se sirve una URL cacheada de otra calidad.
    """
    quality = sanitize_quality(quality)
    key = _stream_key(video_id, quality)

    # Intentar caché
    cached_url, cached_headers = get_cached_url(key)
    if cached_url:
        return cached_url, cached_headers

    # Coordinación entre threads para evitar duplicados
    with in_flight_lock:
        if key in in_flight:
            ev, box = in_flight[key]
            is_waiter = True
        else:
            ev = threading.Event()
            box = [None, None]
            in_flight[key] = (ev, box)
            is_waiter = False

    if is_waiter:
        ev.wait(timeout=15)
        if isinstance(box[0], Exception):
            raise box[0]
        if box[0]:
            return box[0], box[1]
        raise RuntimeError("Sin audio")

    try:
        errors = []

        # ═══ 1. Default — client "android" (itag 18) ═══
        #    Funciona anónimamente, no requiere cookies ni JS runtime, y sus
        #    URLs aceptan rangos completos (los demás clients dan 403).
        try:
            url, headers = _ydl_get_url(
                video_id, quality=quality
            )  # client="" → default
            cache_url(key, url, headers)
            box[0], box[1] = url, headers
            return url, headers
        except Exception as e:
            logger.warning("default falló para %s: %s", video_id, e)
            errors.append(f"default: {e}")

        # ═══ 2. tv_embedded (rápido, fallback) ═══
        try:
            url, headers = _ydl_get_url(video_id, "tv_embedded", quality=quality)
            cache_url(key, url, headers)
            box[0], box[1] = url, headers
            return url, headers
        except Exception as e:
            logger.warning("tv_embedded falló para %s: %s", video_id, e)
            errors.append(f"tv_embedded: {e}")

        # ═══ 3. Cookies del navegador (último recurso) ═══
        try:
            url, headers = _ydl_get_url_with_cookies(video_id)
            cache_url(key, url, headers)
            box[0], box[1] = url, headers
            logger.info("✓ recuperado con cookies: %s", video_id)
            return url, headers
        except Exception as cookie_err:
            logger.warning("cookies falló para %s: %s", video_id, cookie_err)
            errors.append(f"cookies: {cookie_err}")

        err = RuntimeError(f"Sin audio para {video_id}. Errores: {'; '.join(errors)}")
        box[0] = err
        raise err
    finally:
        with in_flight_lock:
            in_flight.pop(key, None)
        ev.set()


async def get_audio_url(video_id: str, quality: str = "standard") -> tuple:
    """Obtener URL de audio (async wrapper)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _extract_audio_url_sync, video_id, sanitize_quality(quality)
    )


async def upstream_range_stream(
    video_id: str, quality: str, range_header: str | None
) -> tuple[int, dict, AsyncIterator[bytes]]:
    """Obtener el audio directo de YouTube REENVIANDO la cabecera ``Range``.

    Chromium solo considera seekable un ``<audio>`` si recibe 206 +
    ``Content-Range`` (envía ``Range: bytes=0-`` ya en la PRIMERA petición).
    Sin eso, marca el recurso como no-seekable y ``audio.currentTime = t``
    reinicia la reproducción desde 0. Por eso el proxy de audio debe poder
    responder rangos: aquí se pide al upstream exactamente el rango que pidió
    el navegador, con impersonación TLS de Chrome (curl_cffi) para evitar 403.

    Returns:
        ``(status, headers, body)``:
          - ``status``: 206 si el upstream honró el rango, si no 200 (o 416).
          - ``headers``: cabeceras a relaying (Content-Range, Accept-Ranges...).
          - ``body``: async generator que cierra la sesión al terminar.

    Raises:
        RuntimeError: si el upstream responde >=400 o la conexión falla →
        el caller cae al fallback sin Range (yt-dlp subprocess).
    """
    from curl_cffi import requests as curl_requests

    url, base_headers = await get_audio_url(video_id, quality)
    req_headers = dict(base_headers or {})
    if range_header:
        req_headers["Range"] = range_header

    session = curl_requests.AsyncSession(impersonate="chrome")
    try:
        resp = await session.get(
            url, headers=req_headers, stream=True, timeout=(15, 30)
        )
    except BaseException:
        await session.close()
        raise

    if resp.status_code >= 400:
        await resp.aclose()
        await session.close()
        raise RuntimeError(f"upstream HTTP {resp.status_code}")

    upstream = {k.lower(): v for k, v in dict(resp.headers).items()}
    out: dict = {}
    for key in (
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
    ):
        if key in upstream:
            out[key] = upstream[key]

    if range_header and resp.status_code != 206:
        # Pidió rango pero el upstream devolvió 200 completo: no podemos
        # servir rangos → no prometer Accept-Ranges (Chromium lo comprobaría).
        out.pop("accept-ranges", None)
    else:
        out.setdefault("accept-ranges", "bytes")

    async def body():
        try:
            async for chunk in resp.aiter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        finally:
            await resp.aclose()
            await session.close()

    return resp.status_code, out, body()


async def stream_audio_generator(video_id: str, quality: str = "standard"):
    """Descargar audio con yt-dlp y streamearlo por chunks (async generator).

    Método principal: yt-dlp subprocess con Deno + impersonate Chrome.
    Un solo intento, rápido y anónimo.

    ``quality`` (low/standard/high) escala el formato -f elegido; la escalera
    siempre termina en 18/bestaudio así que el stream nunca se queda sin fuente.

    ``low`` se sirve desde el M4A re-codificado local (~64 kb/s); si no está
    disponible, se cae al método normal para no cortar la reproducción.
    """
    quality = sanitize_quality(quality)
    if quality == "low":
        try:
            loop = asyncio.get_running_loop()
            path = await loop.run_in_executor(None, ensure_low_quality_sync, video_id)
            with open(path, "rb") as fh:
                while True:
                    chunk = fh.read(65536)
                    if not chunk:
                        break
                    yield chunk
            return
        except Exception as e:
            logger.warning(
                "stream %s baja no disponible (%s); usando itag 18", video_id, e
            )

    fmt = QUALITY_FORMATS[quality]
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "-f",
            fmt,
            "--extractor-args",
            "youtube:player_client=android",
            "-o",
            "-",
            "--quiet",
            "--no-warnings",
            "--js-runtimes",
            "deno",
            "--impersonate",
            "chrome",
            f"https://www.youtube.com/watch?v={video_id}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stderr_data = b""

        async def _read_stderr():
            nonlocal stderr_data
            stderr_data = await proc.stderr.read()

        stderr_task = asyncio.create_task(_read_stderr())

        has_data = False
        try:
            while True:
                chunk = await asyncio.wait_for(proc.stdout.read(65536), timeout=5)
                if not chunk:
                    break
                has_data = True
                yield chunk
        except TimeoutError:
            pass
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
            await stderr_task

        if has_data:
            logger.info("stream %s: ✓ OK", video_id)
            return
        else:
            err_msg = stderr_data.decode("utf-8", errors="replace").strip()[:200]
            logger.warning("stream %s: sin datos: %s", video_id, err_msg)
    except Exception as e:
        logger.warning("stream %s: subprocess falló: %s", video_id, e)

    # ═══ Fallback: httpx con URL extraída ═══
    try:
        url, headers = await get_audio_url(video_id, quality)
        if url:
            async with (
                httpx.AsyncClient(follow_redirects=True, timeout=30) as client,
                client.stream("GET", url, headers=headers or {}) as response,
            ):
                if response.status_code == 200:
                    logger.info("stream %s: ✓ httpx OK", video_id)
                    async for chunk in response.aiter_bytes(65536):
                        yield chunk
                    return
    except Exception as e:
        logger.warning("stream %s: httpx falló: %s", video_id, e)

    # ═══ Último recurso: cookies del navegador ═══
    try:
        url, headers = await _get_url_with_cookies_async(video_id)
        if url:
            async with (
                httpx.AsyncClient(follow_redirects=True, timeout=30) as client,
                client.stream("GET", url, headers=headers or {}) as response,
            ):
                if response.status_code == 200:
                    logger.info("stream %s: ✓ cookies OK", video_id)
                    async for chunk in response.aiter_bytes(65536):
                        yield chunk
                    return
    except Exception as e:
        logger.warning("stream %s: cookies falló: %s", video_id, e)

    logger.error("stream %s: todos los métodos fallaron", video_id)


async def _get_url_with_cookies_async(video_id: str) -> tuple:
    """Obtener URL con cookies del navegador (async wrapper)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _extract_with_cookies_sync, video_id)


def _extract_with_cookies_sync(video_id: str) -> tuple:
    """Extraer URL usando cookies del navegador."""
    browsers = ["chrome", "edge", "brave", "firefox"]
    for browser in browsers:
        try:
            with (
                contextlib.redirect_stderr(io.StringIO()),
                yt_dlp.YoutubeDL(
                    {
                        "format": "bestaudio",
                        "quiet": True,
                        "no_warnings": True,
                        "socket_timeout": 10,
                        "cookiesfrombrowser": (browser,),
                        # Caché de yt-dlp dentro del directorio de datos
                        "cachedir": str(YT_DLP_CACHE_DIR),
                    }
                ) as ydl,
            ):
                info = ydl.extract_info(
                    f"https://www.youtube.com/watch?v={video_id}", download=False
                )
            url = info.get("url")
            if not url:
                fmts = [
                    f
                    for f in (info.get("formats") or [])
                    if f.get("acodec") != "none" and f.get("vcodec") == "none"
                ]
                if fmts:
                    url = fmts[0].get("url")
            if url:
                return url, info.get("http_headers", {})
        except Exception:
            continue
    raise RuntimeError("Sin URL (cookies)")


def prefetch(video_id: str, quality: str = "standard"):
    """Pre-cargar URL de audio en caché (entrada propia por calidad)."""
    quality = sanitize_quality(quality)
    cached_url, _ = get_cached_url(_stream_key(video_id, quality))
    if cached_url:
        return
    with suppress(Exception):
        _extract_audio_url_sync(video_id, quality)
