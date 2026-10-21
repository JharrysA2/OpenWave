"""OpenWave Backend — Estado y reparación de la identidad de Windows."""

import identity
from fastapi import APIRouter, Request
from rate_limit import limiter

router = APIRouter()


@router.get("/settings/identity")
def estado_identidad():
    """¿Está registrado el paquete sparse de OpenWave? (sin elevar nada)."""
    return identity.estado_identidad()


@router.post("/settings/identity/repair")
@limiter.limit("3/minute")
def reparar_identidad(request: Request):
    """Re-registrar el paquete con UAC (solo Windows instalado)."""
    return identity.reparar_identidad()
