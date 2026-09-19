"""Tests para get_db() — pool de conexiones SQLite.

get_db() ahora devuelve conexiones a un pool reutilizable en vez de abrir/
cerrar una por operación:

- Tras commit correcto, la conexión vuelve al pool (NO se cierra).
- Ante excepción, se hace rollback y la conexión vuelve al pool.
- Si el rollback mismo falla, se descarta y cierra la conexión.
"""

from unittest.mock import patch

from db import get_db


class TestGetDbPool:
    def test_connection_returned_to_pool_on_success(self):
        """Flujo exitoso: commit y NO se cierra la conexión."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value

            with get_db() as conn:
                conn.execute("SELECT 1")

            mock_conn.commit.assert_called_once()
            mock_conn.close.assert_not_called()

    def test_reuses_pool_connection(self):
        """Dos get_db() consecutivos reutilizan UNA misma conexión."""
        with patch("db.sqlite3.connect") as mock_connect:
            with get_db() as conn:
                conn.execute("SELECT 1")
            with get_db() as conn2:
                conn2.execute("SELECT 1")

            # Solo se creó 1 conexión (la segunda viene del pool)
            mock_connect.assert_called_once()
            mock_connect.return_value.commit.assert_called()
            mock_connect.return_value.close.assert_not_called()

    def test_reconnects_after_dropped_connection(self):
        """Si una conexión se descarta, la siguiente op abre una nueva."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value
            mock_conn.rollback.side_effect = RuntimeError("database closed")
            try:
                with get_db():
                    raise RuntimeError("boom")
            except RuntimeError:
                pass
            mock_conn.close.assert_called_once()

            # Conexión descartada → pool vacío → get_db() debe reconectar
            with get_db() as conn2:
                conn2.execute("SELECT 1")
            assert mock_connect.call_count == 2

    def test_commits_on_success(self):
        """Flujo exitoso debe hacer commit explícito."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value

            with get_db() as conn:
                conn.execute("INSERT INTO t VALUES (1)")

            mock_conn.commit.assert_called_once()

    def test_rollback_on_error(self):
        """Ante excepción se hace rollback y la conexión vuelve al pool."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value

            try:
                with get_db() as conn:
                    conn.execute("SELECT 1")
                    raise RuntimeError("boom")
            except RuntimeError:
                pass

            mock_conn.rollback.assert_called_once()
            mock_conn.close.assert_not_called()

    def test_connection_dropped_when_rollback_fails(self):
        """Si el rollback falla, la conexión se cierra (no contamina el pool)."""
        with patch("db.sqlite3.connect") as mock_connect:
            mock_conn = mock_connect.return_value
            mock_conn.rollback.side_effect = RuntimeError("database closed")

            try:
                with get_db():
                    raise RuntimeError("boom")
            except RuntimeError:
                pass

            mock_conn.close.assert_called_once()

    def test_pool_drained_by_atexit(self):
        """El pool entero se cierra en shutdown (atexit)."""
        from unittest.mock import patch as _patch

        from db import _drain_pool

        with _patch("db.sqlite3.connect") as mock_connect:
            with get_db():
                conn = mock_connect.return_value
                conn.execute("SELECT 1")
            _drain_pool()
            mock_connect.return_value.close.assert_called_once()
