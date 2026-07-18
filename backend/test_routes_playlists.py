"""Tests para routes/playlists.py — CRUD de playlists."""

from contextlib import suppress

import pytest


@pytest.fixture(autouse=True)
def _prepare_db():
    """Asegurar que las tablas existen y limpiar datos antes de cada test."""
    from db import get_db, init_db

    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM playlist_songs")
        conn.execute("DELETE FROM playlists")
        with suppress(Exception):
            conn.execute("DELETE FROM sqlite_sequence WHERE name='playlists'")
        conn.execute("DELETE FROM history")


class TestPlaylistsList:
    """Tests para listar playlists."""

    def test_list_empty(self, client):
        """Listar playlists sin datos debe devolver lista vacía."""
        resp = client.get("/playlists")
        assert resp.status_code == 200
        assert resp.json() == []


class TestPlaylistsCreate:
    """Tests para crear playlists."""

    def test_create_default_name(self, client):
        """Crear playlist sin nombre debe usar nombre por defecto."""
        resp = client.post("/playlists", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Nueva playlist"
        assert data["id"] == 1

    def test_create_custom_name(self, client):
        """Crear playlist con nombre personalizado."""
        resp = client.post("/playlists", json={"name": "Mis Favoritas"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Mis Favoritas"
        assert isinstance(data["id"], int)

    def test_create_multiple_playlists(self, client):
        """Crear múltiples playlists debe incrementar IDs."""
        r1 = client.post("/playlists", json={"name": "Playlist A"})
        r2 = client.post("/playlists", json={"name": "Playlist B"})
        assert r2.json()["id"] > r1.json()["id"]


class TestPlaylistsUpdate:
    """Tests para actualizar playlists."""

    def test_update_name(self, client):
        """Actualizar nombre de una playlist."""
        client.post("/playlists", json={"name": "Original"})
        resp = client.put("/playlists/1", json={"name": "Renombrada"})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_update_cover(self, client):
        """Actualizar cover de una playlist."""
        client.post("/playlists", json={"name": "With Cover"})
        resp = client.put(
            "/playlists/1",
            json={"cover": "https://example.com/cover.jpg"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_update_nonexistent(self, client):
        """Actualizar playlist inexistente no debe dar error."""
        resp = client.put("/playlists/999", json={"name": "Ghost"})
        assert resp.status_code == 200


class TestPlaylistsDelete:
    """Tests para eliminar playlists."""

    def test_delete_existing(self, client):
        """Eliminar una playlist existente."""
        client.post("/playlists", json={"name": "Temp"})
        resp = client.delete("/playlists/1")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_delete_nonexistent(self, client):
        """Eliminar playlist inexistente no debe dar error."""
        resp = client.delete("/playlists/999")
        assert resp.status_code == 200


class TestPlaylistsSongs:
    """Tests para canciones dentro de playlists."""

    def test_get_songs_empty(self, client):
        """Obtener canciones de playlist vacía."""
        client.post("/playlists", json={"name": "Empty"})
        resp = client.get("/playlists/1/songs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_song_to_playlist(self, client, sample_song):
        """Agregar una canción a una playlist."""
        client.post("/playlists", json={"name": "My List"})
        resp = client.post(
            "/playlists/1/songs",
            json={"videoIds": [sample_song["videoId"]]},
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_add_song_then_list_songs(self, client, sample_song):
        """Agregar canción y luego listar debe mostrarla."""
        from db import get_db

        # Insert sample in history so add_to_playlist finds metadata
        with get_db() as conn:
            conn.execute(
                """INSERT INTO history(video_id,title,artist,thumbnail,duration)
                   VALUES(?,?,?,?,?)""",
                (
                    sample_song["videoId"],
                    sample_song["title"],
                    sample_song["artist"],
                    sample_song["thumbnail"],
                    sample_song["duration"],
                ),
            )

        client.post("/playlists", json={"name": "My List"})
        client.post(
            "/playlists/1/songs",
            json={"videoIds": [sample_song["videoId"]]},
        )

        resp = client.get("/playlists/1/songs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["videoId"] == sample_song["videoId"]
        assert data[0]["title"] == sample_song["title"]

    def test_remove_song_from_playlist(self, client, sample_song):
        """Eliminar una canción de una playlist."""
        from db import get_db

        with get_db() as conn:
            conn.execute(
                """INSERT INTO history(video_id,title,artist,thumbnail,duration)
                   VALUES(?,?,?,?,?)""",
                (
                    sample_song["videoId"],
                    sample_song["title"],
                    sample_song["artist"],
                    sample_song["thumbnail"],
                    sample_song["duration"],
                ),
            )

        client.post("/playlists", json={"name": "My List"})
        client.post(
            "/playlists/1/songs",
            json={"videoIds": [sample_song["videoId"]]},
        )
        resp = client.delete(f"/playlists/1/songs/{sample_song['videoId']}")
        assert resp.status_code == 200

        songs_resp = client.get("/playlists/1/songs")
        assert songs_resp.json() == []

    def test_reorder_playlist(self, client):
        """Reordenar canciones en una playlist."""
        from db import get_db

        client.post("/playlists", json={"name": "Reorderable"})

        with get_db() as conn:
            for vid in ["a", "b", "c"]:
                conn.execute(
                    """INSERT INTO playlist_songs(playlist_id,video_id,title)
                       VALUES(1,?,?)""",
                    (vid, f"Song {vid}"),
                )

        resp = client.post(
            "/playlists/1/reorder",
            json={"videoIds": ["c", "a", "b"]},
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_playlist_has_song_count(self, client, sample_song):
        """Listar playlists debe incluir conteo de canciones."""
        client.post("/playlists", json={"name": "Count Test"})
        # Agregar canción vía ruta (evita problemas de transacción directa)
        client.post(
            "/playlists/1/songs",
            json={"videoIds": [sample_song["videoId"]]},
        )

        resp = client.get("/playlists")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["song_count"] == 1

    def test_playlist_0_songs_shows_0_count(self, client):
        """Playlist sin canciones debe mostrar song_count = 0."""
        client.post("/playlists", json={"name": "Empty"})
        resp = client.get("/playlists")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["song_count"] == 0
