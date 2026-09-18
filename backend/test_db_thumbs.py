"""Tests para db.py — Funciones de thumbnails en history/downloads.

Cubre:
- _parse_thumbs_json: parseo de JSON string a lista de dicts
- db_log_history: almacenamiento de thumbnails[] como JSON
- db_get_history: devolución de thumbnails[] parseado
- Migración: columna thumbnails existe en history/downloads/playlist_songs
"""

import json

from db import (
    _parse_thumbs_json,
    db_get_history,
    db_log_history,
    get_db,
    init_db,
)


class TestParseThumbsJson:
    """Tests para _parse_thumbs_json — helper de parseo."""

    def test_none_returns_empty(self):
        """None debe devolver lista vacía."""
        assert _parse_thumbs_json(None) == []

    def test_empty_string_returns_empty(self):
        """String vacío debe devolver lista vacía."""
        assert _parse_thumbs_json("") == []

    def test_invalid_json_string_returns_empty(self):
        """String JSON inválido debe devolver lista vacía."""
        assert _parse_thumbs_json("not-json") == []

    def test_valid_json_array_returns_parsed(self):
        """String JSON válido debe devolver lista parseada."""
        data = [{"url": "https://example.com/img.jpg", "width": 200, "height": 200}]
        raw = json.dumps(data)
        result = _parse_thumbs_json(raw)
        assert result == data
        assert result[0]["url"] == "https://example.com/img.jpg"

    def test_valid_json_multiple_entries(self):
        """Array JSON con múltiples thumbnails."""
        data = [
            {"url": "https://example.com/hd.jpg", "width": 1200, "height": 1200},
            {"url": "https://example.com/sm.jpg", "width": 120, "height": 120},
        ]
        result = _parse_thumbs_json(json.dumps(data))
        assert len(result) == 2
        assert result[0]["width"] == 1200
        assert result[1]["width"] == 120

    def test_already_a_list_returns_as_is(self):
        """Si ya es una lista, debe devolverse sin cambios."""
        data = [{"url": "https://example.com/img.jpg", "width": 576, "height": 576}]
        assert _parse_thumbs_json(data) == data

    def test_empty_list_returns_empty(self):
        """Lista vacía debe devolver lista vacía."""
        assert _parse_thumbs_json([]) == []

    def test_integer_returns_empty(self):
        """Tipo inesperado (int) debe devolver lista vacía."""
        assert _parse_thumbs_json(42) == []

    def test_google_thumbnails_structure(self):
        """Estructura típica de thumbnails de googleusercontent."""
        data = [
            {
                "url": "https://lh3.googleusercontent.com/abc=w120-h120-l90-rj",
                "width": 120,
                "height": 120,
            },
            {
                "url": "https://lh3.googleusercontent.com/abc=w576-h576-l90-rj",
                "width": 576,
                "height": 576,
            },
            {
                "url": "https://lh3.googleusercontent.com/abc=w2048-h2048-l90-rj",
                "width": 2048,
                "height": 2048,
            },
        ]
        result = _parse_thumbs_json(json.dumps(data))
        assert len(result) == 3
        assert result[2]["width"] == 2048
        assert "googleusercontent" in result[0]["url"]


class TestHistoryThumbnails:
    """Tests para thumbnails[] en history — db_log_history y db_get_history."""

    def _log_song(self, video_id, thumbnail="", thumbnails=None):
        """Helper para registrar una canción en el historial."""
        db_log_history(
            {
                "videoId": video_id,
                "title": f"Song {video_id}",
                "artist": "Test Artist",
                "thumbnail": thumbnail,
                "duration": 200,
                "thumbnails": thumbnails or [],
            }
        )

    def test_log_stores_thumbnails_as_json_string(self):
        """db_log_history debe guardar thumbnails[] como JSON string en la DB."""
        thumbs = [
            {
                "url": "https://lh3.googleusercontent.com/test=w120-h120-l90-rj",
                "width": 120,
                "height": 120,
            },
            {
                "url": "https://lh3.googleusercontent.com/test=w576-h576-l90-rj",
                "width": 576,
                "height": 576,
            },
        ]
        self._log_song("thumbs_test_1", thumbnail=thumbs[-1]["url"], thumbnails=thumbs)

        with get_db() as conn:
            row = conn.execute(
                "SELECT thumbnails FROM history WHERE video_id='thumbs_test_1'"
            ).fetchone()

        assert row is not None
        raw = row["thumbnails"]
        # Debe ser un string JSON (no una lista ya parseada)
        assert isinstance(raw, str), f"Se esperaba string, got {type(raw)}"
        parsed = json.loads(raw)
        assert parsed == thumbs

    def test_log_without_thumbnails_stores_empty_array(self):
        """Si no se pasan thumbnails, debe guardarse '[]'."""
        self._log_song("thumbs_test_empty")
        with get_db() as conn:
            row = conn.execute(
                "SELECT thumbnails FROM history WHERE video_id='thumbs_test_empty'"
            ).fetchone()
        raw = row["thumbnails"]
        parsed = json.loads(raw)
        assert parsed == []

    def test_get_history_returns_parsed_thumbnails(self):
        """db_get_history debe devolver thumbnails[] como lista de dicts."""
        thumbs = [
            {
                "url": "https://i.ytimg.com/vi/test123/maxresdefault.jpg",
                "width": 1280,
                "height": 720,
            },
            {
                "url": "https://i.ytimg.com/vi/test123/mqdefault.jpg",
                "width": 320,
                "height": 180,
            },
        ]
        self._log_song("thumbs_get_test", thumbnail=thumbs[0]["url"], thumbnails=thumbs)

        history = db_get_history(limit=50)
        found = [h for h in history if h["videoId"] == "thumbs_get_test"]
        assert len(found) == 1
        entry = found[0]
        assert "thumbnails" in entry
        assert isinstance(entry["thumbnails"], list), (
            f"Se esperaba list, got {type(entry['thumbnails'])}"
        )
        assert entry["thumbnails"] == thumbs
        assert entry["thumbnail"] == thumbs[0]["url"]

    def test_get_history_without_thumbnails_returns_empty(self):
        """Entradas sin thumbnails deben tener lista vacía."""
        self._log_song("thumbs_no_thumbs")
        history = db_get_history(limit=50)
        found = [h for h in history if h["videoId"] == "thumbs_no_thumbs"]
        assert len(found) == 1
        assert found[0]["thumbnails"] == []

    def test_log_updates_thumbnails_on_conflict(self):
        """Al reproducir la misma canción, thumbnails debe actualizarse."""
        old_thumbs = [
            {"url": "https://example.com/old.jpg", "width": 200, "height": 200}
        ]
        new_thumbs = [
            {"url": "https://example.com/new.jpg", "width": 400, "height": 400}
        ]

        # Primera reproducción (insert)
        self._log_song(
            "thumbs_update",
            thumbnail="https://example.com/old.jpg",
            thumbnails=old_thumbs,
        )
        # Segunda reproducción (update ON CONFLICT)
        self._log_song(
            "thumbs_update",
            thumbnail="https://example.com/new.jpg",
            thumbnails=new_thumbs,
        )

        history = db_get_history(limit=50)
        found = [h for h in history if h["videoId"] == "thumbs_update"]
        assert len(found) == 1
        assert found[0]["thumbnails"] == new_thumbs
        assert found[0]["thumbnail"] == "https://example.com/new.jpg"

    def test_multiple_songs_each_have_correct_thumbnails(self):
        """Varias canciones deben tener sus thumbnails correctos."""
        songs = {
            "multi_a": [
                {"url": "https://example.com/a.jpg", "width": 100, "height": 100}
            ],
            "multi_b": [
                {"url": "https://example.com/b.jpg", "width": 200, "height": 200}
            ],
            "multi_c": [],
        }
        for vid, thumbs in songs.items():
            thumb_url = thumbs[-1]["url"] if thumbs else ""
            self._log_song(vid, thumbnail=thumb_url, thumbnails=thumbs)

        history = db_get_history(limit=50)
        for vid, expected_thumbs in songs.items():
            found = [h for h in history if h["videoId"] == vid]
            assert len(found) == 1, f"No se encontró {vid}"
            assert found[0]["thumbnails"] == expected_thumbs, (
                f"Thumbnails mismatch para {vid}: "
                f"expected {expected_thumbs}, got {found[0]['thumbnails']}"
            )


class TestDownloadThumbnailsMigration:
    """Tests para verificar que la migración agregó la columna thumbnails."""

    def test_history_has_thumbnails_column(self):
        """La tabla history debe tener la columna thumbnails."""
        init_db()
        with get_db() as conn:
            cols = [r[1] for r in conn.execute("PRAGMA table_info(history)").fetchall()]
        assert "thumbnails" in cols, (
            f"Columna thumbnails no encontrada en history. Columnas: {cols}"
        )

    def test_downloads_has_thumbnails_column(self):
        """La tabla downloads debe tener la columna thumbnails."""
        init_db()
        with get_db() as conn:
            cols = [
                r[1] for r in conn.execute("PRAGMA table_info(downloads)").fetchall()
            ]
        assert "thumbnails" in cols, (
            f"Columna thumbnails no encontrada en downloads. Columnas: {cols}"
        )

    def test_playlist_songs_has_thumbnails_column(self):
        """La tabla playlist_songs debe tener la columna thumbnails."""
        init_db()
        with get_db() as conn:
            cols = [
                r[1]
                for r in conn.execute("PRAGMA table_info(playlist_songs)").fetchall()
            ]
        assert "thumbnails" in cols, (
            f"Columna thumbnails no encontrada en playlist_songs. Columnas: {cols}"
        )

    def test_thumbnails_column_default_is_empty_array(self):
        """El default de thumbnails debe ser '[]' (JSON array vacío)."""
        init_db()
        with get_db() as conn:
            # Insertar una fila sin especificar thumbnails
            conn.execute(
                "INSERT INTO history(video_id, title, artist) VALUES ('mig_default_test', 'Test', 'T')"
            )
            row = conn.execute(
                "SELECT thumbnails FROM history WHERE video_id='mig_default_test'"
            ).fetchone()
        raw = row["thumbnails"]
        assert raw is not None
        parsed = json.loads(raw)
        assert parsed == [], f"Default debería ser [], got {parsed}"

    def test_thumbnails_column_accepts_json(self):
        """La columna thumbnails debe aceptar y devolver JSON strings."""
        init_db()
        thumbs_data = [
            {"url": "https://example.com/hd.jpg", "width": 1200, "height": 1200},
        ]
        with get_db() as conn:
            conn.execute(
                "INSERT INTO downloads(video_id, title, artist, thumbnail, duration, file_path, thumbnails) "
                "VALUES ('mig_json_test', 'Test', 'T', '', 0, '', ?)",
                (json.dumps(thumbs_data),),
            )
            row = conn.execute(
                "SELECT thumbnails FROM downloads WHERE video_id='mig_json_test'"
            ).fetchone()
        parsed = json.loads(row["thumbnails"])
        assert parsed == thumbs_data
