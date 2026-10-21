"""Tests para backend/identity.py — Comprobación y reparación en Windows."""

import subprocess

import identity


class _Proc:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _reset(monkeypatch, plataforma="win32"):
    monkeypatch.setattr(identity.sys, "platform", plataforma)
    monkeypatch.setattr(identity, "_cache", None)


class TestEstado:
    def test_en_linux_no_soporta(self, monkeypatch):
        _reset(monkeypatch, "linux")
        assert identity.estado_identidad() == {
            "soportado": False,
            "registrada": None,
            "paquete": None,
        }

    def test_paquete_registrado(self, monkeypatch):
        _reset(monkeypatch)
        monkeypatch.setattr(
            identity,
            "_ejecutar",
            lambda *a, **k: _Proc(stdout="OpenWave_pr6hx30mntjwm\n"),
        )
        datos = identity.estado_identidad()
        assert datos["registrada"] is True
        assert datos["paquete"] == "OpenWave_pr6hx30mntjwm"

    def test_paquete_ausente(self, monkeypatch):
        _reset(monkeypatch)
        monkeypatch.setattr(identity, "_ejecutar", lambda *a, **k: _Proc(stdout=""))
        datos = identity.estado_identidad()
        assert datos["registrada"] is False
        assert datos["paquete"] is None

    def test_powershell_falla_no_se_confunde_con_ausente(self, monkeypatch):
        _reset(monkeypatch)
        monkeypatch.setattr(
            identity,
            "_ejecutar",
            lambda *a, **k: _Proc(returncode=1, stderr="Access denied"),
        )
        datos = identity.estado_identidad()
        assert datos["registrada"] is None
        assert "Access denied" in datos["error"]

    def test_cache_evita_repetir_powershell(self, monkeypatch):
        _reset(monkeypatch)
        llamadas = []

        def _fake(*a, **k):
            llamadas.append(1)
            return _Proc(stdout="OpenWave_pkg\n")

        monkeypatch.setattr(identity, "_ejecutar", _fake)
        identity.estado_identidad()
        identity.estado_identidad()
        assert len(llamadas) == 1
        identity.estado_identidad(forzar=True)
        assert len(llamadas) == 2


class TestReparar:
    def test_en_linux_no_hace_nada(self, monkeypatch):
        _reset(monkeypatch, "linux")
        resultado = identity.reparar_identidad()
        assert resultado["ok"] is False
        assert "Windows" in resultado["error"]

    def test_sin_script(self, monkeypatch):
        _reset(monkeypatch)
        monkeypatch.setattr(identity, "_script_identidad", lambda: None)
        resultado = identity.reparar_identidad()
        assert resultado["ok"] is False
        assert "openwave-identity-ca.ps1" in resultado["error"]

    def test_repara_y_confirma(self, monkeypatch, tmp_path):
        _reset(monkeypatch)
        script = tmp_path / "openwave-identity-ca.ps1"
        script.write_text("# fake", encoding="utf-8")
        monkeypatch.setattr(identity, "_script_identidad", lambda: script)
        monkeypatch.setattr(identity, "_ejecutar", lambda *a, **k: _Proc(returncode=0))
        monkeypatch.setattr(
            identity,
            "estado_identidad",
            lambda forzar=False: {
                "soportado": True,
                "registrada": True,
                "paquete": "OpenWave_pkg",
            },
        )
        resultado = identity.reparar_identidad()
        assert resultado["ok"] is True
        assert resultado["estado"]["paquete"] == "OpenWave_pkg"

    def test_uac_cancelado(self, monkeypatch, tmp_path):
        _reset(monkeypatch)
        script = tmp_path / "openwave-identity-ca.ps1"
        script.write_text("# fake", encoding="utf-8")
        monkeypatch.setattr(identity, "_script_identidad", lambda: script)
        monkeypatch.setattr(
            identity,
            "_ejecutar",
            lambda *a, **k: _Proc(
                returncode=1, stderr="The operation was canceled by the user."
            ),
        )
        resultado = identity.reparar_identidad()
        assert resultado["ok"] is False
        assert "cancelada" in resultado["error"]

    def test_timeout(self, monkeypatch, tmp_path):
        _reset(monkeypatch)
        script = tmp_path / "openwave-identity-ca.ps1"
        script.write_text("# fake", encoding="utf-8")
        monkeypatch.setattr(identity, "_script_identidad", lambda: script)

        def _timeout(*a, **k):
            raise subprocess.TimeoutExpired(cmd="powershell", timeout=180)

        monkeypatch.setattr(identity, "_ejecutar", _timeout)
        resultado = identity.reparar_identidad()
        assert resultado["ok"] is False
        assert "tardó demasiado" in resultado["error"]

    def test_termina_sin_registrar(self, monkeypatch, tmp_path):
        _reset(monkeypatch)
        script = tmp_path / "openwave-identity-ca.ps1"
        script.write_text("# fake", encoding="utf-8")
        monkeypatch.setattr(identity, "_script_identidad", lambda: script)
        monkeypatch.setattr(identity, "_ejecutar", lambda *a, **k: _Proc(returncode=0))
        monkeypatch.setattr(
            identity,
            "estado_identidad",
            lambda forzar=False: {
                "soportado": True,
                "registrada": False,
                "paquete": None,
            },
        )
        resultado = identity.reparar_identidad()
        assert resultado["ok"] is False
        assert "sigue sin registrarse" in resultado["error"]
