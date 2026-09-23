"""Tests para routes/downloads_routes.py — Descargas, progreso y eliminacion."""

import json

import pytest


class TestStartDownload:
    """Tests para POST /download/{video_id} — iniciar descarga."""

    def test_start_download_success(self, client, mocker):
        """Iniciar descarga debe responder ok.
        Nota: NO se mockea threading.Thread porque SlowAPI lo usa internamente.
        """
        resp = client.post(
            "/download/test_video_123",
            json={
                "title": "Mi Cancion",
                "artist": "Mi Artista",
                "thumbnail": "https://example.com/thumb.jpg",
                "duration": 240,
                "album_title": "Album Test",
                "album_type": "Album",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_start_download_minimal_body(self, client, mocker):
        """Iniciar descarga con body minimo debe funcionar.
        Nota: NO se mockea threading.Thread porque SlowAPI lo usa internamente.
        """
        resp = client.post(
            "/download/test_video_123",
            json={"title": "Cancion"},
        )
        assert resp.status_code == 200

    def test_start_download_empty_body(self, client, mocker):
        """Iniciar descarga sin body lanza JSONDecodeError."""
        with pytest.raises(json.decoder.JSONDecodeError):
            client.post("/download/test_video_123")


class TestDownloadProgress:
    """Tests para GET /download/progress/{video_id} — progreso SSE."""

    def test_download_progress_returns_streaming_response(self, client, mocker):
        """El endpoint de progreso debe devolver StreamingResponse."""
        mocker.patch.dict(
            "routes.downloads_routes.download_progress",
            {"strm_vid": {"status": "done", "progress": 100}},
            clear=True,
        )

        resp = client.get("/download/progress/strm_vid")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")

    def test_download_progress_done_event(self, client, mocker):
        """Cuando el progreso es 'done', debe emitir un evento y cerrar."""
        mocker.patch.dict(
            "routes.downloads_routes.download_progress",
            {"test_vid": {"status": "done", "progress": 100}},
            clear=True,
        )

        resp = client.get("/download/progress/test_vid")
        data = resp.text
        assert "done" in data
        assert "100" in data
        # Debe haber un solo evento (done -> break)
        assert data.count("data:") == 1

    def test_download_progress_error_event(self, client, mocker):
        """Cuando el progreso es 'error', debe emitir un evento y cerrar."""
        mocker.patch.dict(
            "routes.downloads_routes.download_progress",
            {"test_vid": {"status": "error", "progress": 50, "error": "Failed"}},
            clear=True,
        )

        resp = client.get("/download/progress/test_vid")
        data = resp.text
        assert "error" in data
        assert data.count("data:") == 1

    def test_download_progress_unknown_video(self, client, mocker):
        """Video desconocido usa progreso default y SSE se cierra con done."""
        mocker.patch.dict(
            "routes.downloads_routes.download_progress",
            {"unknown_vid": {"status": "done", "progress": 0}},
            clear=True,
        )
        resp = client.get("/download/progress/unknown_vid")
        assert resp.status_code == 200
        data = resp.text
        assert "data:" in data

    def test_download_progress_hits_asyncio_sleep(self, client, mocker):
        """Progreso 'downloading' debe ejecutar await asyncio.sleep(0.5)."""
        import asyncio

        # Usar un dict mutable para cambiar el estado durante la ejecucion
        progress = {"status": "downloading", "progress": 50}
        mocker.patch.dict(
            "routes.downloads_routes.download_progress",
            {"sleep_vid": progress},
            clear=True,
        )

        # Guardar el asyncio.sleep original antes de parchearlo
        original_sleep = asyncio.sleep

        async def mock_sleep(duration):
            progress["status"] = "done"
            await original_sleep(0)  # Usar el original, no el parcheado

        mocker.patch("asyncio.sleep", mock_sleep)

        resp = client.get("/download/progress/sleep_vid")
        assert resp.status_code == 200
        data = resp.text
        # Debe haber 2 eventos: downloading (inicial) y done (tras sleep)
        assert data.count("data:") == 2
        assert "downloading" in data
        assert "done" in data


class TestListDownloads:
    """Tests para GET /downloads — listar descargas."""

    def test_list_downloads_empty(self, client):
        """Listar descargas vacias debe devolver lista vacia."""
        resp = client.get("/downloads")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_downloads_with_data(self, client):
        """Con descargas en BD, debe devolver la lista correctamente."""
        from db import get_db

        with get_db() as conn:
            conn.execute(
                """INSERT INTO downloads
                   (video_id, title, artist, thumbnail, duration, album_title, album_type)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    "lst_data_1",
                    "Cancion 1",
                    "Artista 1",
                    "thumb1.jpg",
                    200,
                    "Album 1",
                    "Album",
                ),
            )

        resp = client.get("/downloads")
        data = resp.json()
        found = [s for s in data if s["videoId"] == "lst_data_1"]
        assert len(found) == 1
        assert found[0]["title"] == "Cancion 1"
        assert found[0]["artist"] == "Artista 1"
        assert found[0]["downloaded"] is True
        assert found[0]["size"] == 0

    def test_list_downloads_multiple(self, client):
        """Multiples descargas deben retornar lista ordenada."""
        from db import get_db

        with get_db() as conn:
            for i in range(3):
                uid = f"mltpl_{i}"
                conn.execute(
                    (
                        "INSERT OR REPLACE INTO downloads "
                        "(video_id, title, artist, thumbnail, duration) "
                        "VALUES (?, ?, ?, ?, ?)"
                    ),
                    (uid, f"Song {i}", f"Artist {i}", f"thumb{i}.jpg", 180),
                )

        resp = client.get("/downloads")
        data = resp.json()
        assert len(data) >= 3

    def test_list_downloads_with_mp3_size(self, client, mocker):
        """Si existe archivo MP3, debe reportar su tamano."""
        from config import MUSIC_DIR
        from db import get_db

        uid = "size_test_vid"
        with get_db() as conn:
            conn.execute(
                (
                    "INSERT OR REPLACE INTO downloads "
                    "(video_id, title, artist, thumbnail, duration) "
                    "VALUES (?, ?, ?, ?, ?)"
                ),
                (uid, "Size Song", "Artist", "thumb.jpg", 200),
            )

        mp3_path = MUSIC_DIR / f"{uid}.mp3"
        mp3_path.parent.mkdir(parents=True, exist_ok=True)
        mp3_path.write_bytes(b"x" * 12345)

        try:
            resp = client.get("/downloads")
            data = resp.json()
            found = [s for s in data if s["videoId"] == uid]
            assert len(found) == 1
            assert found[0]["size"] == 12345
        finally:
            mp3_path.unlink(missing_ok=True)


class TestDeleteDownload:
    """Tests para DELETE /downloads/{video_id} — eliminar una descarga."""

    def test_delete_nonexistent_download(self, client):
        """Eliminar descarga inexistente debe responder ok."""
        resp = client.delete("/downloads/nonexistent")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_with_files(self, client, mocker):
        """Eliminar descarga debe borrar archivos MP3, cover, lyrics y metadata."""
        from config import COVERS_DIR, LYRICS_DIR, MUSIC_DIR

        vid = "del_vid_123"
        from db import get_db

        with get_db() as conn:
            conn.execute(
                """INSERT INTO downloads
                   (video_id, title, artist, thumbnail, duration)
                   VALUES (?, ?, ?, ?, ?)""",
                (vid, "Delete Song", "Artist", "thumb.jpg", 200),
            )

        # Crear archivos falsos
        mp3 = MUSIC_DIR / f"{vid}.mp3"
        mp3.parent.mkdir(parents=True, exist_ok=True)
        mp3.write_bytes(b"mp3")

        cover = COVERS_DIR / f"{vid}.jpg"
        cover.parent.mkdir(parents=True, exist_ok=True)
        cover.write_bytes(b"cover")

        lrc = LYRICS_DIR / f"{vid}.lrc"
        lrc.parent.mkdir(parents=True, exist_ok=True)
        lrc.write_bytes(b"lyrics")

        meta = MUSIC_DIR / f"{vid}.json"
        meta.write_bytes(b"{}")

        try:
            resp = client.delete(f"/downloads/{vid}")
            assert resp.status_code == 200

            # Archivos deben haber sido eliminados
            assert not mp3.exists()
            assert not cover.exists()
            assert not lrc.exists()
            assert not meta.exists()

            # BD debe estar limpia
            with get_db() as conn2:
                row = conn2.execute(
                    "SELECT * FROM downloads WHERE video_id=?", (vid,)
                ).fetchone()
                assert row is None
        finally:
            for p in [mp3, cover, lrc, meta]:
                p.unlink(missing_ok=True)

    def test_delete_without_files(self, client):
        """Eliminar descarga sin archivos fisicos tambien debe funcionar."""
        from db import get_db

        vid = "no_files_vid"
        with get_db() as conn:
            conn.execute(
                """INSERT INTO downloads
                   (video_id, title, artist, thumbnail, duration)
                   VALUES (?, ?, ?, ?, ?)""",
                (vid, "No Files", "Artist", "thumb.jpg", 200),
            )

        resp = client.delete(f"/downloads/{vid}")
        assert resp.status_code == 200

        # BD debe estar limpia
        with get_db() as conn2:
            row = conn2.execute(
                "SELECT * FROM downloads WHERE video_id=?", (vid,)
            ).fetchone()
            assert row is None


class TestDeleteAllDownloads:
    """Tests para DELETE /downloads/all — eliminar todas las descargas."""

    def test_delete_all_empty(self, client):
        """Eliminar todo sin descargas debe responder ok."""
        resp = client.delete("/downloads/all")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_all_with_data(self, client):
        """Eliminar todo con descargas debe borrar archivos y BD."""
        from config import COVERS_DIR, LYRICS_DIR, MUSIC_DIR
        from db import get_db

        vid = "del_all_vid"

        # Insertar BD
        with get_db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO downloads "
                "(video_id, title, artist, thumbnail, duration) "
                "VALUES (?, ?, ?, ?, ?)",
                (vid, "Test Song", "Artist", "thumb.jpg", 200),
            )

        # Crear archivos
        mp3 = MUSIC_DIR / f"{vid}.mp3"
        meta = MUSIC_DIR / f"{vid}.json"
        cover = COVERS_DIR / f"{vid}.jpg"
        lrc = LYRICS_DIR / f"{vid}.lrc"

        for p in [mp3, meta, cover, lrc]:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"test")

        try:
            resp = client.delete("/downloads/all")
            assert resp.status_code == 200
            assert resp.json()["ok"] is True

            # Verificar archivos eliminados
            assert not mp3.exists()
            assert not meta.exists()
            assert not cover.exists()
            assert not lrc.exists()

            # Verificar BD vacia
            with get_db() as conn:
                rows = conn.execute("SELECT * FROM downloads").fetchall()
                assert len(rows) == 0
        finally:
            for p in [mp3, meta, cover, lrc]:
                p.unlink(missing_ok=True)


class TestDeleteSelectedDownloads:
    """Tests para POST /downloads/delete — eliminar seleccionados."""

    def test_delete_selected_empty(self, client):
        """Eliminar seleccionados con lista vacia debe responder ok."""
        resp = client.post("/downloads/delete", json={"videoIds": []})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_selected_specific(self, client):
        """Eliminar seleccionados debe borrar solo los especificados."""
        from config import BASE_DIR, MUSIC_DIR
        from db import get_db

        vid_to_delete = "del_spec_vid"
        vid_to_keep = "keep_spec_vid"

        # Insertar BD
        with get_db() as conn:
            conn.execute(
                (
                    "INSERT OR REPLACE INTO downloads "
                    "(video_id, title, artist, thumbnail, duration) "
                    "VALUES (?, ?, ?, ?, ?)"
                ),
                (vid_to_delete, "Delete Me", "Artist", "t.jpg", 200),
            )
            conn.execute(
                (
                    "INSERT OR REPLACE INTO downloads "
                    "(video_id, title, artist, thumbnail, duration) "
                    "VALUES (?, ?, ?, ?, ?)"
                ),
                (vid_to_keep, "Keep Me", "Artist", "t.jpg", 200),
            )

        # Crear archivos en las rutas exactas que usa el endpoint:
        # mp3  → MUSIC_DIR / f"{vid}.mp3"  (via get_mp3_path)
        # cover → BASE_DIR / "downloads" / "covers" / f"{vid}.jpg"
        # lrc   → BASE_DIR / "downloads" / "lyrics" / f"{vid}.lrc"
        base = BASE_DIR
        keep_mp3 = MUSIC_DIR / f"{vid_to_keep}.mp3"
        del_mp3 = MUSIC_DIR / f"{vid_to_delete}.mp3"
        del_cover = base / "downloads" / "covers" / f"{vid_to_delete}.jpg"
        del_lrc = base / "downloads" / "lyrics" / f"{vid_to_delete}.lrc"

        for p in [keep_mp3, del_mp3]:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"mp3")
        del_cover.parent.mkdir(parents=True, exist_ok=True)
        del_cover.write_bytes(b"cover")
        del_lrc.parent.mkdir(parents=True, exist_ok=True)
        del_lrc.write_bytes(b"lyrics")

        try:
            resp = client.post(
                "/downloads/delete",
                json={"videoIds": [vid_to_delete]},
            )
            assert resp.status_code == 200
            assert resp.json()["ok"] is True

            # Verificar archivos
            assert not del_mp3.exists(), f"{del_mp3} should be deleted"
            assert not del_cover.exists(), f"{del_cover} should be deleted"
            assert not del_lrc.exists(), f"{del_lrc} should be deleted"
            assert keep_mp3.exists(), f"{keep_mp3} should still exist"

            # Verificar BD
            with get_db() as conn2:
                kept = conn2.execute(
                    "SELECT * FROM downloads WHERE video_id=?", (vid_to_keep,)
                ).fetchone()
                assert kept is not None
                deleted = conn2.execute(
                    "SELECT * FROM downloads WHERE video_id=?", (vid_to_delete,)
                ).fetchone()
                assert deleted is None
        finally:
            for p in [keep_mp3, del_mp3, del_cover, del_lrc]:
                p.unlink(missing_ok=True)

    def test_delete_selected_without_body(self, client):
        """Eliminar seleccionados sin body lanza JSONDecodeError."""
        with pytest.raises(json.decoder.JSONDecodeError):
            client.post("/downloads/delete")


class TestDownloadAlbum:
    """Tests para POST /downloads/album y su progreso SSE."""

    def test_download_album_success(self, client, mocker):
        """Descargar álbum debe responder ok y lanzar do_download por pista."""
        mock_do_download = mocker.patch("routes.downloads_routes.do_download")
        mocker.patch.dict("routes.downloads_routes.download_progress", {}, clear=True)

        resp = client.post(
            "/downloads/album",
            json={
                "browseId": "MPREb_test_album_1",
                "title": "Álbum de Prueba",
                "type": "Album",
                "artist": "Artista Prueba",
                "artistBrowseId": "UC_test_artist",
                "thumbnail": "https://example.com/cover.jpg",
                "tracks": [
                    {"videoId": "aaaaaaaaaaa", "title": "Track 1", "duration": 100},
                    {"videoId": "bbbbbbbbbbb", "title": "Track 2", "duration": 120},
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["total"] == 2

        import time

        for _ in range(50):
            if mock_do_download.call_count >= 2:
                break
            time.sleep(0.05)
        assert mock_do_download.call_count == 2
        # La pista lleva los ids de álbum/artista del body
        kwargs = mock_do_download.call_args[1]
        assert kwargs["album_browse_id"] == "MPREb_test_album_1"
        assert kwargs["artist_browse_id"] == "UC_test_artist"

    def test_download_album_empty_tracks(self, client):
        """Sin canciones debe responder 400."""
        resp = client.post("/downloads/album", json={"browseId": "MPREb_empty"})
        assert resp.status_code == 400

    def test_download_album_progress_done(self, client, mocker):
        """El progreso del álbum debe emitir 'done' y cerrar."""
        mocker.patch.dict(
            "routes.downloads_routes.download_progress",
            {
                "album:MPREb_prog": {
                    "status": "done",
                    "progress": 100,
                    "done": 3,
                    "total": 3,
                }
            },
            clear=True,
        )
        resp = client.get("/download/progress/album/MPREb_prog")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert resp.text.count("data:") == 1
        assert "done" in resp.text

    def test_list_downloads_exposes_browse_ids(self, client):
        """GET /downloads debe incluir albumBrowseId y artistBrowseId."""
        from db import get_db

        with get_db() as conn:
            conn.execute(
                """INSERT INTO downloads
                   (video_id, title, artist, thumbnail, duration,
                    album_title, album_browse_id, artist_browse_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "brws_ids_vid",
                    "Song",
                    "Artist",
                    "t.jpg",
                    180,
                    "Album X",
                    "MPREb_x",
                    "UC_y",
                ),
            )

        resp = client.get("/downloads")
        found = [s for s in resp.json() if s["videoId"] == "brws_ids_vid"]
        assert found and found[0]["albumBrowseId"] == "MPREb_x"
        assert found[0]["artistBrowseId"] == "UC_y"
