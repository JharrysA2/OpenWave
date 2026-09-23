"""SoundWave Backend — Extracción de URLs de audio con yt-dlp."""

import asyncio
import contextlib
import io
import threading
from contextlib import suppress

import httpx
import yt_dlp
from cache import (
    cache_url,
    get_cached_url,
    in_flight,
    in_flight_lock,
)
from logging_config import get_logger

logger = get_logger(__name__)


def _ydl_get_url(video_id: str, client: str = "") -> tuple:
    """Extraer URL de audio usando yt-dlp.

    Args:
        video_id: ID del video de YouTube.
        client: Client específico ("tv_embedded", "ios", etc.)
                o "" para usar el default (client "android", funciona sin
                cookies y sin PO token; sus URLs aceptan rangos completos).

    Nota: el client "android" con itag 18 (mp4 progresivo) es el único que
    sirve el archivo completo; los clients default/web restringen los rangos
    a los primeros ~512KB y devuelven HTTP 403 para el resto.
    """
    opts = {
        "format": "18/bestaudio",
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 8,
        "retries": 0,
        "extractor_retries": 0,
        "extractor_args": {"youtube": {"player_client": [client or "android"]}},
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


def _extract_audio_url_sync(video_id: str) -> tuple:
    """Extraer URL de audio con caché y fallback progresivo.

    Estrategia (de más anónimo a menos):
    1. Caché en memoria/disco
    2. Default (client "android", itag 18, sin cookies ni JS runtime)
    3. tv_embedded (rápido, funciona con advertencia)
    4. Cookies del navegador (Chrome, Firefox, Edge, Brave) — solo si el usuario
       tiene una sesión activa de YouTube en su navegador
    """
    # Intentar caché
    cached_url, cached_headers = get_cached_url(video_id)
    if cached_url:
        return cached_url, cached_headers

    # Coordinación entre threads para evitar duplicados
    with in_flight_lock:
        if video_id in in_flight:
            ev, box = in_flight[video_id]
            is_waiter = True
        else:
            ev = threading.Event()
            box = [None, None]
            in_flight[video_id] = (ev, box)
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
            url, headers = _ydl_get_url(video_id)  # client="" → default
            cache_url(video_id, url, headers)
            box[0], box[1] = url, headers
            return url, headers
        except Exception as e:
            logger.warning("default falló para %s: %s", video_id, e)
            errors.append(f"default: {e}")

        # ═══ 2. tv_embedded (rápido, fallback) ═══
        try:
            url, headers = _ydl_get_url(video_id, "tv_embedded")
            cache_url(video_id, url, headers)
            box[0], box[1] = url, headers
            return url, headers
        except Exception as e:
            logger.warning("tv_embedded falló para %s: %s", video_id, e)
            errors.append(f"tv_embedded: {e}")

        # ═══ 3. Cookies del navegador (último recurso) ═══
        try:
            url, headers = _ydl_get_url_with_cookies(video_id)
            cache_url(video_id, url, headers)
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
            in_flight.pop(video_id, None)
        ev.set()


async def get_audio_url(video_id: str) -> tuple:
    """Obtener URL de audio (async wrapper)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _extract_audio_url_sync, video_id)


async def stream_audio_generator(video_id: str):
    """Descargar audio con yt-dlp y streamearlo por chunks (async generator).

    Método principal: yt-dlp subprocess con Deno + impersonate Chrome.
    Un solo intento, rápido y anónimo.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "-f",
            "18/bestaudio",
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
        url, headers = await get_audio_url(video_id)
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


def prefetch(video_id: str):
    """Pre-cargar URL de audio en caché."""
    cached_url, _ = get_cached_url(video_id)
    if cached_url:
        return
    with suppress(Exception):
        _extract_audio_url_sync(video_id)
