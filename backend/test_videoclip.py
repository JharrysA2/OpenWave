"""Tests para backend/videoclip.py — Videoclip oficial de una canción."""

from db import (
    db_get_videoclip_oficial,
    db_set_videoclip_oficial,
    get_db,
    init_db,
)
from videoclip import (
    VIGENCIA_SIN_CLIP,
    _artista_principal,
    _canales_repetidos,
    _segundos,
    _vistas,
    elegir_candidato,
    normalizar_titulo,
    puntuar_candidato,
    resolver_videoclip,
)

ATV = "MUSIC_VIDEO_TYPE_ATV"
OMV = "MUSIC_VIDEO_TYPE_OMV"


class _YtmFalso:
    """YTMusic de mentira: solo los tres endpoints que usa el módulo."""

    def __init__(
        self, watch=None, search=None, song=None, fallar_todo=False, searches=None
    ):
        self._watch = watch
        self._search = search
        self._song = song
        self._fallar_todo = fallar_todo
        # Respuestas distintas por llamada (la búsqueda varía entre pasadas);
        # la última se repite mientras se siga llamando.
        self._searches = searches
        # Registro de búsquedas: para comprobar la query que se lanza.
        self.queries: list[str] = []

    def get_watch_playlist(self, video_id, limit=1):
        if self._fallar_todo or self._watch is None:
            raise KeyError("endpoint")
        return self._watch

    def get_song(self, video_id):
        if self._fallar_todo or self._song is None:
            raise RuntimeError("sin get_song")
        return self._song

    def search(self, query, filter=None, limit=20):
        self.queries.append(query)
        if self._searches is not None:
            pasada = min(len(self.queries) - 1, len(self._searches) - 1)
            return self._searches[pasada]
        if isinstance(self._search, Exception):
            raise self._search
        return self._search or []


def _watch(titulo, artista, duracion, tipo):
    return {
        "tracks": [
            {
                "title": titulo,
                "artists": [{"name": artista}],
                "length": duracion,
                "videoType": tipo,
            }
        ]
    }


def _video(video_id, titulo, artista, duracion, tipo=OMV):
    return {
        "videoId": video_id,
        "title": titulo,
        "artists": [{"name": artista}],
        "duration": duracion,
        "videoType": tipo,
    }


def _envejecer(video_id: str, horas: float | None = None) -> None:
    """Retrasar la marca del «no tiene»: simula una resolución antigua."""
    horas = VIGENCIA_SIN_CLIP / 3600 + 1 if horas is None else horas
    with get_db() as conn:
        conn.execute(
            "UPDATE videoclip_oficial "
            "SET resuelto_at = strftime('%Y-%m-%dT%H:%M:%S','now', ?) "
            "WHERE video_id = ?",
            (f"-{horas} hours", video_id),
        )


class TestNormalizar:
    """Normalización de textos y duraciones."""

    def test_titulo_sin_acentos_ni_parentesis(self):
        assert normalizar_titulo("MAMI DÓNDESTÁS? (Official Video)") == "mami dondestas"

    def test_titulo_vacio(self):
        assert normalizar_titulo(None) == ""

    def test_segundos_de_texto(self):
        assert _segundos("3:16") == 196
        assert _segundos("1:02:03") == 3723

    def test_segundos_de_numero_y_vacio(self):
        assert _segundos(196) == 196
        assert _segundos("") is None
        assert _segundos(0) is None


class TestAyudas:
    """Helpers de la puntuación: artista principal, vistas y canales."""

    def test_artista_principal_es_el_primero(self):
        """De la lista unida con comas, el que encabeza la canción."""
        assert _artista_principal("Bardero$, C.R.O, Homer el Mero Mero") == "Bardero$"
        assert _artista_principal("  C.R.O  ") == "C.R.O"
        assert _artista_principal("Bardero$") == "Bardero$"
        assert _artista_principal("") == ""

    def test_vistas_lee_los_formatos_de_youtube(self):
        """«60M», «2.2M», «381.809» o el número pelado."""
        assert _vistas({"views": "60M"}) == 60_000_000
        assert _vistas({"views": "2.2M"}) == 2_200_000
        assert _vistas({"views": "136K"}) == 136_000
        assert _vistas({"views": "381.809"}) == 381_809
        assert _vistas({"views": "37"}) == 37
        assert _vistas({"views": ""}) is None
        assert _vistas({}) is None
        assert _vistas({"views": "sin vistas"}) is None

    def test_canales_repetidos_marca_el_canal_del_catalogo(self):
        """El canal que aparece dos veces queda marcado; el suelto, no.

        La crew sube todo el catálogo (aparece varias veces en la búsqueda);
        los canales de letras o re-subidas aparecen una sola vez.
        """
        catalogo = _canales_repetidos(
            [
                _video("a", "Surfeando la Ola", "MDBCrew", "3:38", tipo=""),
                _video("b", "Otra de Bardero$", "MDBCrew", "3:00", tipo=""),
                _video("c", "Otra más", "Gaan.", "3:00", tipo=""),
                "no es un dict",
                {"videoId": "sin_canal"},
            ]
        )
        assert catalogo == frozenset({"mdbcrew"})
        assert _canales_repetidos([]) == frozenset()
        assert _canales_repetidos(None) == frozenset()

    def test_canales_repetidos_con_dos_apariciones(self):
        """Una sola aparición no marca el canal; con dos, sí."""
        assert (
            _canales_repetidos([_video("a", "T1", "MDBCrew", "3:00", tipo="")])
            == frozenset()
        )
        dos = _canales_repetidos(
            [
                _video("a", "T1", "MDBCrew", "3:00", tipo=""),
                _video("b", "T2", "MDBCrew", "3:00", tipo=""),
            ]
        )
        assert dos == frozenset({"mdbcrew"})


class TestPuntuacion:
    """Puntuación de cada resultado de búsqueda."""

    def test_videoclip_oficial_puntua_alto(self):
        puntos = puntuar_candidato(
            "Mi Alma",
            "C.R.O",
            196,
            _video("ok", "C.R.O - Mi Alma (Official Video)", "C.R.O", "3:16"),
        )
        assert puntos > 0

    def test_art_track_se_rechaza(self):
        """La portada fija es justo lo que no queremos."""
        puntos = puntuar_candidato(
            "Mi Alma",
            "C.R.O",
            196,
            _video("atv", "Mi Alma", "C.R.O - Topic", "3:16", tipo=""),
        )
        assert puntos < 0

    def test_art_track_declarado_se_rechaza(self):
        assert (
            puntuar_candidato(
                "Mi Alma",
                "C.R.O",
                196,
                _video("atv", "Mi Alma", "C.R.O", "3:16", tipo=ATV),
            )
            < 0
        )

    def test_letra_o_cover_se_rechaza(self):
        assert (
            puntuar_candidato(
                "Mi Alma",
                "C.R.O",
                196,
                _video("letra", "C.R.O - Mi Alma (Lyric Video)", "C.R.O", "3:16"),
            )
            < 0
        )
        assert (
            puntuar_candidato(
                "Mi Alma",
                "C.R.O",
                196,
                _video("cover", "Mi Alma (Cover)", "C.R.O", "3:16"),
            )
            < 0
        )

    def test_palabra_de_aviso_dentro_del_titulo_no_cuenta(self):
        """«La Letra» es el nombre de la canción, no una versión con letra."""
        assert (
            puntuar_candidato(
                "La Letra",
                "C.R.O",
                196,
                _video("ok", "C.R.O - La Letra (Video Oficial)", "C.R.O", "3:16"),
            )
            > 0
        )

    def test_otro_artista_se_rechaza(self):
        puntos = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("otro", "Mi Alma", "Otro Artista", "3:16")
        )
        assert puntos < 0

    def test_otra_cancion_se_rechaza(self):
        puntos = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("otra", "Otra Canción", "C.R.O", "3:16")
        )
        assert puntos < 0

    def test_artista_en_el_titulo_suma_menos(self):
        """Canal de sello con un videoclip oficial declarado: vale, pero menos."""
        con_canal = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("a", "C.R.O - Mi Alma", "C.R.O", "3:16")
        )
        sin_canal = puntuar_candidato(
            "Mi Alma",
            "C.R.O",
            196,
            _video("b", "C.R.O - Mi Alma", "Sello Musical", "3:16"),
        )
        assert 0 < sin_canal < con_canal

    def test_canal_ajeno_sin_artista_en_el_titulo_se_rechaza(self):
        """Canal ajeno y sin el artista en el título: no es el videoclip."""
        assert (
            puntuar_candidato(
                "Aquella Noche",
                "Bardero$",
                191,
                _video(
                    "fan",
                    "Aquella Noche",
                    "Daniela Lipa",
                    "3:11",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
            )
            < 0
        )

    def test_canal_ajeno_con_el_artista_en_el_titulo_se_rechaza(self):
        """Sin OMV, canal del artista o canal del catálogo, el título no basta.

        «Behind Me» lo sube la crew (MDBCrew) sin marca OMV, pero también los
        «vídeos letra» copian el título exacto («behind me [letra]»). Sin la
        señal del catálogo (canal repetido + vistas) no se distinguen: se
        descarta y la canción se queda con la portada.
        """
        assert (
            puntuar_candidato(
                "Behind Me",
                "C.R.O & Fazzini",
                299,
                _video(
                    "sello",
                    "C.R.O & Fazzini - Behind Me (OfficialVideo)",
                    "mdbcrew",
                    "5:00",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
            )
            < 0
        )

    def test_canal_del_catalogo_con_vistas_se_acepta(self):
        """«Behind Me» de MDBCrew: sin OMV, pero canal del catálogo y 60M vistas.

        MDBCrew repite en la búsqueda —es el canal de la crew, sube todo el
        catálogo— y el vídeo real pasa de los 60M vistas: vistas + canal
        repetido recupera el clip que la regla de solo-OMV dejaba en portada.
        """
        puntos = puntuar_candidato(
            "Behind Me",
            "C.R.O & Fazzini",
            299,
            dict(
                _video(
                    "crew",
                    "C.R.O & Fazzini - Behind Me (OfficialVideo)",
                    "MDBCrew",
                    "5:00",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
                views="60M",
            ),
            catalogo=frozenset({"mdbcrew"}),
        )
        assert puntos > 0

    def test_canal_del_catalogo_sin_vistas_se_rechaza(self):
        """El canal del catálogo sin vistas (o sin saberlas) no vale."""
        assert (
            puntuar_candidato(
                "Behind Me",
                "C.R.O & Fazzini",
                299,
                _video(
                    "crew",
                    "C.R.O & Fazzini - Behind Me (OfficialVideo)",
                    "MDBCrew",
                    "5:00",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
                catalogo=frozenset({"mdbcrew"}),
            )
            < 0
        )

    def test_video_lyric_del_canal_del_catalogo_se_acepta(self):
        """Caso real: «2. AQUELLA NOCHE - BARDERO$ (Video Lyric)» de MDBCrew.

        La banda cuelga su videoclip con el rótulo «(Video Lyric)» en su
        canal de catálogo y 47M vistas: es el clip de verdad. El ruido del
        título solo pasa con canal repetido y vistas del millón.
        """
        puntos = puntuar_candidato(
            "Aquella Noche",
            "Bardero$",
            191,
            dict(
                _video(
                    "crew",
                    "2. AQUELLA NOCHE - BARDERO$ (Video Lyric)",
                    "MDBCrew",
                    "3:10",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
                views="47M",
            ),
            catalogo=frozenset({"mdbcrew"}),
        )
        assert puntos > 0

    def test_video_letra_ajeno_con_millones_de_vistas_se_rechaza(self):
        """Caso real: «bardero$ - bandida [letra]» de un canal ajeno, 18M vistas.

        Los canales de letra ajenos también llegan a millones de vistas; lo
        que los separa del «(Video Lyric)» del catálogo es que su canal no
        repite en la búsqueda: sin esa señal, fuera.
        """
        assert (
            puntuar_candidato(
                "Bandida",
                "Bardero$",
                224,
                dict(
                    _video(
                        "letra",
                        "bardero$ - bandida [letra]",
                        "爱 offering",
                        "3:44",
                        tipo="MUSIC_VIDEO_TYPE_UGC",
                    ),
                    views="18M",
                ),
                catalogo=frozenset({"mdbcrew"}),
            )
            < 0
        )

    def test_video_lyric_del_catalogo_con_vistas_bajas_se_rechaza(self):
        """El rótulo «(Video Lyric)» sin las vistas del millón no vale."""
        assert (
            puntuar_candidato(
                "Aquella Noche",
                "Bardero$",
                191,
                dict(
                    _video(
                        "lyric",
                        "2. AQUELLA NOCHE - BARDERO$ (Video Lyric)",
                        "MDBCrew",
                        "3:10",
                        tipo="MUSIC_VIDEO_TYPE_UGC",
                    ),
                    views="136K",
                ),
                catalogo=frozenset({"mdbcrew"}),
            )
            < 0
        )

    def test_canal_del_catalogo_con_otro_artista_en_el_titulo_se_rechaza(self):
        """El canal del catálogo solo vale para ESTA canción: el artista que
        encabeza tiene que salir en el título."""
        assert (
            puntuar_candidato(
                "Aquella Noche",
                "Bardero$",
                191,
                dict(
                    _video(
                        "otros",
                        "AQUELLA NOCHE - LOS LOBOS (Video Lyric)",
                        "MDBCrew",
                        "3:10",
                        tipo="MUSIC_VIDEO_TYPE_UGC",
                    ),
                    views="47M",
                ),
                catalogo=frozenset({"mdbcrew"}),
            )
            < 0
        )

    def test_video_letra_sin_marcar_con_titulo_exacto_se_rechaza(self):
        """Caso real: «TU RECUERDO - C.R.O» (canal Trap SAD) es un vídeo letra.

        Puntúa alto con el criterio viejo (título exacto, duración cuadrada y
        el artista en el título) y se colaba si el OMV no salía en la
        búsqueda: ahora, sin OMV ni canal del artista, no vale.
        """
        assert (
            puntuar_candidato(
                "Tu Recuerdo",
                "C.R.O",
                149,
                _video(
                    "letra_trampa",
                    "TU RECUERDO - C.R.O",
                    "Trap SAD",
                    "2:28",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
            )
            < 0
        )

    def test_sin_artista_solo_se_confia_en_omv(self):
        """Sin artista no hay canal que comprobar: solo la marca OMV vale."""
        assert (
            puntuar_candidato(
                "Mi Alma", "", 196, _video("omv", "Mi Alma", "Canal X", "3:16")
            )
            > 0
        )
        assert (
            puntuar_candidato(
                "Mi Alma",
                "",
                196,
                _video(
                    "ugc", "Mi Alma", "Canal X", "3:16", tipo="MUSIC_VIDEO_TYPE_UGC"
                ),
            )
            < 0
        )

    def test_duracion_muy_distinta_se_rechaza(self):
        """Con dos líneas de tiempo distintas el fondo iría desfasado."""
        assert (
            puntuar_candidato(
                "Mi Alma", "C.R.O", 196, _video("a", "Mi Alma", "C.R.O", "9:45")
            )
            < 0
        )

    def test_videoclip_un_poco_mas_largo_se_acepta(self):
        """Caso real: el clip de «After House» dura 30 s más que la canción.

        Ese desajuste ya no descarta el vídeo: se acepta y su desfase con la
        canción se mide al prepararlo (ver desfase.py).
        """
        assert (
            puntuar_candidato(
                "After House",
                "C.R.O & Cazzu",
                165,
                _video("clip", "After House", "C.R.O", "3:15"),
            )
            > 0
        )

    def test_videoclip_con_desajuste_absurdo_se_rechaza(self):
        """Más de 2 min de diferencia: es otro vídeo, no se acepta ni midiendo."""
        assert (
            puntuar_candidato(
                "Mi Alma", "C.R.O", 196, _video("otro", "Mi Alma", "C.R.O", "5:30")
            )
            < 0
        )

    def test_duracion_casi_igual_puntua_mas(self):
        """Cuanto mejor cuadran las duraciones, menos deriva."""
        exacta = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("a", "Mi Alma", "C.R.O", "3:16")
        )
        aproximado = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("b", "Mi Alma", "C.R.O", "3:20")
        )
        assert 0 < aproximado < exacta

    def test_titulo_corto_cuenta_si_lo_que_sobra_es_el_artista(self):
        """Caso real: la canción se llama «MVP'» y el vídeo «C.R.O - MVP'»."""
        assert (
            puntuar_candidato(
                "MVP'",
                "C.R.O",
                138,
                _video("clip", "C.R.O - MVP' (Video Oficial)", "C.R.O", "2:19"),
            )
            > 0
        )

    def test_titulo_corto_con_palabras_de_mas_se_rechaza(self):
        """Caso real: «Gas» no se queda con «GAS (Deluxe Edition)»: el título
        corto coincide, pero sobran palabras de una versión de la canción."""
        assert (
            puntuar_candidato(
                "Gas",
                "C.R.O",
                146,
                _video(
                    "deluxe",
                    "05. C.R.O - 542 - GAS (Deluxe Edition)",
                    "MDBCrew",
                    "2:30",
                ),
            )
            < 0
        )


class TestElegir:
    """Elección del mejor candidato."""

    def test_elige_el_videoclip_y_no_el_art_track(self):
        elegido = elegir_candidato(
            "Mi Alma",
            "C.R.O",
            196,
            [
                _video("atv", "Mi Alma", "C.R.O - Topic", "3:16", tipo=ATV),
                _video("clipe", "C.R.O - Mi Alma (Official Video)", "C.R.O", "3:16"),
            ],
        )
        assert elegido == "clipe"

    def test_prefiere_el_que_mas_puntua(self):
        elegido = elegir_candidato(
            "Mi Alma",
            "C.R.O",
            196,
            [
                _video("menos", "C.R.O - Mi Alma (Video Oficial)", "C.R.O", "3:16"),
                _video("mas", "Mi Alma", "C.R.O", "3:16"),
            ],
        )
        assert elegido == "mas"

    def test_descarta_una_version_en_directo(self):
        assert (
            elegir_candidato(
                "Mi Alma",
                "C.R.O",
                196,
                [_video("live", "Mi Alma (En Directo)", "C.R.O", "3:16")],
            )
            is None
        )

    def test_sin_candidatos_validos_devuelve_none(self):
        assert (
            elegir_candidato(
                "Aquella Noche",
                "Bardero$",
                200,
                [
                    _video(
                        "letra", "Bardero$ - Aquella Noche (Lyric)", "Bardero$", "3:20"
                    ),
                    _video("cover", "Aquella Noche (Cover)", "Bardero$", "3:20"),
                ],
            )
            is None
        )

    def test_ignora_resultados_sin_video_id(self):
        assert elegir_candidato("Mi Alma", "C.R.O", 196, [{"title": "Mi Alma"}]) is None


class TestResolver:
    """Resolución completa (búsqueda + caché)."""

    def test_art_track_busca_y_devuelve_el_videoclip(self, monkeypatch):
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=_watch("Mi Alma", "C.R.O", "3:16", ATV),
                search=[
                    _video("clipe", "C.R.O - Mi Alma (Official Video)", "C.R.O", "3:16")
                ],
            ),
        )
        assert resolver_videoclip("of_atv_ok") == "clipe"
        # Queda cacheado (incluido el caso positivo).
        assert db_get_videoclip_oficial("of_atv_ok") == (True, "clipe")

    def test_la_busqueda_va_con_el_primer_artista(self, monkeypatch):
        """La query es «título + primer artista», no la lista entera.

        Con «Bardero$, C.R.O, Homer el Mero Mero» la query larga mete ruido
        en YouTube y el videoclip queda fuera de los 20 resultados.
        """
        ytm = _YtmFalso(
            watch=_watch(
                "Historia sin Fin",
                "Bardero$, C.R.O, Homer el Mero Mero",
                "3:29",
                ATV,
            ),
            search=[_video("clipe", "C.R.O - Historia sin Fin", "C.R.O", "3:16")],
        )
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        assert resolver_videoclip("of_query_primer") == "clipe"
        assert ytm.queries == ["Historia sin Fin Bardero$"]

    def test_el_canal_del_catalogo_se_descubre_en_la_busqueda(self, monkeypatch):
        """Vía completa: MDBCrew repite en la búsqueda y el clip de la crew pasa.

        Caso real: «Surfeando la Ola» de Bardero$, Frane. El clip lo sube
        MDBCrew sin marca OMV («Bardero$ - Feat Frane - Surfeando la Ola»,
        2.2M vistas); la letra de otro canal aparece una sola vez.
        """
        ytm = _YtmFalso(
            watch=_watch("Surfeando la Ola", "Bardero$, Frane", "3:38", ATV),
            search=[
                dict(
                    _video(
                        "letra",
                        "Bardero$ - Surfeando La Ola (Letra)",
                        "Gaan.",
                        "2:41",
                        tipo="MUSIC_VIDEO_TYPE_UGC",
                    ),
                    views="136K",
                ),
                _video("otra", "Bardero$ - Blow (Prod. XRIZ)", "MDBCrew", "2:48"),
                dict(
                    _video(
                        "crew",
                        "Bardero$ - Feat Frane  - Surfeando la Ola",
                        "MDBCrew",
                        "3:38",
                        tipo="MUSIC_VIDEO_TYPE_UGC",
                    ),
                    views="2.2M",
                ),
            ],
        )
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        assert resolver_videoclip("of_crew") == "crew"

    def test_la_segunda_busqueda_recupera_el_clip(self, monkeypatch):
        """La respuesta de la búsqueda varía: se repite la pasada sin candidato.

        Caso real medido con «Surfeando la Ola»: en una respuesta el canal del
        catálogo (MDBCrew) no se llega a repetir y ninguna subida pasa; en la
        siguiente se repite y ahí está el clip. Como el no-resultado se
        cachea («sin videoclip») una hora, la segunda oportunidad va dentro
        del resolver — es lo que antes solo conseguía el «Reintentar» del
        usuario, y solo a partir de la caducidad.
        """
        ytm = _YtmFalso(
            watch=_watch("Surfeando la Ola", "Bardero$, Frane", "3:38", ATV),
            searches=[
                # 1.ª pasada: letra ajena suelta, nobody repite.
                [
                    dict(
                        _video(
                            "letra",
                            "Bardero$ - Surfeando La Ola (Letra)",
                            "Gaan.",
                            "2:41",
                            tipo="MUSIC_VIDEO_TYPE_UGC",
                        ),
                        views="136K",
                    )
                ],
                # 2.ª pasada: la crew se repite y el clip pasa.
                [
                    _video("otra", "Bardero$ - Blow (Prod. XRIZ)", "MDBCrew", "2:48"),
                    dict(
                        _video(
                            "crew",
                            "Bardero$ - Feat Frane  - Surfeando la Ola",
                            "MDBCrew",
                            "3:38",
                            tipo="MUSIC_VIDEO_TYPE_UGC",
                        ),
                        views="2.2M",
                    ),
                ],
            ],
        )
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        monkeypatch.setattr("videoclip._PAUSA_REBUSCA", 0)
        assert resolver_videoclip("of_rebusca") == "crew"
        assert ytm.queries == ["Surfeando la Ola Bardero$"] * 2

    def test_la_busqueda_vacia_tiene_segunda_oportunidad(self, monkeypatch):
        """0 resultados por un fallo puntual: otra pasada antes de rendirse.

        La búsqueda vacía no se cachea («no tiene videoclip»), pero sí deja
        la canción con portada por esta apertura: una segunda llamada la
        recupera hachazo.
        """
        ytm = _YtmFalso(
            watch=_watch("Mi Alma", "C.R.O", "3:16", ATV),
            searches=[
                [],
                [_video("clipe", "C.R.O - Mi Alma", "C.R.O", "3:16")],
            ],
        )
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        monkeypatch.setattr("videoclip._PAUSA_REBUSCA", 0)
        assert resolver_videoclip("of_rebusca_vacia") == "clipe"
        assert len(ytm.queries) == 2

    def test_sin_candidato_en_dos_pasadas_se_cachea(self, monkeypatch):
        """Solo se cachea «sin videoclip» cuando las DOS búsquedas fallan.

        Y una búsqueda con acierto directo NO se repite (una sola llamada).
        """
        letra = dict(
            _video(
                "letra",
                "C.R.O - Mi Alma (Letra)",
                "LetrasRandom",
                "3:16",
                tipo="MUSIC_VIDEO_TYPE_UGC",
            ),
            views="18M",
        )
        ytm = _YtmFalso(
            watch=_watch("Mi Alma", "C.R.O", "3:16", ATV),
            searches=[
                [dict(letra)],
                [dict(letra)],
            ],
        )
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        monkeypatch.setattr("videoclip._PAUSA_REBUSCA", 0)
        assert resolver_videoclip("of_dos_vacias") is None
        assert len(ytm.queries) == 2
        # Cacheado como «no tiene» (vigencia, no para siempre).
        assert db_get_videoclip_oficial("of_dos_vacias", 3600.0) == (True, None)

    def test_tu_recuerdo_sin_duracion_en_la_busqueda(self, monkeypatch):
        """Un OMV sin ``length`` no se descarta: decide el título y el canal.

        Caso real: «Tu Recuerdo» de C.R.O devuelve 35wouAYd1MU como videoclip
        oficial, pero YouTube Music no informa la duración en esa búsqueda.
        """
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=_watch("Tu Recuerdo", "C.R.O", "2:29", ATV),
                search=[
                    _video(
                        "35wouAYd1MU",
                        "C.R.O - Tu Recuerdo [ Shot by Ballve ]",
                        "C.R.O",
                        None,
                    )
                ],
            ),
        )
        assert resolver_videoclip("tu_recuerdo") == "35wouAYd1MU"
        assert db_get_videoclip_oficial("tu_recuerdo") == (True, "35wouAYd1MU")

    def test_art_track_sin_videoclip_devuelve_none(self, monkeypatch):
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=_watch("Aquella Noche", "Bardero$", "3:20", ATV),
                search=[
                    _video("l", "Bardero$ - Aquella Noche (Lyric)", "Bardero$", "3:20")
                ],
            ),
        )
        assert resolver_videoclip("of_atv_no") is None
        assert db_get_videoclip_oficial("of_atv_no") == (True, None)

    def test_el_no_tiene_reciente_no_repite_la_busqueda(self, monkeypatch):
        """Un «no tiene» reciente vale: no se vuelve a preguntar cada apertura."""
        monkeypatch.setattr("videoclip.get_ytm", lambda: _YtmFalso(fallar_todo=True))
        db_set_videoclip_oficial("of_negativa_nueva", None)
        assert resolver_videoclip("of_negativa_nueva") is None

    def test_el_no_tiene_caducado_se_vuelve_a_buscar(self, monkeypatch):
        """Un «no tiene» viejo no puede dejar la canción en la portada.

        Caso real: la descarga de un candidato que no cuadraba con la canción
        acabó cacheando «sin videoclip» en una que sí lo tenía.
        """
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=_watch("Mi Alma", "C.R.O", "3:16", ATV),
                search=[_video("clipe", "C.R.O - Mi Alma", "C.R.O", "3:16")],
            ),
        )
        db_set_videoclip_oficial("of_negativa_vieja", None, desajuste=13)
        _envejecer("of_negativa_vieja")
        assert resolver_videoclip("of_negativa_vieja") == "clipe"
        assert db_get_videoclip_oficial("of_negativa_vieja") == (True, "clipe")

    def test_la_busqueda_vacia_no_se_cachea(self, monkeypatch):
        """0 resultados = la consulta no respondió: se vuelve a buscar.

        Un vacío no es «esta canción no tiene videoclip»: cachearlo lo
        cancelaría para siempre por un fallo puntual de red.
        """
        ytm = _YtmFalso(
            watch=_watch("Aquella Noche", "Bardero$", "3:20", ATV), search=[]
        )
        busquedas: list[int] = []
        buscar_original = ytm.search

        def _buscar(*args, **kwargs):
            busquedas.append(1)
            return buscar_original(*args, **kwargs)

        ytm.search = _buscar
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        monkeypatch.setattr("videoclip._PAUSA_REBUSCA", 0)

        assert resolver_videoclip("of_vacia") is None
        assert resolver_videoclip("of_vacia") is None
        # Cada apertura consulta de nuevo (con su segunda oportunidad): nada
        # quedó en la caché.
        assert len(busquedas) == 4
        assert db_get_videoclip_oficial("of_vacia") == (False, None)

    def test_omv_usa_el_propio_video(self, monkeypatch):
        ytm = _YtmFalso(watch=_watch("Mi Alma", "C.R.O", "3:16", OMV))

        def _no_search(*args, **kwargs):
            raise AssertionError("un OMV ya es videoclip: no hay que buscar")

        ytm.search = _no_search
        monkeypatch.setattr("videoclip.get_ytm", lambda: ytm)
        assert resolver_videoclip("of_omv") == "of_omv"

    def test_sin_metadatos_usa_el_video_de_la_cancion(self, monkeypatch):
        monkeypatch.setattr("videoclip.get_ytm", lambda: _YtmFalso(fallar_todo=True))
        assert resolver_videoclip("of_sin_meta") == "of_sin_meta"
        # No se cachea: la consulta no llegó a hacerse.
        assert db_get_videoclip_oficial("of_sin_meta") == (False, None)

    def test_error_de_busqueda_no_se_cachea(self, monkeypatch):
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=_watch("Mi Alma", "C.R.O", "3:16", ATV),
                search=RuntimeError("red caída"),
            ),
        )
        assert resolver_videoclip("of_busqueda_falla") == "of_busqueda_falla"
        assert db_get_videoclip_oficial("of_busqueda_falla") == (False, None)

    def test_ytmusic_no_disponible(self, monkeypatch):
        def _explota():
            raise RuntimeError("ytmusic no listo")

        monkeypatch.setattr("videoclip.get_ytm", _explota)
        assert resolver_videoclip("of_ytm_caido") == "of_ytm_caido"

    def test_sin_watch_playlist_usa_get_song(self, monkeypatch):
        """`get_watch_playlist` falla con algunos ids; ``get_song`` es el plan B."""
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=None,
                song={
                    "videoDetails": {
                        "title": "Mi Alma",
                        "author": "C.R.O",
                        "lengthSeconds": "196",
                    }
                },
                search=[_video("clipe2", "C.R.O - Mi Alma", "C.R.O", "3:16")],
            ),
        )
        assert resolver_videoclip("of_plan_b") == "clipe2"

    def test_tipo_desconocido_sin_candidato_queda_en_portada(self, monkeypatch):
        """Sin saber el tipo (plan B) y sin candidato, se prefiere la portada.

        El vídeo de la canción sería una portada fija con el audio; antes se
        descargaba igualmente. Ahora no se descarga nada (y se cachea).
        """
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=None,
                song={
                    "videoDetails": {
                        "title": "Aquella Noche",
                        "author": "Bardero$",
                        "lengthSeconds": "190",
                    }
                },
                search=[
                    _video(
                        "letra", "Bardero$ - Aquella Noche (Lyric)", "Bardero$", "3:10"
                    )
                ],
            ),
        )
        assert resolver_videoclip("of_sin_tipo") is None
        assert db_get_videoclip_oficial("of_sin_tipo") == (True, None)

    def test_tipo_desconocido_con_candidato_lo_usa(self, monkeypatch):
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=None,
                song={
                    "videoDetails": {
                        "title": "Mi Alma",
                        "author": "C.R.O",
                        "lengthSeconds": "196",
                    }
                },
                search=[_video("clipe3", "C.R.O - Mi Alma", "C.R.O", "3:16")],
            ),
        )
        assert resolver_videoclip("of_plan_b_ok") == "clipe3"


class TestMigracion:
    """Al subir el criterio de resolución, la caché de «sin videoclip» se descarta."""

    def test_la_actualizacion_olvida_los_sin_videoclip(self):
        """Esquema viejo: los «no tiene» se borran y los aciertos se quedan.

        La 1.1.4 cacheó «sin videoclip» con su regla más estricta (Bardero$ se
        quedó con la portada donde la crew sí tiene el clip); al instalar la
        1.1.5 (esquema 3) esas filas se olvidan para que el criterio nuevo las
        vuelva a resolver en cuanto se vuelvan a abrir.
        """
        db_set_videoclip_oficial("mig_sin", None)
        db_set_videoclip_oficial("mig_ok", "clip_mig")
        with get_db() as conn:
            conn.execute("PRAGMA user_version = 2")
        # Reabrir la base (init_db) vuelve a pasar la migración de esquema.
        init_db()
        assert db_get_videoclip_oficial("mig_sin") == (False, None)
        assert db_get_videoclip_oficial("mig_ok") == (True, "clip_mig")
