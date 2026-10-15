"""Tests para backend/desfase.py — Desfase entre el videoclip y la canción.

La comparación de envolventes es pura (no toca disco ni red), así que los
casos de la búsqueda se prueban con envolventes sintéticas; ``medir`` se
prueba mockeando la decodificación con ffmpeg.
"""

import array
import random
import subprocess
from pathlib import Path

import pytest
from desfase import _envolvente, desfase_por_envolventes, medir


def _env_aleatoria(n: int, semilla: int = 7) -> list[float]:
    """Envolvente de sonoridad reproducible (valores entre 1 y 100)."""
    r = random.Random(semilla)
    return [r.uniform(1, 100) for _ in range(n)]


def _pcm_de(envolvente: list[float]) -> bytes:
    """PCM s16le mono a 8 kHz cuya envolvente RMS por tramo es la dada."""
    tramo = 800  # 0.1 s a 8 kHz
    out = array.array("h")
    for valor in envolvente:
        out.extend([int(round(valor))] * tramo)
    return out.tobytes()


class TestEnvolvente:
    """Del PCM al vector de sonoridad por tramos de 0.1 s."""

    def test_rms_de_un_tramo(self):
        pcm = array.array("h", [1000] * 800).tobytes()
        assert _envolvente(pcm) == pytest.approx([1000.0])

    def test_ignora_el_tramo_incompleto(self):
        pcm = array.array("h", [500] * 1200).tobytes()  # 1.5 tramos
        assert _envolvente(pcm) == pytest.approx([500.0])


class TestBusquedaDeDesfase:
    """desfase_por_envolventes: la canción dentro del vídeo."""

    def test_encuentra_la_intro_del_videoclip(self):
        """El clip lleva 4,5 s de intro: ese es el desfase."""
        cancion = _env_aleatoria(100)
        video = [0.5] * 45 + cancion  # intro plana: no compite con la canción
        assert desfase_por_envolventes(video, cancion) == pytest.approx(4.5)

    def test_cancion_al_principio_es_cero(self):
        cancion = _env_aleatoria(100)
        assert desfase_por_envolventes(list(cancion), cancion) == 0.0

    def test_video_mas_corto_se_usa_alineado(self):
        """No hay dónde buscar la canción entera, pero empieza con ella."""
        cancion = _env_aleatoria(100)
        assert desfase_por_envolventes(cancion[:60], cancion) == 0.0

    def test_videoclip_sin_la_cancion_devuelve_none(self):
        """Correlación por debajo del mínimo: el vídeo no es esta canción."""
        assert (
            desfase_por_envolventes(
                _env_aleatoria(100, semilla=1), _env_aleatoria(100, semilla=2)
            )
            is None
        )

    def test_dos_inicios_cercanos_se_descartan_por_ambiguos(self):
        """La canción parece empezar en dos sitios a menos de 2 s (patrón
        repetido, estrofas): no se puede decidir y no se arriesga."""
        patron = _env_aleatoria(20)  # 2 s de patrón repetido
        base = [patron[i % 20] for i in range(100)]
        # Copia casi idéntica desplazada 2 s sobre la original.
        video = [v * 1.05 for v in base[:20]] + list(base)
        assert desfase_por_envolventes(video, base) is None

    def test_cancion_demasiado_corta_no_se_compara(self):
        assert desfase_por_envolventes(_env_aleatoria(50), _env_aleatoria(5)) is None

    def test_cancion_plana_no_se_compara(self):
        """Sin varianza no hay correlación que calcular."""
        assert desfase_por_envolventes([1.0] * 100, [5.0] * 100) is None


class TestMedir:
    """medir(): decodifica con ffmpeg y compara (mockeando la decodificación)."""

    def test_devuelve_el_desfase_detectado(self, monkeypatch):
        base = [int(v) for v in _env_aleatoria(100)]
        pcm_video = _pcm_de([0] * 45 + base)
        pcm_cancion = _pcm_de(base)

        def _pcm_falso(ruta, ffmpeg):
            return pcm_cancion if "cancion" in str(ruta) else pcm_video

        monkeypatch.setattr("desfase._pcm", _pcm_falso)
        assert medir(Path("clip.mp4"), Path("cancion.m4a"), "ffmpeg") == pytest.approx(
            4.5
        )

    def test_fallo_de_decodificacion_se_propaga(self, monkeypatch):
        """No es «esta canción no sirve»: es transitorio, así que NO se
        cachea como «sin videoclip» (lo convierte en un error reintentable)."""

        def _falla(ruta, ffmpeg):
            raise subprocess.CalledProcessError(1, ["ffmpeg"])

        monkeypatch.setattr("desfase._pcm", _falla)
        with pytest.raises(subprocess.CalledProcessError):
            medir(Path("clip.mp4"), Path("cancion.m4a"), "ffmpeg")

    def test_video_no_legible_no_devuelve_none(self, monkeypatch):
        """Un fichero que ffmpeg no abre también debe ser error, no «no encaja»."""

        def _falla(ruta, ffmpeg):
            raise OSError("fichero corrupto")

        monkeypatch.setattr("desfase._pcm", _falla)
        with pytest.raises(OSError):
            medir(Path("clip.mp4"), Path("cancion.m4a"), "ffmpeg")
