"""
SoundWave Backend — Configuración de Rate Limiting con SlowAPI.
Centraliza el limiter y la key function para usar en toda la app.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Limiter compartido — solo aplica límites donde se usa @limiter.limit()
# Las rutas sin decorador NO tienen rate limit (solo las pesadas tienen límite explícito)
limiter = Limiter(key_func=get_remote_address)
