"""Tests para db.py — Funciones de feedback para entrenar recomendaciones."""

import pytest
from db import (
    db_get_artist_feedback_scores,
    db_record_feedback,
    get_db,
)


class TestDbRecordFeedback:
    """Tests para db_record_feedback."""

    def test_record_skip_basic(self):
        """Registrar skip debe insertar fila en song_feedback."""
        db_record_feedback("vid_skip_1", "skip", "Artist A", "Song A")
        with get_db() as conn:
            row = conn.execute(
                "SELECT video_id, action, artist, track_title FROM song_feedback WHERE video_id=?",
                ("vid_skip_1",),
            ).fetchone()
        assert row is not None
        assert row["video_id"] == "vid_skip_1"
        assert row["action"] == "skip"
        assert row["artist"] == "Artist A"
        assert row["track_title"] == "Song A"

    def test_record_complete(self):
        """Registrar complete debe funcionar."""
        db_record_feedback("vid_comp_1", "complete", "Artist B", "Song B")
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM song_feedback WHERE video_id='vid_comp_1' AND action='complete'"
            ).fetchone()[0]
        assert count == 1

    def test_record_like(self):
        """Registrar like."""
        db_record_feedback("vid_like_1", "like", "Artist C", "Song C")
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM song_feedback WHERE action='like'"
            ).fetchone()[0]
        assert count >= 1

    def test_record_multiple_actions_same_video(self):
        """Múltiples acciones para el mismo videoId deben insertarse todas."""
        db_record_feedback("vid_multi", "skip", "Artist D", "Song D")
        db_record_feedback("vid_multi", "complete", "Artist D", "Song D")
        db_record_feedback("vid_multi", "like", "Artist D", "Song D")
        with get_db() as conn:
            rows = conn.execute(
                "SELECT action FROM song_feedback WHERE video_id='vid_multi' ORDER BY id"
            ).fetchall()
        actions = [r["action"] for r in rows]
        assert actions == ["skip", "complete", "like"]

    def test_record_defaults(self):
        """Llamar solo con videoId y action debe usar defaults vacíos."""
        db_record_feedback("vid_defaults", "skip")
        with get_db() as conn:
            row = conn.execute(
                "SELECT artist, track_title FROM song_feedback WHERE video_id='vid_defaults'"
            ).fetchone()
        assert row["artist"] == ""
        assert row["track_title"] == ""

    def test_record_timestamp(self):
        """El created_at debe generarse automáticamente."""
        db_record_feedback("vid_ts", "complete", "Artist E", "Song E")
        with get_db() as conn:
            row = conn.execute(
                "SELECT created_at FROM song_feedback WHERE video_id='vid_ts'"
            ).fetchone()
        assert row["created_at"] is not None
        assert len(row["created_at"]) > 0


class TestDbGetArtistFeedbackScores:
    """Tests para db_get_artist_feedback_scores."""

    def _seed_feedback(self, video_id, action, artist):
        """Helper para insertar datos de prueba directamente."""
        db_record_feedback(video_id, action, artist, f"Song {video_id}")

    def test_empty_artist_list(self):
        """Lista vacía debe devolver dict vacío."""
        scores = db_get_artist_feedback_scores([])
        assert scores == {}

    def test_no_feedback_data(self):
        """Artista sin datos debe tener score neutral (0.5)."""
        scores = db_get_artist_feedback_scores(["Unknown Artist"])
        assert scores["Unknown Artist"] == 0.5

    def test_all_skips(self):
        """Artista que siempre se salta debe tener score 1.0."""
        self._seed_feedback("s1", "skip", "Always Skip")
        self._seed_feedback("s2", "skip", "Always Skip")
        self._seed_feedback("s3", "skip", "Always Skip")
        scores = db_get_artist_feedback_scores(["Always Skip"])
        assert scores["Always Skip"] == 1.0

    def test_all_completes(self):
        """Artista que siempre se completa debe tener score 0.0."""
        self._seed_feedback("c1", "complete", "Never Skip")
        self._seed_feedback("c2", "complete", "Never Skip")
        scores = db_get_artist_feedback_scores(["Never Skip"])
        assert scores["Never Skip"] == 0.0

    def test_mixed_feedback(self):
        """50% skip, 50% complete debe dar score 0.5."""
        self._seed_feedback("m1", "skip", "Mixed Artist")
        self._seed_feedback("m2", "complete", "Mixed Artist")
        scores = db_get_artist_feedback_scores(["Mixed Artist"])
        assert scores["Mixed Artist"] == 0.5

    def test_ratio_one_third(self):
        """1 skip de 3 totales debe dar ~0.333."""
        self._seed_feedback("r1", "skip", "Ratio Artist")
        self._seed_feedback("r2", "complete", "Ratio Artist")
        self._seed_feedback("r3", "complete", "Ratio Artist")
        scores = db_get_artist_feedback_scores(["Ratio Artist"])
        assert scores["Ratio Artist"] == pytest.approx(1.0 / 3.0)

    def test_multiple_artists(self):
        """Múltiples artistas deben devolver scores correctos para cada uno."""
        self._seed_feedback("x1", "skip", "Artist X")
        self._seed_feedback("x2", "skip", "Artist X")
        self._seed_feedback("y1", "complete", "Artist Y")
        self._seed_feedback("y2", "complete", "Artist Y")
        self._seed_feedback("y3", "complete", "Artist Y")
        self._seed_feedback("z1", "skip", "Artist Z")
        self._seed_feedback("z2", "complete", "Artist Z")

        scores = db_get_artist_feedback_scores(["Artist X", "Artist Y", "Artist Z"])
        assert scores["Artist X"] == 1.0  # all skips
        assert scores["Artist Y"] == 0.0  # all completes
        assert scores["Artist Z"] == 0.5  # 1 skip, 1 complete

    def test_only_completes_ignores_likes(self):
        """Likes no deben afectar el score (solo skip/complete cuentan)."""
        self._seed_feedback("l1", "like", "Liked Artist")
        self._seed_feedback("l2", "complete", "Liked Artist")
        scores = db_get_artist_feedback_scores(["Liked Artist"])
        assert scores["Liked Artist"] == 0.0  # 0 skip / 1 complete = 0

    def test_empty_artist_name(self):
        """Nombre de artista vacío debe devolver 0.5."""
        scores = db_get_artist_feedback_scores(["", "Real Artist"])
        assert scores[""] == 0.5

    def test_artist_name_with_special_chars(self):
        """Nombres con caracteres especiales (%, _) deben escaparse correctamente."""
        self._seed_feedback("sp1", "skip", "Rock & Roll Band")
        self._seed_feedback("sp2", "complete", "Rock & Roll Band")
        scores = db_get_artist_feedback_scores(["Rock & Roll Band"])
        assert scores["Rock & Roll Band"] == 0.5

    def test_like_and_unlike_do_not_affect_score(self):
        """'like' y 'unlike' no deben contar para el skip ratio."""
        self._seed_feedback("n1", "like", "Neutral Artist")
        self._seed_feedback("n2", "unlike", "Neutral Artist")
        self._seed_feedback("n3", "skip", "Neutral Artist")
        scores = db_get_artist_feedback_scores(["Neutral Artist"])
        assert scores["Neutral Artist"] == 1.0  # 1 skip / 1 total = 1.0


class TestCleanFeedbackFixture:
    """Tests para verificar que _clean_feedback limpia la tabla entre tests.

    Estos tests se ejecutan en orden: el primero inserta datos, y el segundo
    verifica que el fixture _clean_feedback (autouse=True) los limpió antes
    de que comience el segundo test.
    """

    def test_insert_feedback_row(self):
        """Insertar un feedback y verificar que existe en la DB."""
        db_record_feedback("fixture_test_vid", "skip", "Fixture Artist", "Fixture Song")
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM song_feedback"
            ).fetchone()[0]
        assert count == 1, "Debería haber 1 fila después de insertar"

    def test_table_is_empty_after_fixture_cleanup(self):
        """La tabla debe estar vacía porque _clean_feedback limpió entre tests.

        Si este test falla, el fixture _clean_feedback en conftest.py
        no está funcionando correctamente.
        """
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM song_feedback"
            ).fetchone()[0]
        assert count == 0, (
            f"Esperaba 0 filas pero encontré {count}. "
            "El fixture _clean_feedback debería haber limpiado la tabla "
            "antes de este test."
        )

    def test_clean_between_each_test(self):
        """Verificar nuevamente que la tabla está limpia (test independiente)."""
        # Insertar datos en este test
        db_record_feedback("clean_test_a", "complete", "Artist Clean")
        db_record_feedback("clean_test_b", "like", "Artist Clean")
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM song_feedback"
            ).fetchone()[0]
        assert count == 2, "Deberían haber 2 filas después de insertar"

    def test_yet_another_clean_state(self):
        """Confirmar que el fixture limpió lo del test anterior."""
        with get_db() as conn:
            rows = conn.execute(
                "SELECT video_id, action FROM song_feedback"
            ).fetchall()
        assert len(rows) == 0, (
            f"Se encontraron {len(rows)} filas residuales. "
            "El fixture _clean_feedback no está limpiando correctamente."
        )
