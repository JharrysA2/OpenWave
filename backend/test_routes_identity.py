"""Tests para routes/identity_routes.py — Ajustes de identidad de Windows."""

import identity


class TestEstadoIdentidad:
    def test_endpoint_responde(self, client):
        resp = client.get("/settings/identity")
        assert resp.status_code == 200
        datos = resp.json()
        assert "soportado" in datos
        assert "registrada" in datos


class TestRepararIdentidad:
    def test_en_linux_no_intenta_nada(self, client, monkeypatch):
        monkeypatch.setattr(identity.sys, "platform", "linux")
        resp = client.post("/settings/identity/repair")
        assert resp.status_code == 200
        assert resp.json()["ok"] is False
