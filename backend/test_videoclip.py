"""Tests para backend/videoclip.py — Videoclip oficial de una canción."""

from db import db_get_videoclip_oficial, db_set_videoclip_oficial, get_db
from videoclip import (
    VIGENCIA_SIN_CLIP,
    _segundos,
    elegir_candidato,
    normalizar_titulo,
    puntuar_candidato,
    resolver_videoclip,
)

ATV = "MUSIC_VIDEO_TYPE_ATV"
OMV = "MUSIC_VIDEO_TYPE_OMV"


class _YtmFalso:
    """YTMusic de mentira: solo los tres endpoints que usa el módulo."""

    def __init__(self, watch=None, search=None, song=None, fallar_todo=False):
        self._watch = watch
        self._search = search
        self._song = song
        self._fallar_todo = fallar_todo

    def get_watch_playlist(self, video_id, limit=1):
        if self._fallar_todo or self._watch is None:
            raise KeyError("endpoint")
        return self._watch

    def get_song(self, video_id):
        if self._fallar_todo or self._song is None:
            raise RuntimeError("sin get_song")
        return self._song

    def search(self, query, filter=None, limit=20):
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
        """Sin OMV ni canal del artista, el título no basta.

        «Behind Me» está subido por la crew que lo grabó (MDBCrew) y YouTube
        no lo marca como OMV… pero también los «vídeos letra» copian el título
        exacto («behind me [letra]»). Por metadatos no se distinguen: se
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

        assert resolver_videoclip("of_vacia") is None
        assert resolver_videoclip("of_vacia") is None
        # Cada apertura consulta de nuevo: nada quedó en la caché.
        assert len(busquedas) == 2
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
