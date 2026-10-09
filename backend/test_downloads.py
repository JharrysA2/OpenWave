"""Tests for backend/downloads.py — Lógica de descarga de canciones."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

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
    @patch("downloads.subprocess.run")
    @patch("downloads.os.replace")
    def test_successful_download(
        self,
        mock_os_replace,
        mock_subprocess_run,
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
        mp3_mock.exists.return_value = False
        mock_path.return_value = mp3_mock

        # 1ª llamada (clase Path.exists): el .mp4 fuente ya está tras
        # ydl.download → entra en la conversión. El .mp3 final se consulta
        # vía mp3_mock (exists=False → descarga), no por la clase.
        mock_exists.side_effect = [True]

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
        # Conversión atómica: ffmpeg escribe en .part y solo os.replace
        # publica el .mp3 final.
        mock_subprocess_run.assert_called_once()
        conv_cmd = mock_subprocess_run.call_args[0][0]
        assert conv_cmd[-1].endswith(".mp3.part")
        mock_os_replace.assert_called_once()
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
    def test_skips_download_when_mp3_exists(
        self,
        mock_ydl_cls,
        mock_path,
        mock_exists,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
    ):
        """MP3 ya presente: no debe volver a descargar (idempotencia de álbum)."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mp3_mock = MagicMock(spec=Path)
        mp3_mock.exists.return_value = True
        mock_path.return_value = mp3_mock
        mock_exists.return_value = False

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        mock_cover_path = MagicMock(spec=Path)
        mock_cover_path.exists.return_value = True
        mock_covers_dir.__truediv__.return_value = mock_cover_path

        mock_lyric_path = MagicMock(spec=Path)
        mock_lyric_path.exists.return_value = True
        mock_lyrics_dir.__truediv__.return_value = mock_lyric_path

        from downloads import download_progress

        do_download(
            video_id="existing_vid",
            title="Already There",
            artist="Test Artist",
            thumbnail="",
            duration=100,
            album_browse_id="MPREb_album",
            artist_browse_id="UC_artist",
        )

        mock_ydl.download.assert_not_called()
        assert download_progress["existing_vid"]["status"] == "done"
        mock_conn.execute.assert_called()
        args = mock_conn.execute.call_args[0][1]
        assert "MPREb_album" in args and "UC_artist" in args

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

    @patch("downloads.COVERS_DIR")
    @patch("downloads.LYRICS_DIR")
    @patch("downloads.get_db")
    @patch("downloads.urllib.request.urlopen")
    @patch("yt_dlp.YoutubeDL")
    @patch("lyrics.get_lyrics", new=AsyncMock())
    def test_conversion_is_atomic(
        self,
        mock_ydl_cls,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
        tmp_path,
    ):
        """La conversión a MP3 no publica el .mp3 final hasta estar COMPLETO.

        Regresión del bug «Calidad Alta: canciones de 15-30 s»: el
        postprocesador FFmpegExtractAudio de yt-dlp escribía el .mp3 FINAL
        directamente (temp_path == new_path), así que stream/exists
        devolvía «descarga lista» con el archivo a medias y el reproductor
        reproducía solo los primeros bytes (≈15-30 s a 192 kb/s).
        """
        vid = "atomicvid00"
        final = tmp_path / f"{vid}.mp3"
        part = tmp_path / f"{vid}.mp3.part"
        src_file = tmp_path / f"{vid}.mp4"
        seen = {}

        def fake_ydl_download(urls):
            # yt-dlp solo produce el .mp4 fuente; convertimos nosotros.
            src_file.write_bytes(b"video-completo")

        def fake_ffmpeg(cmd, **kwargs):
            # Durante la conversión el .mp3 FINAL aún no existe...
            assert not final.exists()
            seen["cmd"] = cmd
            Path(cmd[-1]).write_bytes(b"mp3-conversion-done")
            # ...incluso con el temporal ya escrito.
            assert not final.exists()
            return MagicMock()

        mock_ydl = MagicMock()
        mock_ydl.download.side_effect = fake_ydl_download
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        with (
            patch("downloads.MUSIC_DIR", tmp_path),
            patch("downloads.get_mp3_path", lambda _v: final),
            patch("downloads.subprocess.run", side_effect=fake_ffmpeg),
        ):
            do_download(
                video_id=vid,
                title="Atomic",
                artist="Artist",
                thumbnail="",
                duration=100,
                quality="320",
            )

        # El .mp3 final solo apareció con el rename → siempre COMPLETO.
        assert final.exists()
        assert final.read_bytes() == b"mp3-conversion-done"
        assert not part.exists()  # sin temporales colgados
        assert not src_file.exists()  # fuente eliminada tras convertir
        cmd = seen["cmd"]
        assert cmd[-1].endswith(".mp3.part")  # ffmpeg escribe en .part
        assert "-b:a" in cmd and "320k" in cmd  # bitrate elegido respetado

        from downloads import download_progress

        assert download_progress[vid]["status"] == "done"

    @patch("downloads.COVERS_DIR")
    @patch("downloads.LYRICS_DIR")
    @patch("downloads.get_db")
    @patch("downloads.urllib.request.urlopen")
    @patch("yt_dlp.YoutubeDL")
    @patch("lyrics.get_lyrics", new=AsyncMock())
    def test_conversion_failure_leaves_no_partial(
        self,
        mock_ydl_cls,
        mock_urlopen,
        mock_get_db,
        mock_lyrics_dir,
        mock_covers_dir,
        tmp_path,
    ):
        """Si ffmpeg falla a mitad, NO se publica ningún .mp3 parcial."""
        vid = "failconv000"
        final = tmp_path / f"{vid}.mp3"
        part = tmp_path / f"{vid}.mp3.part"
        src_file = tmp_path / f"{vid}.mp4"

        def fake_ydl_download(urls):
            src_file.write_bytes(b"video-completo")

        def failing_ffmpeg(cmd, **kwargs):
            Path(cmd[-1]).write_bytes(b"a-mitad")  # murió a media carrera
            raise RuntimeError("ffmpeg exited 1")

        mock_ydl = MagicMock()
        mock_ydl.download.side_effect = fake_ydl_download
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        mock_conn = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_conn

        with (
            patch("downloads.MUSIC_DIR", tmp_path),
            patch("downloads.get_mp3_path", lambda _v: final),
            patch("downloads.subprocess.run", side_effect=failing_ffmpeg),
        ):
            do_download(
                video_id=vid,
                title="Fail",
                artist="Artist",
                thumbnail="",
                duration=100,
            )

        from downloads import download_progress

        assert download_progress[vid]["status"] == "error"
        # Jamás un .mp3 parcial visible; el temporal se limpia y la fuente
        # queda para que el reintento re-convierta sin re-descargar.
        assert not final.exists()
        assert not part.exists()
        assert src_file.exists()
