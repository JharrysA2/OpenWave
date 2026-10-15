"""Tests para routes/video_routes.py — Preparación de vídeo de la pantalla de letras."""

from config import VIDEO_DIR


class TestVideoStatus:
    """GET /video/status/{video_id}."""

    def test_status_no_preparado(self, client):
        resp = client.get("/video/status/abc123")
        assert resp.status_code == 200
        assert resp.json() == {"prepared": False, "sin_videoclip": False}

    def test_status_sin_videoclip_oficial(self, client, mocker):
        mocker.patch("routes.video_routes.sin_videoclip", return_value=True)
        resp = client.get("/video/status/abc123")
        assert resp.json()["sin_videoclip"] is True

    def test_status_sin_oficial_no_consulta(self, client, mocker):
        mock_sin = mocker.patch("routes.video_routes.sin_videoclip", return_value=True)
        resp = client.get("/video/status/abc123?oficial=0")
        assert resp.json()["sin_videoclip"] is False
        assert mock_sin.call_count == 0

    def test_status_preparado_no_informa_de_resolucion(self, client, mocker):
        mock_sin = mocker.patch("routes.video_routes.sin_videoclip", return_value=True)
        p = VIDEO_DIR / "status_prep.mp4"
        p.write_bytes(b"x")
        try:
            resp = client.get("/video/status/status_prep")
            assert resp.json()["prepared"] is True
            assert "sin_videoclip" not in resp.json()
            assert mock_sin.call_count == 0
        finally:
            p.unlink(missing_ok=True)

    def test_status_preparado(self, client):
        p = VIDEO_DIR / "status_vid.mp4"
        p.write_bytes(b"x" * 42)
        try:
            resp = client.get("/video/status/status_vid")
            assert resp.status_code == 200
            assert resp.json() == {"prepared": True}
        finally:
            p.unlink(missing_ok=True)

    def test_status_video_id_invalido(self, client):
        resp = client.get("/video/status/bad..id")
        assert resp.status_code == 400


class TestVideoFile:
    """GET /video/file/{video_id} — vídeo con soporte Range."""

    def test_404_sin_preparar(self, client):
        assert client.get("/video/file/nope_vid").status_code == 404

    def test_sirve_completo_sin_range(self, client):
        p = VIDEO_DIR / "full_vid.mp4"
        p.write_bytes(b"0123456789")
        try:
            resp = client.get("/video/file/full_vid")
            assert resp.status_code == 200
            assert resp.content == b"0123456789"
            assert resp.headers["accept-ranges"] == "bytes"
        finally:
            p.unlink(missing_ok=True)

    def test_sirve_rango_206(self, client):
        p = VIDEO_DIR / "rng_vid.mp4"
        p.write_bytes(b"0123456789")
        try:
            resp = client.get("/video/file/rng_vid", headers={"Range": "bytes=0-3"})
            assert resp.status_code == 206
            assert resp.content == b"0123"
            assert resp.headers["content-range"] == "bytes 0-3/10"
        finally:
            p.unlink(missing_ok=True)

    def test_webm_usa_su_mime(self, client):
        p = VIDEO_DIR / "webm_vid.webm"
        p.write_bytes(b"webm-bytes")
        try:
            resp = client.get("/video/file/webm_vid")
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("video/webm")
        finally:
            p.unlink(missing_ok=True)


class TestVideoPrepare:
    """POST /video/prepare/{video_id}."""

    def test_lanza_la_preparacion(self, client, mocker):
        mock_prepare = mocker.patch("routes.video_routes.prepare_video")
        resp = client.post("/video/prepare/prep_vid")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        import time

        for _ in range(50):
            if mock_prepare.call_count >= 1:
                break
            time.sleep(0.05)
        assert mock_prepare.call_count == 1
        assert mock_prepare.call_args[0][0] == "prep_vid"

    def test_already_no_relanza(self, client, mocker):
        mock_prepare = mocker.patch("routes.video_routes.prepare_video")
        mocker.patch("routes.video_routes.is_prepared", return_value=True)
        resp = client.post("/video/prepare/ya_vid")
        assert resp.status_code == 200
        assert resp.json()["already"] is True
        assert mock_prepare.call_count == 0

    def test_oficial_se_desactiva_con_la_query(self, client, mocker):
        mock_prepare = mocker.patch("routes.video_routes.prepare_video")
        resp = client.post("/video/prepare/of_vid?oficial=0")
        assert resp.status_code == 200

        import time

        for _ in range(50):
            if mock_prepare.call_count >= 1:
                break
            time.sleep(0.05)
        assert mock_prepare.call_args[0] == ("of_vid", False)

    def test_oficial_activo_por_defecto(self, client, mocker):
        mock_prepare = mocker.patch("routes.video_routes.prepare_video")
        client.post("/video/prepare/def_vid")

        import time

        for _ in range(50):
            if mock_prepare.call_count >= 1:
                break
            time.sleep(0.05)
        assert mock_prepare.call_args[0] == ("def_vid", True)

    def test_video_id_invalido(self, client):
        assert client.post("/video/prepare/bad..id").status_code == 400


class TestVideoDelete:
    """DELETE /video/{video_id}."""

    def test_borra_el_video(self, client, mocker):
        p = VIDEO_DIR / "del_route.mp4"
        p.write_bytes(b"x")
        mocker.patch.dict("routes.video_routes.video_progress", {}, clear=True)
        try:
            resp = client.delete("/video/del_route")
            assert resp.status_code == 200
            assert resp.json()["ok"] is True
            assert not p.exists()
        finally:
            p.unlink(missing_ok=True)


class TestVideoProgressSse:
    """GET /video/progress/{video_id} — SSE."""

    def test_emite_done_y_cierra(self, client, mocker):
        mocker.patch.dict(
            "routes.video_routes.video_progress",
            {"prog_vid": {"status": "done", "progress": 100}},
            clear=True,
        )
        resp = client.get("/video/progress/prog_vid")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert resp.text.count("data:") == 1
        assert "done" in resp.text

    def test_emite_error_y_cierra(self, client, mocker):
        mocker.patch.dict(
            "routes.video_routes.video_progress",
            {"err_vid": {"status": "error", "progress": 0, "error": "sin ffmpeg"}},
            clear=True,
        )
        resp = client.get("/video/progress/err_vid")
        assert "sin ffmpeg" in resp.text
        assert resp.text.count("data:") == 1

    def test_emite_sin_video_y_cierra(self, client, mocker):
        """La canción no tiene videoclip oficial: el SSE no se queda abierto."""
        mocker.patch.dict(
            "routes.video_routes.video_progress",
            {"sv_vid": {"status": "sin_video", "progress": 100, "error": None}},
            clear=True,
        )
        resp = client.get("/video/progress/sv_vid")
        assert "sin_video" in resp.text
        assert resp.text.count("data:") == 1

    def test_timeout_cierra_con_error(self, client, mocker):
        mocker.patch("routes.video_routes._SSE_MAX_SECONDS", 0.0)
        mocker.patch.dict(
            "routes.video_routes.video_progress",
            {"hang_vid": {"status": "downloading", "progress": 10}},
            clear=True,
        )
        resp = client.get("/video/progress/hang_vid")
        assert resp.status_code == 200
        assert '"status": "downloading"' in resp.text
        assert '"error": "timeout"' in resp.text
