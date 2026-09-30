"""Tests de los paths de datos: instalación (Program Files) vs desarrollo.

La app instalada no puede escribir en su propio directorio, así que los datos
(base de datos, descargas, log) se redirigen a `%LOCALAPPDATA%\\SoundWave`.
Estos tests fijan esa regla para que no se rompa sin querer.
"""

import importlib
import os
from pathlib import Path

import config


def test_env_soundwave_data_dir_tiene_prioridad(monkeypatch, tmp_path):
    """SOUNDWAVE_DATA_DIR manda sobre cualquier otra regla (tests, portable)."""
    monkeypatch.setenv("SOUNDWAVE_DATA_DIR", str(tmp_path / "datos"))
    assert config._datos_dir() == tmp_path / "datos"


def test_desarrollo_usa_el_directorio_del_codigo(monkeypatch, tmp_path):
    """Con código escribible (repo), los datos siguen junto al código."""
    monkeypatch.delenv("SOUNDWAVE_DATA_DIR", raising=False)
    monkeypatch.setattr(config, "BASE_DIR", tmp_path / "backend")
    (tmp_path / "backend").mkdir()
    assert config._datos_dir() == tmp_path / "backend"


def test_codigo_no_escribible_cae_en_localappdata(monkeypatch, tmp_path):
    """Instalación en Program Files: los datos van al directorio de usuario."""
    # Un fichero como ancestro simula «no se puede crear/escribir» de forma
    # fiable tanto en Windows como en Unix y sin depender de permisos (root).
    blocker = tmp_path / "Program Files"
    blocker.write_text("", encoding="utf-8")
    monkeypatch.delenv("SOUNDWAVE_DATA_DIR", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "Local"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    monkeypatch.setattr(config, "BASE_DIR", blocker / "SoundWave" / "backend")

    if os.name == "nt":
        esperado = tmp_path / "Local" / "SoundWave"
    else:
        esperado = tmp_path / "xdg" / "SoundWave"
    assert config._datos_dir() == esperado


def test_dir_escribible(tmp_path):
    assert config._dir_escribible(tmp_path) is True
    blocker = tmp_path / "fichero"
    blocker.write_text("", encoding="utf-8")
    assert config._dir_escribible(blocker / "hijo") is False


def test_data_dir_crea_sus_subdirectorios(tmp_path):
    """Al importar config con SOUNDWAVE_DATA_DIR deben crearse sus carpetas.

    Se ejecuta en subproceso: recargar config aquí cambiaría BASE_DIR del
    resto de la sesión de tests (conftest lo fija una sola vez).
    """
    import subprocess
    import sys

    data = tmp_path / "datos"
    env = {**os.environ, "SOUNDWAVE_DATA_DIR": str(data)}
    code = (
        "import os, pathlib, config; "
        "d = pathlib.Path(os.environ['SOUNDWAVE_DATA_DIR']); "
        "assert config.DATA_DIR == d, config.DATA_DIR; "
        "assert all(p.is_dir() for p in (config.MUSIC_DIR, config.COVERS_DIR, "
        "config.LYRICS_DIR, config.STREAM_CACHE_DIR)); "
        "assert config.DB_FILE == d / 'soundwave.db'"
    )
    res = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(Path(__file__).resolve().parent),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert res.returncode == 0, res.stderr


def test_log_file_en_el_directorio_de_datos(monkeypatch, tmp_path):
    """LOG_FILE → SOUNDWAVE_LOG_FILE si existe, si no, junto a los datos."""
    import logging_config

    monkeypatch.setenv("SOUNDWAVE_LOG_FILE", str(tmp_path / "custom.log"))
    importlib.reload(logging_config)
    try:
        assert tmp_path / "custom.log" == logging_config.LOG_FILE
    finally:
        monkeypatch.undo()
        importlib.reload(logging_config)
    assert Path(config.DATA_DIR) / "soundwave.log" == logging_config.LOG_FILE


def test_ffmpeg_empaquetado_tiene_prioridad(monkeypatch, tmp_path):
    """El ffmpeg del MSI (raíz/ffmpeg/ffmpeg.exe) manda sobre el del PATH."""
    from streaming import _ffmpeg_bin

    fake_root = tmp_path / "SoundWave"
    (fake_root / "ffmpeg").mkdir(parents=True)
    exe = fake_root / "ffmpeg" / "ffmpeg.exe"
    exe.write_bytes(b"")

    import streaming

    monkeypatch.setattr(
        streaming, "__file__", str(fake_root / "backend" / "streaming.py")
    )
    assert Path(_ffmpeg_bin()) == exe.resolve()


def test_yt_dlp_usa_el_python_empaquetado(monkeypatch, tmp_path):
    """Con runtime/ empaquetado, yt-dlp corre con el intérprete embebido."""
    from streaming import _yt_dlp_cmd

    fake_root = tmp_path / "SoundWave"
    runtime = fake_root / "runtime"
    if os.name == "nt":
        runtime.mkdir(parents=True)
        py = runtime / "python.exe"
    else:
        (runtime / "bin").mkdir(parents=True)
        py = runtime / "bin" / "python3"
    py.write_bytes(b"")

    import streaming

    monkeypatch.setattr(
        streaming, "__file__", str(fake_root / "backend" / "streaming.py")
    )
    assert _yt_dlp_cmd() == [str(py.resolve()), "-m", "yt_dlp"]


def test_yt_dlp_sin_runtime_usa_lo_que_haya(monkeypatch, tmp_path):
    """Fuera de la instalación: se cae al comportamiento histórico."""
    import streaming
    from streaming import _yt_dlp_cmd

    monkeypatch.setattr(
        streaming, "__file__", str(tmp_path / "backend" / "streaming.py")
    )
    cmd = _yt_dlp_cmd()
    assert cmd[-2:] == ["-m", "yt_dlp"] or cmd[0].endswith("yt-dlp")
