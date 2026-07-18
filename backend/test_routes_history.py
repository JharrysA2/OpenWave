"""Tests para routes/history.py — CRUD de historial y estado del reproductor."""

import json

import pytest


def _delete_with_body(client, url, data):
    """Helper: TestClient.delete() no acepta json=, usamos request()."""
    return client.request(
        "DELETE",
        url,
        content=json.dumps(data),
        headers={"Content-Type": "application/json"},
    )


class TestHistoryDelete:
    """Tests para DELETE /history — eliminar entradas específicas."""

    def test_delete_empty_history(self, client):
        """Eliminar de historial vacío debe responder ok."""
        resp = _delete_with_body(client, "/history", {"videoIds": ["test123"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_delete_nonexistent_video(self, client):
        """Eliminar video inexistente debe responder ok."""
        resp = _delete_with_body(
            client, "/history", {"videoIds": ["nonexistent_video"]}
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_without_body(self, client):
        """DELETE sin body lanza JSONDecodeError (request.json() falla)."""
        with pytest.raises(json.decoder.JSONDecodeError):
            client.delete("/history")

    def test_delete_empty_video_ids(self, client):
        """DELETE con lista vacía debe responder ok."""
        resp = _delete_with_body(client, "/history", {"videoIds": []})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_after_post_removes_entry(self, client, sample_song):
        """Publicar y luego eliminar debe dejar el historial limpio."""
        # Post a song
        client.post("/history", json=sample_song)

        # Verify it was added
        get_before = client.get("/history")
        assert len(get_before.json()) > 0

        # Delete that song
        resp = _delete_with_body(
            client, "/history", {"videoIds": [sample_song["videoId"]]}
        )
        assert resp.status_code == 200

        # Verify it's gone
        get_after = client.get("/history")
        for entry in get_after.json():
            assert entry["videoId"] != sample_song["videoId"]


class TestHistoryClear:
    """Tests para DELETE /history/all — limpiar todo el historial."""

    def test_clear_empty_history(self, client):
        """Limpiar historial vacío debe responder ok."""
        resp = client.delete("/history/all")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_clear_removes_all_entries(self, client, sample_song):
        """Limpiar historial con datos debe dejarlo vacío."""
        client.post("/history", json=sample_song)
        resp = client.delete("/history/all")
        assert resp.status_code == 200

        get_resp = client.get("/history")
        assert get_resp.json() == []

    def test_clear_after_multiple_posts(self, client):
        """Limpiar después de múltiples posts debe dejar historial vacío."""
        songs = [
            {"videoId": "v1", "title": "Song 1", "artist": "A1"},
            {"videoId": "v2", "title": "Song 2", "artist": "A2"},
            {"videoId": "v3", "title": "Song 3", "artist": "A3"},
        ]
        for s in songs:
            client.post("/history", json=s)

        client.delete("/history/all")
        get_resp = client.get("/history")
        assert get_resp.json() == []

    def test_clear_idempotent(self, client):
        """Limpiar dos veces debe funcionar igual."""
        client.delete("/history/all")
        resp = client.delete("/history/all")
        assert resp.status_code == 200


class TestPlayerState:
    """Tests para GET/POST /player/state — estado del reproductor."""

    def test_get_default_state(self, client):
        """Estado por defecto debe tener valores predeterminados."""
        resp = client.get("/player/state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["volume"] == 0.7
        assert data["queue"] == []
        assert data["shuffle"] is False
        assert data["repeat"] is False
        assert "lastSong" in data

    def test_save_and_retrieve_state(self, client):
        """Guardar estado y luego leerlo debe devolver los mismos valores."""
        save_resp = client.post(
            "/player/state",
            json={"volume": 0.5, "shuffle": True, "repeat": True},
        )
        assert save_resp.status_code == 200
        assert save_resp.json()["ok"] is True

        get_resp = client.get("/player/state")
        data = get_resp.json()
        assert data["volume"] == 0.5
        assert data["shuffle"] is True
        assert data["repeat"] is True

    def test_save_partial_state(self, client):
        """Guardar solo algunos campos debe preservar otros."""
        client.post("/player/state", json={"volume": 0.3})
        get_resp = client.get("/player/state")
        data = get_resp.json()
        assert data["volume"] == 0.3
        assert data["queue"] == []

    def test_save_last_song(self, client):
        """Guardar lastSong como diccionario."""
        song = {"videoId": "test", "title": "Test Song", "artist": "Artist"}
        client.post("/player/state", json={"lastSong": song})
        get_resp = client.get("/player/state")
        assert get_resp.json()["lastSong"] == song

    def test_save_queue_list(self, client):
        """Guardar cola de reproducción como lista."""
        queue = [{"videoId": "v1"}, {"videoId": "v2"}]
        client.post("/player/state", json={"queue": queue})
        get_resp = client.get("/player/state")
        assert get_resp.json()["queue"] == queue

    def test_save_multiple_updates(self, client):
        """Múltiples actualizaciones deben acumularse correctamente."""
        client.post("/player/state", json={"volume": 0.1, "shuffle": True})
        client.post("/player/state", json={"repeat": True, "volume": 0.9})
        get_resp = client.get("/player/state")
        data = get_resp.json()
        assert data["volume"] == 0.9
        assert data["shuffle"] is True
        assert data["repeat"] is True

    def test_save_empty_body(self, client):
        """POST con body vacío debe responder ok."""
        resp = client.post("/player/state", json={})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
