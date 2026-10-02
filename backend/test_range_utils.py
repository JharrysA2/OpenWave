"""Tests para range_utils.py — soporte HTTP Range (seek de audio).

Chromium envía ``Range: bytes=0-`` ya en la PRIMERA petición de un <audio>
y solo lo considera seekable si responde 206 + Content-Range. Sin eso,
``audio.currentTime = t`` reinicia la canción desde 0 (bugs "al hacer clic
en una letra / arrastrar la barra se reinicia").
"""

from range_utils import parse_range


class TestParseRange:
    """parse_range(header, total) → (start, end) | None | "invalid"."""

    def test_sin_cabecera_devuelve_none(self):
        """Sin cabecera Range → 200 (rango no solicitado)."""
        assert parse_range(None, 1000) is None

    def test_cabecera_no_bytes_se_ignora(self):
        """Prefijo distinto de bytes= → se ignora (200)."""
        assert parse_range("items=0-5", 1000) is None

    def test_bytes_abierto(self):
        """bytes=0- → rango completo (lo envía Chromium en la primera petición)."""
        assert parse_range("bytes=0-", 1000) == (0, 999)

    def test_bytes_abierto_desde_medio(self):
        """bytes=500- → desde 500 hasta el final (seek hacia delante)."""
        assert parse_range("bytes=500-", 1000) == (500, 999)

    def test_bytes_rango_fijo(self):
        assert parse_range("bytes=100-199", 1000) == (100, 199)

    def test_bytes_un_byte(self):
        assert parse_range("bytes=0-0", 1000) == (0, 0)

    def test_final_recortado_al_total(self):
        """bytes=900-99999 → recortado a999 (el archivo mide1000)."""
        assert parse_range("bytes=900-99999", 1000) == (900, 999)

    def test_suffix_range(self):
        """bytes=-50 → últimos50 bytes."""
        assert parse_range("bytes=-50", 1000) == (950, 999)

    def test_multi_rango_degrada_a_200(self):
        """Multi-rango no hace falta para seek → 200 en vez de rechazar."""
        assert parse_range("bytes=0-1,5-9", 1000) is None

    def test_fuera_de_rango_es_invalido(self):
        """start >= total → 416 (Content-Range: bytes */total)."""
        assert parse_range("bytes=1000-", 1000) == "invalid"
        assert parse_range("bytes=5000-6000", 1000) == "invalid"

    def test_rango_invertido_es_invalido(self):
        assert parse_range("bytes=500-100", 1000) == "invalid"

    def test_no_numerico_es_invalido(self):
        assert parse_range("bytes=abc-def", 1000) == "invalid"

    def test_suffix_cero_es_invalido(self):
        assert parse_range("bytes=-0", 1000) == "invalid"

    def test_archivo_vacio_cualquier_rango_es_invalido(self):
        assert parse_range("bytes=0-", 0) == "invalid"
