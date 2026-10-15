"""Tests para backend/videoclip.py — Videoclip oficial de una canción."""

from db import db_get_videoclip_oficial
from videoclip import (
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

    def test_canal_ajeno_sin_omv_se_rechaza(self):
        """Subida de un fan con el artista en el título: no es el videoclip."""
        assert (
            puntuar_candidato(
                "Aquella Noche",
                "Bardero$",
                191,
                _video(
                    "fan",
                    "Aquella noche (Bardero$)",
                    "Daniela Lipa",
                    "3:11",
                    tipo="MUSIC_VIDEO_TYPE_UGC",
                ),
            )
            < 0
        )

    def test_duracion_muy_distinta_resta(self):
        igual = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("a", "Mi Alma", "C.R.O", "3:16")
        )
        distinta = puntuar_candidato(
            "Mi Alma", "C.R.O", 196, _video("b", "Mi Alma", "C.R.O", "9:45")
        )
        assert 0 < distinta < igual


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

    def test_el_no_resultado_se_cachea(self, monkeypatch):
        """La segunda llamada no vuelve a consultar YouTube Music."""
        monkeypatch.setattr(
            "videoclip.get_ytm",
            lambda: _YtmFalso(
                watch=_watch("Aquella Noche", "Bardero$", "3:20", ATV), search=[]
            ),
        )
        assert resolver_videoclip("of_cache_no") is None

        def _explota():
            raise AssertionError("no debería consultarse: ya está cacheado")

        monkeypatch.setattr("videoclip.get_ytm", _explota)
        assert resolver_videoclip("of_cache_no") is None

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
