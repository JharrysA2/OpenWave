"""Tests de los paths de datos: instalación (Program Files) vs desarrollo.

La app instalada no puede escribir en su propio directorio, así que los datos
(base de datos, descargas, log) van a «Datos de Programas»
(`%PROGRAMDATA%\\OpenWave`) y, si no, a `%LOCALAPPDATA%\\OpenWave`.
Estos tests fijan esa regla para que no se rompa sin querer.
"""

import importlib
import os
from pathlib import Path

import config


def test_env_openwave_data_dir_tiene_prioridad(monkeypatch, tmp_path):
    """OPENWAVE_DATA_DIR manda sobre cualquier otra regla (tests, portable)."""
    monkeypatch.setenv("OPENWAVE_DATA_DIR", str(tmp_path / "datos"))
    assert config._datos_dir() == tmp_path / "datos"


def test_desarrollo_usa_el_directorio_del_codigo(monkeypatch, tmp_path):
    """Con código escribible (repo), los datos siguen junto al código."""
    monkeypatch.delenv("OPENWAVE_DATA_DIR", raising=False)
    monkeypatch.setattr(config, "BASE_DIR", tmp_path / "backend")
    (tmp_path / "backend").mkdir()
    assert config._datos_dir() == tmp_path / "backend"


def test_codigo_no_escribible_cae_en_localappdata(monkeypatch, tmp_path):
    """Instalación en Program Files: los datos van al directorio de usuario."""
    # Un fichero como ancestro simula «no se puede crear/escribir» de forma
    # fiable tanto en Windows como en Unix y sin depender de permisos (root).
    blocker = tmp_path / "Program Files"
    blocker.write_text("", encoding="utf-8")
    monkeypatch.delenv("OPENWAVE_DATA_DIR", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "Local"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    monkeypatch.setattr(config, "BASE_DIR", blocker / "OpenWave" / "backend")

    if os.name == "nt":
        esperado = tmp_path / "Local" / "OpenWave"
    else:
        esperado = tmp_path / "xdg" / "OpenWave"
    assert config._datos_dir() == esperado


# ── Rama de Windows: «Datos de Programas» (%PROGRAMDATA%\OpenWave) ──────────
# Se prueba contra `_resolver_datos_dir` (misma lógica que `_datos_dir`, con
# el entorno y la plataforma como parámetros) porque activar aquí `os.name`
# rompería pathlib en Linux.


def _bloqueo(tmp_path):
    """Código en Program Files: un fichero como ancestro → no escribible."""
    blocker = tmp_path / "Program Files"
    blocker.write_text("", encoding="utf-8")
    return blocker / "OpenWave" / "backend"


def test_windows_los_datos_van_a_programdata(tmp_path):
    r"""Instalación: la raíz es %PROGRAMDATA%\OpenWave (compartida, estable)."""
    entorno = {
        "PROGRAMDATA": str(tmp_path / "ProgramData"),
        "LOCALAPPDATA": str(tmp_path / "Local"),
    }
    ruta = config._resolver_datos_dir(
        _bloqueo(tmp_path), entorno, es_windows=True
    )
    assert ruta == tmp_path / "ProgramData" / "OpenWave"
    # El gate debe haber creado la carpeta al comprobar escritura.
    assert ruta.is_dir()


def test_windows_sin_programdata_cae_en_localappdata(tmp_path):
    """Sin PROGRAMDATA (o sin valor) sigue funcionando por usuario."""
    entorno = {"LOCALAPPDATA": str(tmp_path / "Local")}
    ruta = config._resolver_datos_dir(
        _bloqueo(tmp_path), entorno, es_windows=True
    )
    assert ruta == tmp_path / "Local" / "OpenWave"


def test_windows_programdata_no_escribible_cae_en_localappdata(tmp_path):
    """Si ProgramData no admite escritura, fallback a %LOCALAPPDATA%."""
    pd = tmp_path / "ProgramData"
    pd.write_text("", encoding="utf-8")  # un fichero nunca es escribible
    entorno = {"PROGRAMDATA": str(pd), "LOCALAPPDATA": str(tmp_path / "Local")}
    ruta = config._resolver_datos_dir(
        _bloqueo(tmp_path), entorno, es_windows=True
    )
    assert ruta == tmp_path / "Local" / "OpenWave"


def test_windows_la_env_sigue_mandando_sobre_programdata(tmp_path):
    """OPENWAVE_DATA_DIR tiene prioridad también en Windows."""
    entorno = {
        "OPENWAVE_DATA_DIR": str(tmp_path / "portable"),
        "PROGRAMDATA": str(tmp_path / "ProgramData"),
    }
    ruta = config._resolver_datos_dir(
        _bloqueo(tmp_path), entorno, es_windows=True
    )
    assert ruta == tmp_path / "portable"


def test_en_linux_programdata_no_manda(tmp_path):
    """Fuera de Windows la rama nueva no se activa: manda XDG como siempre."""
    entorno = {
        "PROGRAMDATA": str(tmp_path / "ProgramData"),
        "XDG_DATA_HOME": str(tmp_path / "xdg"),
    }
    ruta = config._resolver_datos_dir(
        _bloqueo(tmp_path), entorno, es_windows=False
    )
    assert ruta == tmp_path / "xdg" / "OpenWave"


def test_import_sobrevive_si_no_puede_crear_los_dirs(tmp_path):
    """Un DATA_DIR imposible no debe tumbar el import de config (degradar)."""
    import subprocess
    import sys

    blocker = tmp_path / "raiz"
    blocker.write_text("", encoding="utf-8")
    data = blocker / "datos"  # su ancestro es un fichero → mkdir imposible
    env = {**os.environ, "OPENWAVE_DATA_DIR": str(data)}
    res = subprocess.run(
        [sys.executable, "-c", "import config; print(config.DATA_DIR)"],
        cwd=str(Path(__file__).resolve().parent),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert res.returncode == 0, res.stderr
    assert str(data) in res.stdout
    assert not data.exists()


def test_dir_escribible(tmp_path):
    assert config._dir_escribible(tmp_path) is True
    blocker = tmp_path / "fichero"
    blocker.write_text("", encoding="utf-8")
    assert config._dir_escribible(blocker / "hijo") is False


def test_dir_escribible_crea_el_directorio(tmp_path):
    """El gate crea la carpeta que falte y comprueba escritura dentro."""
    nueva = tmp_path / "ProgramData" / "OpenWave"
    assert config._dir_escribible(nueva) is True
    assert nueva.is_dir()
    # no debe quedarse el archivo de prueba
    assert list(nueva.iterdir()) == []


def test_cache_de_yt_dlp_vive_en_el_directorio_de_datos():
    """La caché de yt-dlp NO puede ir a %USERPROFILE%\\.cache."""
    assert config.YT_DLP_CACHE_DIR == config.DATA_DIR / "yt-dlp-cache"
    assert config.YT_DLP_CACHE_DIR.is_dir()


def test_extracciones_de_yt_dlp_usan_esa_cache(mocker):
    """YoutubeDL en proceso debe apuntar su caché al directorio de datos."""
    import streaming
    import yt_dlp

    mocker.patch.object(yt_dlp, "YoutubeDL")
    streaming._ydl_get_url("vid_cache_local", client="android")
    opts = yt_dlp.YoutubeDL.call_args[0][0]
    assert opts["cachedir"] == str(config.YT_DLP_CACHE_DIR)


def test_data_dir_crea_sus_subdirectorios(tmp_path):
    """Al importar config con OPENWAVE_DATA_DIR deben crearse sus carpetas.

    Se ejecuta en subproceso: recargar config aquí cambiaría BASE_DIR del
    resto de la sesión de tests (conftest lo fija una sola vez).
    """
    import subprocess
    import sys

    data = tmp_path / "datos"
    env = {**os.environ, "OPENWAVE_DATA_DIR": str(data)}
    code = (
        "import os, pathlib, config; "
        "d = pathlib.Path(os.environ['OPENWAVE_DATA_DIR']); "
        "assert config.DATA_DIR == d, config.DATA_DIR; "
        "assert all(p.is_dir() for p in (config.MUSIC_DIR, config.COVERS_DIR, "
        "config.LYRICS_DIR, config.STREAM_CACHE_DIR, config.YT_DLP_CACHE_DIR)); "
        "assert config.DB_FILE == d / 'openwave.db'"
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
    """LOG_FILE → OPENWAVE_LOG_FILE si existe, si no, junto a los datos."""
    import logging_config

    monkeypatch.setenv("OPENWAVE_LOG_FILE", str(tmp_path / "custom.log"))
    importlib.reload(logging_config)
    try:
        assert tmp_path / "custom.log" == logging_config.LOG_FILE
    finally:
        monkeypatch.undo()
        importlib.reload(logging_config)
    assert Path(config.DATA_DIR) / "openwave.log" == logging_config.LOG_FILE


def test_ffmpeg_empaquetado_tiene_prioridad(monkeypatch, tmp_path):
    """El ffmpeg del MSI (raíz/ffmpeg/ffmpeg.exe) manda sobre el del PATH."""
    from streaming import _ffmpeg_bin

    fake_root = tmp_path / "OpenWave"
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

    fake_root = tmp_path / "OpenWave"
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
