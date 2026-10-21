"""Tests para routes/cookies_routes.py — API de la sesión de YouTube."""

import cookies_store

COOKIES_OK = (
    "# Netscape HTTP Cookie File\n"
    ".youtube.com\tTRUE\t/\tTRUE\t4102444800\tSID\tabc123\n"
)


class TestEstadoCookies:
    def test_sin_cookies(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", tmp_path / "cookies.txt")
        resp = client.get("/settings/cookies")
        assert resp.status_code == 200
        assert resp.json() == {"configurado": False}


class TestGuardarCookies:
    def test_formato_invalido_no_guarda(self, client, tmp_path, monkeypatch):
        destino = tmp_path / "cookies.txt"
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", destino)
        resp = client.put("/settings/cookies", json={"content": "no es netscape"})
        assert resp.status_code == 200
        datos = resp.json()
        assert datos["ok"] is False
        assert "7 campos" in datos["error"]
        assert not destino.exists()

    def test_sesion_valida_guarda(self, client, tmp_path, monkeypatch):
        destino = tmp_path / "cookies.txt"
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", destino)
        monkeypatch.setattr(
            cookies_store, "_probar_sesion", lambda _r: {"ok": True, "metodo": "WL"}
        )
        resp = client.put("/settings/cookies", json={"content": COOKIES_OK})
        assert resp.status_code == 200
        datos = resp.json()
        assert datos["ok"] is True
        assert destino.read_text(encoding="utf-8") == COOKIES_OK

        estado = client.get("/settings/cookies").json()
        assert estado["configurado"] is True
        assert estado["bytes"] == len(COOKIES_OK)

    def test_sesion_invalida_no_guarda(self, client, tmp_path, monkeypatch):
        destino = tmp_path / "cookies.txt"
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", destino)
        monkeypatch.setattr(
            cookies_store,
            "_probar_sesion",
            lambda _r: {"ok": False, "error": "YouTube no reconoce la sesión"},
        )
        resp = client.put("/settings/cookies", json={"content": COOKIES_OK})
        assert resp.status_code == 200
        assert resp.json()["ok"] is False
        assert not destino.exists()

    def test_cuerpo_vacio(self, client):
        resp = client.put("/settings/cookies", json={})
        assert resp.status_code == 200
        assert resp.json()["ok"] is False


class TestComprobarCookies:
    def test_sin_fichero(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", tmp_path / "cookies.txt")
        resp = client.post("/settings/cookies/check")
        assert resp.status_code == 200
        assert resp.json()["ok"] is False

    def test_vuelve_a_verificar(self, client, tmp_path, monkeypatch):
        destino = tmp_path / "cookies.txt"
        destino.write_text(COOKIES_OK, encoding="utf-8")
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", destino)
        monkeypatch.setattr(
            cookies_store, "_probar_sesion", lambda _r: {"ok": True, "metodo": "WL"}
        )
        resp = client.post("/settings/cookies/check")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestBorrarCookies:
    def test_borra_fichero_y_estado(self, client, tmp_path, monkeypatch):
        destino = tmp_path / "cookies.txt"
        destino.write_text(COOKIES_OK, encoding="utf-8")
        monkeypatch.setattr(cookies_store, "COOKIES_FILE", destino)
        resp = client.delete("/settings/cookies")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert not destino.exists()
        assert client.get("/settings/cookies").json() == {"configurado": False}
