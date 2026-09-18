"""Tests for backend/downloads.py — Lógica de descarga de canciones."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from downloads import do_download, get_mp3_path


class TestGetMp3Path:
    """Tests para get_mp3_path()."""

    def test_returns_mp3_path(self):
        """Debe devolver un path con extensión .mp3 en el directorio MUSIC_DIR."""
        path = get_mp3_path("aaaaaaaaaaa")
        assert isinstance(path, Path)
        assert path.name == "aaaaaaaaaaa.mp3"

    def test_different_ids_produce_different_paths(self):
        """IDs distintos deben dar paths distintos."""
        p1 = get_mp3_path("bbbbbbbbbbb")
        p2 = get_mp3_path("ccccccccccc")
        assert p1 != p2

    def test_rejects_dots_and_separators(self):
        """IDs con puntos o separadores deben rechazarse."""
        for evil in ("a-b_c.d", "..\\..\\evil", "../evil", "evil\\x", ""):
            with pytest.raises(ValueError):
                get_mp3_path(evil)


class TestDoDownload:
    """Tests para do_download() con mocking de yt-dlp, urllib y DB."""

    @patch("downloads.COVERS_DIR")
    @patch("downloads.LYRICS_DIR")
    @patch("downloads.get_db")
    @patch("downloads.urllib.request.urlopen")
    @patch("downloads.Path.exists")
    @patch("downloads.get_mp3_path")
    @patch("yt_dlp.YoutubeDL")
    def test_successful_download(
        self,
        mock_ydl_cls,
        mock_path,
        mock_exists,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
    ):
        """Descarga exitosa debe producir MP3, metadata y registro en DB."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mp3_mock = MagicMock(spec=Path)
        mp3_mock.exists.return_value = True
        mock_path.return_value = mp3_mock

        mock_exists.return_value = False

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        mock_cover_path = MagicMock(spec=Path)
        mock_cover_path.exists.return_value = False
        mock_covers_dir.__truediv__.return_value = mock_cover_path

        mock_lyric_path = MagicMock(spec=Path)
        mock_lyric_path.exists.return_value = False
        mock_lyrics_dir.__truediv__.return_value = mock_lyric_path

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"image_data"
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        from downloads import download_progress

        do_download(
            video_id="test_vid",
            title="Test Song",
            artist="Test Artist",
            thumbnail="https://example.com/thumb.jpg",
            duration=200,
        )

        mock_ydl.download.assert_called_once()
        mock_conn.execute.assert_called()
        sql = mock_conn.execute.call_args[0][0]
        assert "INSERT INTO downloads" in sql
        assert download_progress["test_vid"]["status"] == "done"

    @patch("downloads.COVERS_DIR")
    @patch("downloads.LYRICS_DIR")
    @patch("downloads.get_db")
    @patch("downloads.urllib.request.urlopen")
    @patch("downloads.Path.exists")
    @patch("downloads.get_mp3_path")
    @patch("yt_dlp.YoutubeDL")
    def test_download_handles_cover_failure(
        self,
        mock_ydl_cls,
        mock_path,
        mock_exists,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
    ):
        """Si falla la descarga del cover, la descarga principal debe continuar."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mp3_mock = MagicMock(spec=Path)
        mp3_mock.exists.return_value = True
        mock_path.return_value = mp3_mock

        mock_exists.return_value = False

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        mock_cover_path = MagicMock(spec=Path)
        mock_cover_path.exists.return_value = False
        mock_covers_dir.__truediv__.return_value = mock_cover_path

        mock_lyric_path = MagicMock(spec=Path)
        mock_lyric_path.exists.return_value = False
        mock_lyrics_dir.__truediv__.return_value = mock_lyric_path

        mock_urlopen.side_effect = Exception("Connection error")

        from downloads import download_progress

        do_download(
            video_id="cover_fail_vid",
            title="Cover Fail",
            artist="Artist",
            thumbnail="https://example.com/thumb.jpg",
            duration=180,
        )

        assert download_progress["cover_fail_vid"]["status"] == "done"

    @patch("downloads.get_mp3_path")
    @patch("yt_dlp.YoutubeDL")
    def test_download_ytdlp_error(self, mock_ydl_cls, mock_path):
        """Si yt-dlp lanza error, do_download debe marcarlo como error."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl
        mock_ydl.download.side_effect = Exception("yt-dlp failed")

        mp3_mock = MagicMock(spec=Path)
        mp3_mock.exists.return_value = False
        mock_path.return_value = mp3_mock

        from downloads import download_progress

        do_download(
            video_id="error_vid",
            title="Error Song",
            artist="Error Artist",
            thumbnail="",
            duration=0,
        )

        assert download_progress["error_vid"]["status"] == "error"

    @patch("downloads.COVERS_DIR")
    @patch("downloads.LYRICS_DIR")
    @patch("downloads.get_db")
    @patch("downloads.urllib.request.urlopen")
    @patch("downloads.Path.exists")
    @patch("downloads.get_mp3_path")
    @patch("yt_dlp.YoutubeDL")
    def test_download_cover_fallback_hd(
        self,
        mock_ydl_cls,
        mock_path,
        mock_exists,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
    ):
        """Thumbnails de googleusercontent deben upgradearse a HD."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mp3_mock = MagicMock(spec=Path)
        mp3_mock.exists.return_value = True
        mock_path.return_value = mp3_mock

        mock_exists.return_value = False

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        mock_cover_path = MagicMock(spec=Path)
        mock_cover_path.exists.return_value = False
        mock_covers_dir.__truediv__.return_value = mock_cover_path

        mock_lyric_path = MagicMock(spec=Path)
        mock_lyric_path.exists.return_value = False
        mock_lyrics_dir.__truediv__.return_value = mock_lyric_path

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"img"
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        do_download(
            video_id="hd_vid",
            title="HD Test",
            artist="Artist",
            thumbnail="https://lh3.googleusercontent.com/abc=h120",
            duration=200,
        )

        # Verificar que se usó URL HD (primer call a urlopen)
        first_call_request = mock_urlopen.call_args_list[0][0][0]
        assert (
            "w576" in first_call_request.full_url
            or "576" in first_call_request.full_url
        )

    @patch("downloads.COVERS_DIR")
    @patch("downloads.LYRICS_DIR")
    @patch("downloads.get_db")
    @patch("downloads.urllib.request.urlopen")
    @patch("downloads.Path.exists")
    @patch("downloads.get_mp3_path")
    @patch("yt_dlp.YoutubeDL")
    def test_metadata_json_written(
        self,
        mock_ydl_cls,
        mock_path,
        mock_exists,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
    ):
        """Debe escribir un archivo JSON con la metadata."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mp3_mock = MagicMock(spec=Path)
        mp3_mock.exists.return_value = True
        mock_path.return_value = mp3_mock

        mock_exists.return_value = False

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        mock_cover_path = MagicMock(spec=Path)
        mock_cover_path.exists.return_value = False
        mock_covers_dir.__truediv__.return_value = mock_cover_path

        mock_lyric_path = MagicMock(spec=Path)
        mock_lyric_path.exists.return_value = False
        mock_lyrics_dir.__truediv__.return_value = mock_lyric_path

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"img"
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        with patch("downloads.MUSIC_DIR") as mock_music_dir:
            mock_meta_path = MagicMock(spec=Path)
            mock_music_dir.__truediv__.return_value = mock_meta_path

            do_download(
                video_id="meta_vid",
                title="Meta Song",
                artist="Meta Artist",
                thumbnail="https://example.com/thumb.jpg",
                duration=300,
            )

            mock_meta_path.write_text.assert_called_once()
            written = mock_meta_path.write_text.call_args[0][0]
            data = json.loads(written)
            assert data["videoId"] == "meta_vid"
            assert data["title"] == "Meta Song"
            assert data["duration"] == 300
