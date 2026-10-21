"""OpenWave Backend — Videoclip oficial de una canción.

Para el vídeo de fondo se quiere «el vídeo de la canción», pero en YouTube Music
eso suele ser un *art track* (``MUSIC_VIDEO_TYPE_ATV``): una portada fija con el
audio, no un videoclip. Este módulo busca el videoclip oficial de verdad
(``MUSIC_VIDEO_TYPE_OMV``) con ytmusicapi —solo consulta, sin login ni
descarga— y guarda el resultado en la base de datos para no repetir la
búsqueda al volver a abrir la canción.

La búsqueda se hace con el título y el PRIMER artista de la canción: con la
lista entera de colaboraciones la query se llena de ruido y el videoclip
queda fuera de los primeros resultados.

Solo valen tres señales: que YouTube Music declare el vídeo como videoclip
oficial (``OMV``), que lo haya subido el canal del propio artista o que
lo haya subido el canal del catálogo: el canal de la crew o del sello que
aparece varias veces en la misma búsqueda y delata sus vistas. Una
re-subida de un tercero no cuenta aunque copie el título exacto —así se colaban
los «vídeos letra» de otras personas—: si no hay nada seguro, la canción no
descarga nada.

Si la canción no tiene videoclip oficial se devuelve ``None``: la pantalla de
letras se queda con la portada, sin descargar nada más.
"""

import re
import time
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

# Desfase aceptable sin necesidad de medir: dentro de este margen el vídeo
# suele cuadrar lo bastante con el audio de la app. Si lo supera, el desfase
# se mide comparando las dos pistas (ver desfase.py).
DESAJUSTE_SIN_MEDIDA = 5

# Tope absoluto: si las duraciones se separan muchísimo, lo más probable es
# que sea otro vídeo (o una mezcla). Más allá no se acepta ni midiendo.
_MAX_DESAJUSTE_ABSOLUTO = 120

# Un canal ajeno sin OMV solo vale con vistas que delaten el clip de verdad:
# la crew/sello que sube el catálogo (Behind Me de MDBCrew: 60M) vs las copias
# de otros (una letra ajena suele rondar las 5–500 vistas).
_VISTAS_MINIMAS = 100_000

# Con ruido en el título (los «(Video Lyric)» que la propia banda sube a su
# canal de catálogo) el tope sube: el Video Lyric de MDBCrew pasa del millón,
# las re-subidas de letra ajenas (también con millones) no repiten canal en
# la búsqueda, y esa doble señal es la que separa las dos.
_VISTAS_MINIMAS_CON_RUIDO = 1_000_000

# Cuántas veces tiene que aparecer un canal dentro de la MISMA búsqueda para
# contar como canal del catálogo: los clips de todo el artista salen de su
# crew/sello, y en la búsqueda ese canal se repite (Bardero$ → MDBCrew 10
# veces en «Surfeando la Ola»); los canales de letra aparecen una sola vez.
_SE_REPITE_CANAL = 2

# Vigencia del «esta canción no tiene videoclip»: pasado este tiempo se vuelve
# a preguntar. Un no-resultado puede ser la huella de un fallo puntual (una
# búsqueda degradada) y no puede dejar la canción con la portada durante un día
# entero: se reconsulta en cada hora y los aciertos siguen sin caducar.
VIGENCIA_SIN_CLIP = 60 * 60

# La respuesta de la búsqueda VARÍA entre llamadas: el canal del catálogo
# (MDBCrew) se puede caer de los 20 resultados y pasar de repetirse (visto con
# «Aquella Noche»: en una respuesta no se repetía y no había candidato; en las
# cuatro siguientes, sí). Como el no-resultado se cachea («sin videoclip») una
# hora, la segunda oportunidad va DENTRO del resolver: antes de darse por
# vencida y cachear el negativo, se vuelve a buscar.
_BUSQUEDAS_POR_RESOLUCION = 2
_PAUSA_REBUSCA = 1.5

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


def _artista_principal(artista: str) -> str:
    """Primer artista de la ficha («Bardero$, C.R.O» → «Bardero$»).

    La metadata une los artistas con comas; para la búsqueda basta el
    primero, que es quien encabeza la canción.
    """
    return (artista or "").split(",")[0].strip()


def _vistas(candidato: dict) -> int | None:
    """Vistas del candidato («60M», «2.2M», «381.809») como número.

    YouTube Music formatea las vistas de la búsqueda con sufijos K/M/B y
    separadores; sin campo, ilegible o vacío devuelve ``None``.
    """
    texto = str(candidato.get("views") or "").strip()
    if not texto:
        return None
    t = texto.lower().replace(" ", "")
    sufijo = t[-1:]
    if sufijo in ("k", "m", "b"):
        multiplicador = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}[sufijo]
        try:
            return int(float(t[:-1].replace(",", ".")) * multiplicador)
        except ValueError:
            return None
    try:
        return int(re.sub(r"[.,]", "", t))
    except ValueError:
        return None


def _puntos_titulo(titulo: str, candidato: str, artista: str = "") -> float:
    """Puntos por el título: 3 si es el mismo, 2 si uno contiene al otro.

    La contención se comprueba por palabras completas. Si alguno de los dos
    títulos es corto (menos de cuatro letras) no basta con que la palabra
    aparezca: el resto del título del vídeo tiene que ser el nombre del
    artista, que es lo que separa «C.R.O - MVP'» de «GAS (Deluxe Edition)».
    """
    n_cancion = normalizar_titulo(titulo)
    n_video = normalizar_titulo(candidato)
    if not n_cancion or not n_video:
        return _RECHAZO
    if n_cancion == n_video:
        return 3.0
    if len(n_cancion) < 4 or len(n_video) < 4:
        if _titulo_corto_dentro(n_cancion, n_video, artista):
            return 2.0
        return _RECHAZO
    if _palabras_dentro(n_cancion, n_video) or _palabras_dentro(n_video, n_cancion):
        return 2.0
    return _RECHAZO


def _palabras_dentro(contenido: str, contenedor: str) -> bool:
    """¿Están todas las palabras de ``contenido`` entre las de ``contenedor``?"""
    palabras = contenido.split()
    return bool(palabras) and set(palabras).issubset(set(contenedor.split()))


def _titulo_corto_dentro(cancion: str, video: str, artista: str) -> bool:
    """¿Un título corto cabe en el del vídeo sin más palabras que el artista?

    «mvp» vale en «c r o mvp» (lo que sobra es C.R.O); no valdría en «05 c r o
    542 gas deluxe edition», donde sobran palabras que no son ni la canción ni
    el artista: señal de que es otra versión de la misma canción.
    """
    propias = set(cancion.split())
    if not propias:
        return False
    sobrantes = set(video.split()) - set(_limpiar(artista).split())
    return propias == sobrantes


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
    titulo: str,
    artista: str,
    duracion: int | None,
    candidato: dict,
    catalogo: frozenset[str] = frozenset(),
) -> float:
    """Puntos de un resultado de búsqueda como videoclip oficial de la canción.

    Tiene que ser la misma canción (título) y colgarla el propio artista o
    estar declarada como videoclip oficial (``OMV``; si la sube un canal
    ajeno —un sello, por ejemplo— el artista tiene que aparecer en el
    título). ``catalogo`` trae los canales que se repiten en la misma
    búsqueda (``_canales_repetidos``): la crew o el sello que sube el
    catálogo entero vale aunque no traiga la marca OMV, si sus vistas
    delatan el clip de verdad; con esa señal pasan también los «(Video
    Lyric)» que la propia banda cuelga. No valen las portadas fijas ni las
    re-subidas de terceros: sin OMV, canal del artista o canal del catálogo
    no se puede distinguir el clip original de un «vídeo letra»
    (``_RECHAZO``), igual que un vídeo que dure bastante más o menos que la
    canción: con dos líneas de tiempo distintas el fondo iría desfasado
    respecto a lo que suena. Entre los válidos, el resto de la puntuación
    solo sirve para ordenarlos: el del canal del artista gana a un OMV de un
    canal ajeno, y este a una subida del canal del catálogo.
    """
    titulo_video = candidato.get("title") or ""
    puntos = _puntos_titulo(titulo, titulo_video, artista)
    if puntos <= _RECHAZO:
        return _RECHAZO
    if (candidato.get("videoType") or "") == _ATV or _canal_topic(candidato):
        return _RECHAZO

    ruido = _tiene_ruido(titulo_video, titulo)
    canal_en_catalogo = any(n in catalogo for n in _nombres_canal(candidato))
    vistas = _vistas(candidato)
    if ruido and not canal_en_catalogo:
        # Los «vídeos letra» de otros canales se quedan fuera aunque tengan
        # millones de vistas. Del canal del catálogo puede venir el clip
        # propio: la crew cuelga sus videoclips con el rótulo «(Video
        # Lyric)» (Aquella Noche de Bardero$, MDBCrew: 47M vistas).
        return _RECHAZO

    oficial = (candidato.get("videoType") or "") == _OMV
    if not _limpiar(artista):
        if not oficial:
            # Sin artista no hay canal que comprobar: solo se confía en la
            # marca OMV, que solo trae la música del catálogo oficial.
            return _RECHAZO
        artista_puntos = 0.0
    elif _canal_es_del_artista(artista, candidato):
        if ruido:
            # «C.R.O - Mi Alma (Letra)» en el canal del artista: letra
            # anunciada, no videoclip.
            return _RECHAZO
        artista_puntos = 2.0
    elif oficial and _artista_en_titulo(artista, titulo_video):
        # OMV de un canal ajeno (sello, crew…): vale si el artista aparece en
        # el título. No suma puntos de artista: un OMV del propio artista
        # gana si compite con él.
        artista_puntos = 0.0
    elif canal_en_catalogo:
        # Subida del canal del catálogo (la crew/sello que repite en la
        # búsqueda y va sin marca OMV): las vistas tienen que delatar el clip
        # de verdad y el PRIMER artista tiene que salir en el título. Con
        # ruido el tope sube un orden de magnitud: el «Video Lyric» propio
        # pasa del millón, y las copias de letra ajenas —también con
        # millones— no repiten canal, así que ya cayeron en el corte de
        # arriba.
        minimo = _VISTAS_MINIMAS_CON_RUIDO if ruido else _VISTAS_MINIMAS
        if vistas is None or vistas < minimo:
            return _RECHAZO
        if not _artista_en_titulo(_artista_principal(artista), titulo_video):
            return _RECHAZO
        artista_puntos = 1.0
    else:
        # Re-subida de un tercero: no basta con el artista en el título,
        # porque los «vídeos letra» copian el título exacto. Se descarta y la
        # canción se queda con la portada: mejor nada que un vídeo que no es
        # el original del artista.
        return _RECHAZO

    puntos += artista_puntos
    if oficial:
        puntos += 1.0

    segundos = _segundos(candidato.get("duration"))
    if duracion and segundos:
        desajuste = abs(duracion - segundos)
        if desajuste > _MAX_DESAJUSTE_ABSOLUTO:
            return _RECHAZO
        puntos += 2.0 if desajuste <= 3 else 1.0
    return puntos


def _canales_repetidos(candidatos: list) -> frozenset[str]:
    """Canales que aparecen varias veces en la MISMA búsqueda.

    Los videoclips de todo el catálogo de un artista salen del canal de la
    crew o del sello que los sube: en la búsqueda ese canal se repite
    (Bardero$ → MDBCrew, diez de los veinte resultados de «Surfeando la
    Ola»). Las re-subidas ajenas (letras, boosted…) aparecen una sola vez:
    esa diferencia señala cuál es el canal del catálogo.
    """
    conteo: dict[str, int] = {}
    for candidato in candidatos or []:
        if not isinstance(candidato, dict):
            continue
        for nombre in set(_nombres_canal(candidato)):
            conteo[nombre] = conteo.get(nombre, 0) + 1
    return frozenset(n for n, k in conteo.items() if k >= _SE_REPITE_CANAL)


def _mejor_candidato(
    titulo: str, artista: str, duracion: int | None, candidatos: list
) -> dict | None:
    """Mejor resultado de la búsqueda (o ``None`` si ninguno vale).

    En empate gana el primero de la búsqueda: es la señal de relevancia que da
    YouTube.
    """
    catalogo = _canales_repetidos(candidatos)
    mejor: dict | None = None
    mejores_puntos = _RECHAZO
    for candidato in candidatos or []:
        if not isinstance(candidato, dict) or not candidato.get("videoId"):
            continue
        puntos = puntuar_candidato(
            titulo, artista, duracion, candidato, catalogo=catalogo
        )
        if puntos > _RECHAZO and (mejor is None or puntos > mejores_puntos):
            mejor = candidato
            mejores_puntos = puntos
    return mejor


def elegir_candidato(
    titulo: str, artista: str, duracion: int | None, candidatos: list
) -> str | None:
    """ID del mejor candidato (o ``None`` si ninguno vale)."""
    mejor = _mejor_candidato(titulo, artista, duracion, candidatos)
    return mejor["videoId"] if mejor else None


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


class _BusquedaVaciaError(Exception):
    """YouTube Music no devolvió NINGÚN resultado: fallo de red o de la
    llamada, no «esta canción no tiene videoclip»."""


def _mejor_de_busqueda(cancion: _Cancion) -> dict | None:
    """Una pasada de búsqueda: el mejor candidato o ``None``.

    Lanza ``_BusquedaVaciaError`` si la búsqueda no devuelve NADA: un vacío
    es un fallo de red o de la llamada, no «esta canción no tiene videoclip»,
    y no debe quedarse cacheado como tal.
    """
    query = f"{cancion.titulo} {_artista_principal(cancion.artista)}".strip()
    resultados = get_ytm().search(query, filter="videos", limit=20)
    if not resultados:
        raise _BusquedaVaciaError(f"0 resultados para {cancion.titulo!r}")
    return _mejor_candidato(
        cancion.titulo, cancion.artista, cancion.duracion, resultados
    )


def _buscar_candidato(cancion: _Cancion) -> tuple[str, int | None] | None:
    """Mejor videoclip que cuadre en la búsqueda: ``(vídeo, desajuste)``.

    La búsqueda va con el título y el PRIMER artista
    (``_artista_principal``): con la lista entera de colaboraciones la query
    mete ruido y el videoclip queda fuera de los primeros resultados.

    ``desajuste`` es la diferencia de duración (s) entre la canción y el
    vídeo, o ``None`` si alguna de las dos no la sabe. No se usa para
    rechazar, sino para saber si luego hay que medir el desfase.

    Si una pasada no encuentra candidato se hace una segunda (ver
    ``_BUSQUEDAS_POR_RESOLUCION``): la respuesta de la búsqueda varía entre
    llamadas y el no-resultado se cachearía («sin videoclip») una hora entera
    con una sola pasada. Solo se devuelve sin candidato si las dos pasadas
    quedan sin él; con las DOS vacías el ``_BusquedaVaciaError`` sube.
    """
    intento = None
    for pasada in range(_BUSQUEDAS_POR_RESOLUCION):
        try:
            intento = _mejor_de_busqueda(cancion)
        except _BusquedaVaciaError:
            if pasada + 1 >= _BUSQUEDAS_POR_RESOLUCION:
                raise
        else:
            if intento:
                break
        time.sleep(_PAUSA_REBUSCA)
    if not intento:
        return None
    segundos = _segundos(intento.get("duration"))
    desajuste = None
    if cancion.duracion and segundos:
        desajuste = abs(cancion.duracion - segundos)
    return intento["videoId"], desajuste


def _resolver(video_id: str) -> tuple[str | None, int | None, bool]:
    """``(resultado, desajuste, cacheable)``: ``cacheable`` en falso si falló."""
    cancion = _metadata(video_id)
    if cancion is None:
        # Sin datos (red caída, ytmusic no disponible): se usa el vídeo de la
        # canción como siempre y NO se cachea el no-resultado.
        return video_id, None, False
    if cancion.tipo == _OMV:
        # La canción ya es el videoclip: el audio que suena es el de ese mismo
        # vídeo, así que no hay nada que buscar ni que medir.
        return video_id, 0, True
    try:
        candidato = _buscar_candidato(cancion)
    except _BusquedaVaciaError as e:
        # Sin resultados no se decide nada: se queda la portada esta vez y se
        # vuelve a buscar al reabrir la canción.
        logger.warning("videoclip: búsqueda vacía de %s: %s", video_id, e)
        return None, None, False
    except Exception as e:  # noqa: BLE001
        logger.warning("videoclip: búsqueda de %s: %s", video_id, e)
        return video_id, None, False
    if candidato:
        oficial_id, desajuste = candidato
        return oficial_id, desajuste, True
    # Sin videoclip oficial: la pantalla se queda con la portada y no se
    # descarga nada.
    return None, None, True


def resolver_videoclip(video_id: str, usar_cache: bool = True) -> str | None:
    """ID del videoclip oficial de la canción, o ``None`` si no tiene.

    El resultado se cachea en la base de datos: la consulta se hace una vez por
    canción. Los aciertos no se repiten nunca; los «no tiene» caducan
    (``VIGENCIA_SIN_CLIP``) porque pueden ser la huella de un fallo puntual.
    Si la consulta no se puede completar devuelve el propio id de la canción:
    la pantalla descarga entonces su vídeo, como hacía antes de esta función, y
    no se cachea nada.
    """
    if usar_cache:
        consultado, guardado = db_get_videoclip_oficial(video_id, VIGENCIA_SIN_CLIP)
        if consultado:
            return guardado
    resultado, desajuste, cacheable = _resolver(video_id)
    if cacheable:
        with suppress(Exception):
            db_set_videoclip_oficial(video_id, resultado, desajuste=desajuste)
    return resultado
