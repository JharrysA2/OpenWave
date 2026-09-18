"""Tests para get_db() como context manager — cierre de conexiones SQLite.

La no-clausura de conexiones era una fuga de file descriptors en una app
de larga duración. get_db() ahora debe cerrar SIEMPRE la conexión, haga
commit o rollback.
"""

from unittest.mock import patch

from db import get_db


class TestGetDbClosesConnection:
    def test_closes_on_success(self):
        """En flujo normal, la conexión se cierra tras el commit."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value
            mock_conn.execute.return_value = mock_conn

            with get_db() as conn:
                conn.execute("SELECT 1")

            mock_conn.close.assert_called_once()

    def test_closes_on_error(self):
        """Ante excepción, la conexión se cierra tras el rollback."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value
            mock_conn.execute.return_value = mock_conn

            try:
                with get_db() as conn:
                    conn.execute("SELECT 1")
                    raise RuntimeError("boom")
            except RuntimeError:
                pass

            mock_conn.rollback.assert_called_once()
            mock_conn.close.assert_called_once()

    def test_commits_on_success(self):
        """Flujo exitoso debe hacer commit explícito."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value
            mock_conn.execute.return_value = mock_conn

            with get_db() as conn:
                conn.execute("INSERT INTO t VALUES (1)")

            mock_conn.commit.assert_called_once()
