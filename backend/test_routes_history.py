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


class TestHistoryImport:
    """Tests para POST /history/import — restauración desde copia de seguridad."""

    def test_import_empty_body(self, client):
        """Importar sin entradas debe responder ok con 0."""
        resp = client.post("/history/import", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["imported"] == 0

    def test_import_non_list_entries(self, client):
        """entries no-lista se trata como vacío (sin error)."""
        resp = client.post("/history/import", json={"entries": "nope"})
        assert resp.status_code == 200
        assert resp.json()["imported"] == 0

    def test_import_inserts_entries_with_counts(self, client):
        """Inserta entradas válidas conservando playCount y metadatos."""
        entries = [
            {
                "videoId": "imp_v1",
                "title": "Importada 1",
                "artist": "Artista 1",
                "duration": 120,
                "playCount": 5,
                "lastPlayedAt": "2026-01-01T10:00:00",
                "thumbnails": [{"url": "u1", "width": 100}],
            },
            {"videoId": "imp_v2", "title": "Importada 2", "artist": "Artista 2"},
            {"videoId": "", "title": "sin id — se ignora"},
            "no-dict",
        ]
        resp = client.post("/history/import", json={"entries": entries})
        assert resp.status_code == 200
        assert resp.json()["imported"] == 2

        hist = {h["videoId"]: h for h in client.get("/history").json()}
        assert "imp_v1" in hist
        assert hist["imp_v1"]["title"] == "Importada 1"
        assert hist["imp_v1"]["playCount"] == 5
        assert hist["imp_v1"]["lastPlayedAt"] == "2026-01-01T10:00:00"
        assert hist["imp_v1"]["thumbnails"] == [{"url": "u1", "width": 100}]
        assert "imp_v2" in hist
        assert hist["imp_v2"]["playCount"] >= 1

    def test_import_merges_without_losing_counts(self, client):
        """Fusión: conserva el mayor play_count tanto al subir como al bajar."""
        client.post("/history", json={"videoId": "imp_merge", "title": "Original"})
        # Import con más reproducciones → sube
        client.post(
            "/history/import",
            json={
                "entries": [{"videoId": "imp_merge", "title": "Nueva", "playCount": 7}]
            },
        )
        hist = {h["videoId"]: h for h in client.get("/history").json()}
        assert hist["imp_merge"]["playCount"] == 7
        assert hist["imp_merge"]["title"] == "Nueva"
        # Re-import con menos → NO pierde el máximo
        client.post(
            "/history/import",
            json={
                "entries": [{"videoId": "imp_merge", "title": "Nueva", "playCount": 2}]
            },
        )
        hist = {h["videoId"]: h for h in client.get("/history").json()}
        assert hist["imp_merge"]["playCount"] == 7


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


class TestHistoryLocalFlags:
    """GET /history marca downloaded/coverLocal (reproducción offline)."""

    def test_history_marks_downloaded_and_cover_local(self, client):
        """Con MP3+cover en disco, la entrada sale marcada como local."""
        import config as cfg

        client.post(
            "/history",
            json={"videoId": "hist_v1", "title": "T", "artist": "A", "duration": 100},
        )
        (cfg.MUSIC_DIR / "hist_v1.mp3").write_bytes(b"mp3")
        (cfg.COVERS_DIR / "hist_v1.jpg").write_bytes(b"jpg")
        try:
            resp = client.get("/history")
            assert resp.status_code == 200
            item = next(i for i in resp.json() if i["videoId"] == "hist_v1")
            assert item["downloaded"] is True
            assert item["coverLocal"] == "/music/covers/hist_v1.jpg"
        finally:
            (cfg.MUSIC_DIR / "hist_v1.mp3").unlink(missing_ok=True)
            (cfg.COVERS_DIR / "hist_v1.jpg").unlink(missing_ok=True)

    def test_history_without_assets_not_marked(self, client):
        """Sin MP3 en disco, downloaded=False y coverLocal vacío."""
        client.post(
            "/history",
            json={"videoId": "hist_v2", "title": "T", "artist": "A", "duration": 100},
        )
        resp = client.get("/history")
        assert resp.status_code == 200
        item = next(i for i in resp.json() if i["videoId"] == "hist_v2")
        assert item["downloaded"] is False
        assert item["coverLocal"] == ""
