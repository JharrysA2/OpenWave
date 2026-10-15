"""OpenWave Backend — Videoclip oficial de una canción.

Para el vídeo de fondo se quiere «el vídeo de la canción», pero en YouTube Music
eso suele ser un *art track* (``MUSIC_VIDEO_TYPE_ATV``): una portada fija con el
audio, no un videoclip. Este módulo busca el videoclip oficial de verdad
(``MUSIC_VIDEO_TYPE_OMV``) con ytmusicapi —solo consulta, sin login ni
descarga— y guarda el resultado en la base de datos para no repetir la
búsqueda al volver a abrir la canción.

Si la canción no tiene videoclip oficial se devuelve ``None``: la pantalla de
letras se queda con la portada, sin descargar nada más.
"""

import re
import unicodedata
from contextlib import suppress
from typing import NamedTuple

from db import db_get_videoclip_oficial, db_set_videoclip_oficial
from logging_config import get_logger
from ytmusic_client import get_ytm

logger = get_logger(__name__)

# Tipos de vídeo de YouTube Music que importan aquí.
_OMV = "MUSIC_VIDEO_TYPE_OMV"  # videoclip oficial
_ATV = "MUSIC_VIDEO_TYPE_ATV"  # «art track»: portada fija con el audio

# Rechazo rotundo: el candidato no es el videoclip de esta canción.
_RECHAZO = -100.0

# Separación máxima (s) entre la canción y su videoclip. El vídeo de fondo
# sigue el reloj del audio de la app; si las dos grabaciones duran cosas muy
# distintas (el videoclip suele llevar intro, outro o una mezcla aparte), la
# línea de tiempo no cuadra y se ve desfasado toda la canción. Alinearlas
# exigiría comparar el audio, así que en ese caso se prefiere la portada.
_MAX_DESAJUSTE = 5

# Palabras que delatan una versión que NO es el videoclip oficial. Se buscan
# como palabra completa sobre el título normalizado (con paréntesis incluidos:
# «(Official Audio)» también descarta). Si la palabra está también en el título
# de la canción («La Letra»), no cuenta: forma parte del nombre.
_RUIDO = (
    "lyric",
    "lyrics",
    "letra",
    "letras",
    "cover",
    "live",
    "en vivo",
    "en directo",
    "en concierto",
    "remix",
    "instrumental",
    "karaoke",
    "slowed",
    "reverb",
    "reaction",
    "acapella",
    "a capella",
    "sped up",
    "speed up",
    "nightcore",
    "mashup",
    "8d",
    "audio",
    "tutorial",
    "type beat",
)

_PARENTESIS = re.compile(r"[\(\[\{][^\)\]\}]*[\)\]\}]")
_NO_ALFA = re.compile(r"[^a-z0-9]+")


class _Cancion(NamedTuple):
    """Ficha de la canción tal como la cuenta YouTube Music."""

    titulo: str
    artista: str
    duracion: int | None
    tipo: str


def _limpiar(texto) -> str:
    """Minúsculas, sin acentos ni signos; deja letras, números y espacios."""
    s = unicodedata.normalize("NFKD", str(texto or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return _NO_ALFA.sub(" ", s).strip()


def normalizar_titulo(texto) -> str:
    """Título comparable: sin acentos, sin signos y sin el contenido entre
    paréntesis (``«Mi Alma (Official Video)»`` → ``«mi alma»``)."""
    return _limpiar(_PARENTESIS.sub(" ", str(texto or "")))


def _segundos(duracion) -> int | None:
    """Duración de YouTube Music a segundos: «3:16» → 196, 196 → 196."""
    if isinstance(duracion, (int, float)) and not isinstance(duracion, bool):
        return int(duracion) if duracion > 0 else None
    partes = [int(p) for p in re.findall(r"\d+", str(duracion or ""))]
    if not partes:
        return None
    segundos = 0
    for p in partes:
        segundos = segundos * 60 + p
    return segundos or None


def _puntos_titulo(titulo: str, candidato: str) -> float:
    """Puntos por el título: 3 si es el mismo, 2 si uno contiene al otro."""
    n_cancion = normalizar_titulo(titulo)
    n_video = normalizar_titulo(candidato)
    if not n_cancion or not n_video:
        return _RECHAZO
    if n_cancion == n_video:
        return 3.0
    if len(n_cancion) >= 4 and n_cancion in n_video:
        return 2.0
    if len(n_video) >= 4 and n_video in n_cancion:
        return 2.0
    return _RECHAZO


def _nombres_canal(candidato: dict) -> list[str]:
    """Nombres del canal que subió el vídeo, normalizados."""
    return [
        _limpiar(a.get("name"))
        for a in (candidato.get("artists") or [])
        if isinstance(a, dict) and a.get("name")
    ]


def _canal_es_del_artista(artista: str, candidato: dict) -> bool:
    """¿El canal del vídeo es el artista de la canción (o su sello, con él)?

    Se compara por nombre completo y por subconjunto de palabras: «Homer el
    Mero Mero, C.R.O, Bardero$» (canción) contra «C.R.O» (canal) vale.
    """
    n_cancion = _limpiar(artista)
    if not n_cancion:
        return False
    tokens_cancion = set(n_cancion.split())
    for nombre in _nombres_canal(candidato):
        if nombre == n_cancion or nombre in n_cancion or n_cancion in nombre:
            return True
        tokens = set(nombre.split())
        if tokens and tokens.issubset(tokens_cancion):
            return True
    return False


def _canal_topic(candidato: dict) -> bool:
    """¿Lo sube un canal «- Topic»? Son portadas fijas con el audio de la app."""
    return any(nombre.endswith("topic") for nombre in _nombres_canal(candidato))


def _artista_en_titulo(artista: str, titulo: str) -> bool:
    n_cancion = _limpiar(artista)
    return bool(n_cancion) and len(n_cancion) >= 3 and n_cancion in _limpiar(titulo)


def _tiene_ruido(titulo_video, titulo_cancion) -> bool:
    """¿El título anuncia una versión que no es el videoclip oficial?

    Una palabra de aviso («cover», «lyric»…) no cuenta si está en el propio
    título de la canción: entonces es parte del nombre, no una versión.
    """
    n_video = _limpiar(titulo_video)
    n_cancion = _limpiar(titulo_cancion)
    for palabra in _RUIDO:
        patron = re.compile(rf"(?:^|\s){re.escape(palabra)}(?:\s|$)")
        if patron.search(n_video) and not patron.search(n_cancion):
            return True
    return False


def puntuar_candidato(
    titulo: str, artista: str, duracion: int | None, candidato: dict
) -> float:
    """Puntos de un resultado de búsqueda como videoclip oficial de la canción.

    Tiene que ser la misma canción (título), subirla el propio artista y no ser
    una portada fija ni una versión anunciada como no oficial (letra, cover,
    directo, remix…). Cualquiera de esos casos devuelve ``_RECHAZO``, igual que
    un vídeo que dure bastante más o menos que la canción: con dos líneas de
    tiempo distintas el fondo iría desfasado respecto a lo que suena. Entre los
    candidatos válidos, el resto de la puntuación solo sirve para ordenarlos:
    un vídeo declarado como videoclip oficial (``OMV``) gana al resto.
    """
    titulo_video = candidato.get("title") or ""
    puntos = _puntos_titulo(titulo, titulo_video)
    if puntos <= _RECHAZO:
        return _RECHAZO
    if (candidato.get("videoType") or "") == _ATV or _canal_topic(candidato):
        return _RECHAZO
    if _tiene_ruido(titulo_video, titulo):
        return _RECHAZO

    oficial = (candidato.get("videoType") or "") == _OMV
    if not _limpiar(artista):
        artista_puntos = 0.0  # canción sin artista: decide el título
    elif _canal_es_del_artista(artista, candidato):
        artista_puntos = 2.0
    elif oficial and _artista_en_titulo(artista, titulo_video):
        # Canal de sello, VEVO o re-subida: solo se acepta si YouTube lo marca
        # como videoclip oficial y el artista aparece en el título.
        puntos += 1.0
        artista_puntos = 0.0
    else:
        return _RECHAZO

    puntos += artista_puntos
    if (candidato.get("videoType") or "") == _OMV:
        puntos += 1.0

    segundos = _segundos(candidato.get("duration"))
    if duracion and segundos:
        desajuste = abs(duracion - segundos)
        if desajuste > _MAX_DESAJUSTE:
            return _RECHAZO
        puntos += 2.0 if desajuste <= 3 else 1.0
    return puntos


def elegir_candidato(
    titulo: str, artista: str, duracion: int | None, candidatos: list
) -> str | None:
    """ID del mejor candidato (o ``None`` si ninguno vale).

    En empate gana el primero de la búsqueda: es la señal de relevancia que da
    YouTube.
    """
    mejor: str | None = None
    mejores_puntos = _RECHAZO
    for candidato in candidatos or []:
        if not isinstance(candidato, dict) or not candidato.get("videoId"):
            continue
        puntos = puntuar_candidato(titulo, artista, duracion, candidato)
        if puntos > _RECHAZO and (mejor is None or puntos > mejores_puntos):
            mejor = candidato["videoId"]
            mejores_puntos = puntos
    return mejor


def _metadata(video_id: str) -> _Cancion | None:
    """Ficha de la canción según YouTube Music (o ``None`` si no hay datos).

    ``get_watch_playlist`` da la ficha «de canción» (incluido ``videoType``),
    pero falla con algunos ids; ``get_song`` es el plan B (sin tipo). Devuelve
    ``None`` si ninguna de las dos responde: sin datos no se inventa nada.
    """
    try:
        ytm = get_ytm()
    except Exception as e:  # noqa: BLE001
        logger.warning("videoclip: ytmusic no disponible: %s", e)
        return None
    with suppress(Exception):
        canciones = (ytm.get_watch_playlist(video_id, limit=1) or {}).get(
            "tracks"
        ) or []
        if canciones:
            t = canciones[0]
            return _Cancion(
                titulo=str(t.get("title") or ""),
                artista=", ".join(
                    str(a.get("name") or "")
                    for a in (t.get("artists") or [])
                    if isinstance(a, dict)
                ),
                duracion=_segundos(t.get("length")),
                tipo=str(t.get("videoType") or ""),
            )
    with suppress(Exception):
        detalles = (ytm.get_song(video_id) or {}).get("videoDetails") or {}
        if detalles.get("title"):
            return _Cancion(
                titulo=str(detalles.get("title")),
                artista=str(detalles.get("author") or ""),
                duracion=_segundos(detalles.get("lengthSeconds")),
                tipo="",
            )
    return None


def _buscar_candidato(cancion: _Cancion) -> str | None:
    """Primer videoclip que cuadre en la búsqueda de vídeos de esa canción."""
    resultados = get_ytm().search(
        f"{cancion.titulo} {cancion.artista}".strip(), filter="videos", limit=20
    )
    return elegir_candidato(
        cancion.titulo, cancion.artista, cancion.duracion, resultados
    )


def _resolver(video_id: str) -> tuple[str | None, bool]:
    """``(resultado, cacheable)``: ``cacheable`` en falso si la consulta falló."""
    cancion = _metadata(video_id)
    if cancion is None:
        # Sin datos (red caída, ytmusic no disponible): se usa el vídeo de la
        # canción como siempre y NO se cachea el no-resultado.
        return video_id, False
    if cancion.tipo == _OMV:
        return video_id, True  # ya es el videoclip: no hay nada que buscar
    try:
        candidato = _buscar_candidato(cancion)
    except Exception as e:  # noqa: BLE001
        logger.warning("videoclip: búsqueda de %s: %s", video_id, e)
        return video_id, False
    if candidato:
        return candidato, True
    # Sin videoclip oficial: la pantalla se queda con la portada y no se
    # descarga nada (el vídeo de la canción sería la portada hecha vídeo).
    return None, True


def resolver_videoclip(video_id: str, usar_cache: bool = True) -> str | None:
    """ID del videoclip oficial de la canción, o ``None`` si no tiene.

    El resultado (incluido el «no tiene») se cachea en la base de datos: la
    consulta se hace una vez por canción. Si la consulta no se puede completar
    devuelve el propio id de la canción: la pantalla descarga entonces su
    vídeo, como hacía antes de esta función, y no se cachea nada.
    """
    if usar_cache:
        consultado, guardado = db_get_videoclip_oficial(video_id)
        if consultado:
            return guardado
    resultado, cacheable = _resolver(video_id)
    if cacheable:
        with suppress(Exception):
            db_set_videoclip_oficial(video_id, resultado)
    return resultado
