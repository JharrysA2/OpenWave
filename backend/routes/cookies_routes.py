"""OpenWave Backend — Rutas de la sesión de YouTube (cookies.txt).

Guardar cookies implica salir a YouTube para comprobar que la sesión es real;
por eso las rutas son síncronas (`def`): FastAPI las ejecuta en su pool de
hilos y no bloquean el streaming ni el resto de la API mientras yt-dlp
responde.
"""

import cookies_store
from fastapi import APIRouter, Request
from pydantic import BaseModel
from rate_limit import limiter

router = APIRouter()


class CookiesBody(BaseModel):
    content: str = ""


@router.get("/settings/cookies")
def estado_cookies():
    """Estado del fichero guardado (sin devolver las cookies)."""
    return cookies_store.estado_cookies()


@router.put("/settings/cookies")
@limiter.limit("10/minute")
def guardar_cookies(body: CookiesBody, request: Request):
    """Verificar contra YouTube y guardar solo si la sesión funciona."""
    return cookies_store.guardar_cookies(body.content)


@router.post("/settings/cookies/check")
@limiter.limit("10/minute")
def comprobar_cookies(request: Request):
    """Volver a comprobar las cookies ya guardadas."""
    return cookies_store.comprobar_guardadas()


@router.delete("/settings/cookies")
def borrar_cookies():
    """Quitar cookies.txt y su último estado de verificación."""
    return cookies_store.borrar_cookies()
