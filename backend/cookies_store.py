"""OpenWave Backend — Gestión del ``cookies.txt`` del usuario.

El fichero de cookies es sensible: da acceso a la cuenta de YouTube. Por eso
este módulo:

- **verifica** la sesión contra YouTube antes de guardar nada (una cookie
  caducada o de otro sitio no sirve y el usuario debe saberlo al momento);
- guarda de forma atómica y con permisos de propietario (0600 en sistemas
  POSIX);
- nunca devuelve el contenido por la API, solo un estado sin secretos.

El formato aceptado es el Netscape de toda la vida (el que exportan las
extensiones «Get cookies.txt LOCALLY» y similares), con 7 campos separados por
tabuladores. La comprobación real usa el mismo yt-dlp que luego descarga los
vídeos: si la sesión no puede abrir «Watch Later», no se guarda.
"""

from __future__ import annotations

import json
import os
import threading
import time
from contextlib import suppress
from datetime import datetime
from pathlib import Path

import yt_dlp
from config import COOKIES_FILE, YT_DLP_CACHE_DIR
from logging_config import get_logger

logger = get_logger(__name__)

# Un cookies.txt de YouTube ocupa unos pocos KB. 512 KB deja margen para una
# exportación completa del navegador sin aceptar un fichero gigante.
MAX_BYTES = 512 * 1024

# Playlist que solo existe con una sesión válida. Sin cookies, yt-dlp recibe
# «The playlist does not exist»; con la sesión iniciada devuelve la lista
# (aunque esté vacía). Es la prueba más fiable y barata que ofrece YouTube.
URL_COMPROBACION = "https://www.youtube.com/playlist?list=WL"

# Nombres de cookies que emite una sesión iniciada de YouTube/Google. Basta
# con una para considerar que el fichero pretende autenticar (la prueba real
# la hace yt-dlp después).
COOKIES_AUTH = frozenset(
    {
        "SID",
        "HSID",
        "SSID",
        "APISID",
        "SAPISID",
        "LOGIN_INFO",
        "__Secure-1PSID",
        "__Secure-3PSID",
        "__Secure-1PAPISID",
        "__Secure-3PAPISID",
    }
)

_lock = threading.Lock()


# ── Formato Netscape ─────────────────────────────────────────────────────────


def _error(mensaje: str) -> dict:
    return {"ok": False, "error": mensaje}


def _lineas(texto: str) -> list[str]:
    """Normaliza saltos de línea y quita el BOM de las exportaciones Windows."""
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    if texto.startswith("\ufeff"):
        texto = texto[1:]
    return texto.split("\n")


def analizar_cookies(texto: str) -> dict:
    """Validar la forma del fichero Netscape (sin salir a la red).

    Devuelve ``{ok, error?, cookies, auth}``. Es la primera barrera: evita
    lanzar una petición a YouTube con un fichero que ni siquiera es de cookies.
    """
    if not isinstance(texto, str) or not texto.strip():
        return _error("Pega el contenido de cookies.txt o elige el fichero.")
    tam = len(texto.encode("utf-8"))
    if tam > MAX_BYTES:
        return _error(
            f"El archivo ocupa {tam // 1024} KB y el máximo es {MAX_BYTES // 1024} KB."
        )

    total = 0
    auth: set[str] = set()
    auth_vigente = False
    youtube = 0
    ahora = time.time()

    for numero, linea in enumerate(_lineas(texto), start=1):
        if not linea.strip():
            continue
        # Las líneas que empiezan por # son comentarios, EXCEPTO el prefijo
        # #HttpOnly_ que algunas exportaciones anteponen al dominio.
        if linea.startswith("#") and not linea.startswith("#HttpOnly_"):
            continue

        campos = linea.split("\t")
        if len(campos) != 7:
            return _error(
                f"La línea {numero} no tiene 7 campos separados por tabuladores. "
                "El archivo debe estar en formato Netscape (cookies.txt)."
            )

        dominio = campos[0]
        if dominio.startswith("#HttpOnly_"):
            dominio = dominio[len("#HttpOnly_") :]
        dominio = dominio.strip().lower()
        nombre = campos[5].strip()
        caduca = campos[4].strip()

        try:
            expira = int(caduca)
        except ValueError:
            return _error(
                f"La línea {numero} tiene una fecha de caducidad que no es un número."
            )

        total += 1
        if "youtube.com" in dominio:
            youtube += 1
        if (
            "youtube.com" in dominio or "google.com" in dominio
        ) and nombre in COOKIES_AUTH:
            auth.add(nombre)
            if expira == 0 or expira > ahora:
                auth_vigente = True

    if total == 0:
        return _error("El archivo no contiene ninguna cookie.")
    if youtube == 0:
        return _error(
            "No hay cookies de youtube.com. Exporta las cookies desde una pestaña "
            "de YouTube con la sesión iniciada."
        )
    if not auth:
        return _error(
            "No se encontraron cookies de sesión de YouTube (SID, SAPISID…). "
            "Inicia sesión en YouTube antes de exportarlas."
        )
    if not auth_vigente:
        return _error(
            "Las cookies de sesión están caducadas. Vuelve a iniciar sesión en "
            "YouTube y exporta cookies.txt de nuevo."
        )

    return {"ok": True, "cookies": total, "auth": len(auth)}


# ── Verificación real contra YouTube ────────────────────────────────────────


def _limpiar_error(mensaje: str) -> str:
    """Mensaje corto y de una línea para enseñarlo en Ajustes."""
    texto = " ".join(str(mensaje).split())
    return texto[:240]


def _probar_sesion(ruta: Path) -> dict:
    """Abrir «Watch Later» con las cookies: si se puede, la sesión es válida."""
    opciones = {
        "cookiefile": str(ruta),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": 20,
        "extract_flat": True,
        "cachedir": str(YT_DLP_CACHE_DIR),
    }
    try:
        with yt_dlp.YoutubeDL(opciones) as ydl:
            info = ydl.extract_info(URL_COMPROBACION, download=False)
    except yt_dlp.utils.DownloadError as exc:
        detalle = _limpiar_error(exc)
        bajo = detalle.lower()
        if (
            "playlist does not exist" in bajo
            or "sign in" in bajo
            or "login" in bajo
            or "private" in bajo
        ):
            return {
                "ok": False,
                "error": (
                    "YouTube no reconoce una sesión válida con estas cookies. "
                    "Inicia sesión en el navegador, entra en YouTube y vuelve a "
                    "exportar cookies.txt."
                ),
            }
        if (
            "unable to download webpage" in bajo
            or "timed out" in bajo
            or "getaddrinfo" in bajo
            or "connection" in bajo
            or "network" in bajo
        ):
            return {
                "ok": False,
                "error": (
                    "No se pudo conectar con YouTube para comprobar las cookies. "
                    "Revisa tu conexión e inténtalo de nuevo; no se guardó nada."
                ),
            }
        return {
            "ok": False,
            "error": f"No se pudieron verificar las cookies: {detalle}",
        }
    except Exception as exc:  # noqa: BLE001 - yt-dlp puede lanzar de todo
        logger.warning("cookies: fallo inesperado al verificar: %s", exc)
        return {
            "ok": False,
            "error": f"No se pudieron verificar las cookies: {_limpiar_error(exc)}",
        }

    if not isinstance(info, dict):
        return {
            "ok": False,
            "error": "YouTube devolvió una respuesta inesperada al comprobar la sesión.",
        }

    return {"ok": True, "metodo": "Watch Later"}


def _fichero_estado() -> Path:
    """Estado de la última verificación, junto a ``cookies.txt``."""
    return COOKIES_FILE.with_name("cookies.estado.json")


def _leer_estado() -> dict | None:
    try:
        datos = json.loads(_fichero_estado().read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    return datos if isinstance(datos, dict) else None


def _guardar_estado(datos: dict) -> None:
    ruta = _fichero_estado()
    tmp = ruta.with_name(f"{ruta.name}.tmp")
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(
            json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(tmp, ruta)
    except OSError as exc:
        logger.warning("cookies: no se pudo escribir el estado: %s", exc)
        with suppress(OSError):
            tmp.unlink(missing_ok=True)


def _sellar_verificacion(resultado: dict) -> dict:
    """Añadir la marca de tiempo y persistir el resultado (ok o error)."""
    datos = {
        **resultado,
        "validado_en": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    _guardar_estado(datos)
    return datos


def verificar_cookies(texto: str) -> dict:
    """Comprobar formato + sesión real. No escribe ``cookies.txt``."""
    forma = analizar_cookies(texto)
    if not forma.get("ok"):
        return forma

    COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = COOKIES_FILE.with_name(
        f".cookies-verificacion-{os.getpid()}-{time.time_ns()}.txt"
    )
    try:
        tmp.write_text(texto, encoding="utf-8")
        with suppress(OSError):
            os.chmod(tmp, 0o600)
        resultado = _probar_sesion(tmp)
    finally:
        with suppress(OSError):
            tmp.unlink(missing_ok=True)

    if resultado.get("ok"):
        resultado["cookies"] = forma.get("cookies", 0)
    return resultado


# ── Guardado / consulta / borrado ────────────────────────────────────────────


def guardar_cookies(texto: str) -> dict:
    """Verificar y, solo si la sesión funciona, guardar ``cookies.txt``.

    Si la verificación falla se conserva el fichero anterior intacto: el
    usuario puede corregir la exportación y reintentar sin perder lo que ya
    tenía.
    """
    with _lock:
        resultado = verificar_cookies(texto)
        if not resultado.get("ok"):
            _sellar_verificacion(resultado)
            return resultado

        tmp = COOKIES_FILE.with_name(
            f".cookies-nuevas-{os.getpid()}-{time.time_ns()}.txt"
        )
        try:
            COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(
                texto.replace("\r\n", "\n").replace("\r", "\n"), encoding="utf-8"
            )
            with suppress(OSError):
                os.chmod(tmp, 0o600)
            os.replace(tmp, COOKIES_FILE)
        except OSError as exc:
            logger.error("cookies: no se pudo guardar: %s", exc)
            with suppress(OSError):
                tmp.unlink(missing_ok=True)
            return _error(
                "No se pudo guardar cookies.txt en el directorio de datos. "
                "Revisa los permisos e inténtalo de nuevo."
            )

        logger.info("cookies: guardadas y verificadas (%s bytes)", len(texto))
        return _sellar_verificacion(
            {
                "ok": True,
                "metodo": "Watch Later",
                "cookies": resultado.get("cookies", 0),
            }
        )


def estado_cookies() -> dict:
    """Estado sin secretos: si hay fichero, tamaño, fecha y última prueba."""
    try:
        info = COOKIES_FILE.stat()
    except OSError:
        return {"configurado": False}
    return {
        "configurado": True,
        "bytes": info.st_size,
        "modificado": datetime.fromtimestamp(info.st_mtime)
        .astimezone()
        .isoformat(timespec="seconds"),
        "verificacion": _leer_estado(),
    }


def comprobar_guardadas() -> dict:
    """Volver a verificar el fichero ya guardado (cookies que caducaron)."""
    with _lock:
        try:
            texto = COOKIES_FILE.read_text(encoding="utf-8")
        except OSError:
            return _error("No hay cookies guardadas que comprobar.")
        resultado = verificar_cookies(texto)
        _sellar_verificacion(resultado)
        return resultado


def borrar_cookies() -> dict:
    """Eliminar cookies y su estado. No falla si ya no existían."""
    with _lock:
        for ruta in (COOKIES_FILE, _fichero_estado()):
            try:
                ruta.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning("cookies: no se pudo borrar %s: %s", ruta, exc)
                return _error("No se pudieron borrar las cookies guardadas.")
        logger.info("cookies: eliminadas por el usuario")
        return {"ok": True}
