"""OpenWave Backend — Fuentes de cookies para yt-dlp.

YouTube limita los formatos (y a veces bloquea la descarga) cuando la petición
no lleva una sesión válida («Sign in to confirm you're not a bot»). Este módulo
centraliza las vías con las que la app se identifica **sin login propio**, de
más fiable a menos:

1. ``cookies.txt`` que el usuario exporte a ``COOKIES_FILE``: estable, no
   depende del navegador ni de un servicio externo. Vía recomendada.
2. Cookies del navegador (``cookiesfrombrowser``), probando los habituales.

No se implementa login con credenciales de la cuenta: es frágil y arriesgado.

El **PO token** (causa raíz de «formato limitado») obliga a resolver el desafío
BotGuard de Google con un servicio externo; la app no lo empaqueta. Si el
usuario instala un plugin de yt-dlp que lo aporte, yt-dlp lo carga por su
cuenta: ninguna opción de aquí lo bloquea.
"""

from config import COOKIES_FILE

# Navegadores con extracción de cookies soportada por yt-dlp, en orden de
# prueba. Chrome/Edge/Brave comparten el formato de cookies de Chromium.
COOKIE_BROWSERS = ("chrome", "firefox", "edge", "brave")


def cookies_file_opt() -> dict | None:
    """Opción ``cookiefile`` si el usuario tiene un ``cookies.txt``.

    Devuelve ``None`` si no existe. Se comprueba en cada llamada (no al
    importar) para que el usuario pueda dejarlo sin reiniciar la app.
    """
    try:
        if COOKIES_FILE.is_file():
            return {"cookiefile": str(COOKIES_FILE)}
    except OSError:
        return None
    return None


def browser_cookie_opts() -> list[dict]:
    """Una opción ``cookiesfrombrowser`` por navegador, en orden de prueba."""
    return [{"cookiesfrombrowser": (browser,)} for browser in COOKIE_BROWSERS]


def auth_variants() -> list[dict]:
    """Opciones de autenticación ordenadas (``cookies.txt`` primero).

    Incluye siempre los navegadores soportados, así que los llamantes deben
    usarla como **respaldo** (intentos finales), no como primera opción: leer
    las cookies del navegador es más lento y tiene coste de privacidad.
    """
    variants: list[dict] = []
    file_opt = cookies_file_opt()
    if file_opt:
        variants.append(file_opt)
    variants.extend(browser_cookie_opts())
    return variants
