"""SoundWave Backend — Base de datos SQLite."""

import json
import re
import sqlite3
import threading

from config import DB_FILE
from logging_config import get_logger

logger = get_logger(__name__)

_db_lock = threading.Lock()


def get_db():
    """Obtener conexión SQLite con configuración optimizada."""
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-32768")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db():
    """Inicializar/migrar esquema de base de datos."""
    with get_db() as conn:
        # Migración: history antigua sin play_count
        try:
            cols = [r[1] for r in conn.execute("PRAGMA table_info(history)").fetchall()]
            if cols and "play_count" not in cols:
                conn.executescript("""
                    ALTER TABLE history ADD COLUMN play_count INTEGER DEFAULT 1;
                    ALTER TABLE history ADD COLUMN last_played_at TEXT;
                    UPDATE history SET last_played_at = played_at WHERE last_played_at IS NULL;
                    CREATE TABLE _hist_new (
                        video_id TEXT PRIMARY KEY, title TEXT, artist TEXT,
                        thumbnail TEXT, duration INTEGER DEFAULT 0,
                        play_count INTEGER DEFAULT 1,
                        last_played_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
                    );
                    INSERT OR REPLACE INTO _hist_new(video_id,title,artist,thumbnail,duration,play_count,last_played_at)
                        SELECT video_id,title,artist,thumbnail,duration,
                               SUM(COALESCE(play_count,1)),
                               MAX(COALESCE(last_played_at,'1970-01-01'))
                        FROM history GROUP BY video_id;
                    DROP TABLE history;
                    ALTER TABLE _hist_new RENAME TO history;
                """)
        except Exception as e:
            logger.warning("migration: %s", e)

        # Crear tablas
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS history (
                video_id TEXT PRIMARY KEY, title TEXT, artist TEXT,
                thumbnail TEXT, duration INTEGER DEFAULT 0,
                play_count INTEGER DEFAULT 1,
                last_played_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
                album_browse_id TEXT DEFAULT '',
                artist_browse_id TEXT DEFAULT '',
                album_title TEXT DEFAULT '',
                album_type TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_h_count ON history(play_count DESC);
            CREATE TABLE IF NOT EXISTS player_state (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
            CREATE TABLE IF NOT EXISTS playlist_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                video_id TEXT NOT NULL, title TEXT, artist TEXT,
                thumbnail TEXT, duration INTEGER DEFAULT 0,
                added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
            CREATE INDEX IF NOT EXISTS idx_pl_songs ON playlist_songs(playlist_id);
            CREATE TABLE IF NOT EXISTS downloads (
                video_id TEXT PRIMARY KEY, title TEXT, artist TEXT,
                thumbnail TEXT, duration INTEGER DEFAULT 0, file_path TEXT,
                downloaded_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
                album_title TEXT DEFAULT '', album_type TEXT DEFAULT ''
            );
        """)

        # Migraciones seguras (columnas nuevas)
        for col, default in [
            ("album_browse_id", "''"),
            ("artist_browse_id", "''"),
            ("album_title", "''"),
            ("album_type", "''"),
        ]:
            try:
                conn.execute(
                    f"ALTER TABLE history ADD COLUMN {col} TEXT DEFAULT {default}"
                )
                conn.commit()
            except Exception:
                pass
        try:
            conn.execute("ALTER TABLE playlists ADD COLUMN cover TEXT")
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE playlists ADD COLUMN color TEXT")
            conn.commit()
        except Exception:
            pass
        for col in ["album_title", "album_type"]:
            try:
                conn.execute(f"ALTER TABLE downloads ADD COLUMN {col} TEXT DEFAULT ''")
                conn.commit()
            except Exception:
                pass

        # Migración: thumbnails TEXT (JSON array) para history y downloads
        for tbl in ["history", "downloads", "playlist_songs"]:
            try:
                conn.execute(
                    f"ALTER TABLE {tbl} ADD COLUMN thumbnails TEXT DEFAULT '[]'"
                )
                conn.commit()
            except Exception:
                pass

        # Tabla de feedback para entrenar recomendaciones
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS song_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                action TEXT NOT NULL,
                artist TEXT DEFAULT '',
                track_title TEXT DEFAULT '',
                created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
            CREATE INDEX IF NOT EXISTS idx_feedback_artist ON song_feedback(artist);
            CREATE INDEX IF NOT EXISTS idx_feedback_action ON song_feedback(action);
            CREATE INDEX IF NOT EXISTS idx_feedback_video ON song_feedback(video_id);
        """)


def db_log_history(entry: dict):
    """Registrar reproducción en el historial.

    Guarda el array thumbnails[] como JSON para que MusicCover
    pueda mostrar resoluciones HD desde el historial.
    """
    thumbnails_json = json.dumps(
        entry.get("thumbnails", []),
        ensure_ascii=False,
    )
    with _db_lock, get_db() as conn:
        conn.execute(
            """INSERT INTO history(video_id,title,artist,thumbnail,duration,
               thumbnails,play_count,last_played_at,
               album_browse_id,artist_browse_id,album_title,album_type)
               VALUES(?,?,?,?,?,?,1,strftime('%Y-%m-%dT%H:%M:%S','now'),?,?,?,?)
               ON CONFLICT(video_id) DO UPDATE SET
                   play_count = play_count + 1,
                   last_played_at = strftime('%Y-%m-%dT%H:%M:%S','now'),
                   title = excluded.title, artist = excluded.artist,
                   thumbnail = excluded.thumbnail, duration = excluded.duration,
                   thumbnails = excluded.thumbnails,
                   album_browse_id = CASE WHEN excluded.album_browse_id != '' THEN excluded.album_browse_id ELSE history.album_browse_id END,
                   artist_browse_id = CASE WHEN excluded.artist_browse_id != '' THEN excluded.artist_browse_id ELSE history.artist_browse_id END,
                   album_title = CASE WHEN excluded.album_title != '' THEN excluded.album_title ELSE history.album_title END,
                   album_type = CASE WHEN excluded.album_type != '' THEN excluded.album_type ELSE history.album_type END""",
            (
                entry.get("videoId", ""),
                entry.get("title", ""),
                entry.get("artist", ""),
                entry.get("thumbnail", ""),
                int(entry.get("duration", 0) or 0),
                thumbnails_json,
                entry.get("albumBrowseId", "") or "",
                entry.get("artistBrowseId", "") or "",
                entry.get("albumTitle", "") or "",
                entry.get("albumType", "") or "",
            ),
        )


def db_get_history(limit: int = 100):
    """Obtener historial deduplicado por título normalizado.

    Incluye el array thumbnails[] parseado desde JSON para que
    MusicCover pueda mostrar resoluciones HD directamente.
    """
    with get_db() as conn:
        rows = conn.execute(
            """SELECT video_id as videoId,title,artist,thumbnail,duration,
               thumbnails,
               play_count as playCount,last_played_at as lastPlayedAt,
               COALESCE(album_browse_id,'') as albumBrowseId,
               COALESCE(artist_browse_id,'') as artistBrowseId,
               COALESCE(album_title,'') as albumTitle,
               COALESCE(album_type,'') as albumType
               FROM history ORDER BY play_count DESC, last_played_at DESC LIMIT ?""",
            (limit * 3,),
        ).fetchall()
    seen, out = set(), []
    for r in rows:
        norm = (
            re.sub(
                r"\s*(\(feat\..*?\)|\(with.*?\)|\[.*?\])\s*",
                "",
                (r["title"] or ""),
                flags=re.I,
            )
            .strip()
            .lower()
        )
        if norm and norm in seen:
            continue
        if norm:
            seen.add(norm)
        out.append(dict(r))
        if len(out) >= limit:
            break

    # Parsear thumbnails[] desde JSON string
    for item in out:
        item["thumbnails"] = _parse_thumbs_json(item.get("thumbnails"))

    return out


def _parse_thumbs_json(raw) -> list:
    """Parsear columna thumbnails (JSON string) a lista de dicts.

    La columna thumbnails almacena un array JSON como string.
    Esta función maneja: string JSON, lista ya parseada, o None.
    """
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return []
    if isinstance(raw, list):
        return raw
    return []


def db_save_state(key: str, value):
    """Guardar estado del reproductor."""
    with _db_lock, get_db() as conn:
        conn.execute(
            "INSERT INTO player_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)),
        )


def db_get_state(key: str, default=None):
    """Obtener estado guardado del reproductor."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT value FROM player_state WHERE key=?", (key,)
        ).fetchone()
    if row:
        try:
            return json.loads(row[0])
        except Exception:
            return row[0]
    return default


# ── Feedback (entrenar recomendaciones) ─────────────────────────────────────────


def db_record_feedback(
    video_id: str, action: str, artist: str = "", track_title: str = ""
):
    """Registrar acción de feedback del usuario.

    Acciones válidas:
        'skip'     — usuario saltó la canción rápidamente (< 5s)
        'complete' — la canción se reprodujo hasta el final
        'like'     — usuario marcó "me gusta"
        'unlike'   — usuario quitó "me gusta"
    """
    with _db_lock, get_db() as conn:
        conn.execute(
            "INSERT INTO song_feedback(video_id, action, artist, track_title) VALUES(?,?,?,?)",
            (video_id, action, artist, track_title),
        )


def db_get_artist_feedback_scores(artist_names: list[str]) -> dict:
    """Obtener skip ratio para múltiples artistas en una sola consulta.

    Retorna un dict {artist: score} donde score es un float entre 0.0 y 1.0:
    - 0.0 = nunca se salta (siempre se completa)
    - 0.5 = sin datos / neutral
    - 1.0 = siempre se salta
    """
    if not artist_names:
        return {}
    scores = {}
    with get_db() as conn:
        for name in artist_names:
            if not name:
                scores[name] = 0.5
                continue
            escaped = name.replace("%", "\\%").replace("_", "\\_")
            row = conn.execute(
                """
                SELECT
                    CAST(SUM(CASE WHEN action='skip' THEN 1 ELSE 0 END) AS REAL)
                    / NULLIF(SUM(CASE WHEN action IN ('skip','complete') THEN 1 ELSE 0 END), 0)
                FROM song_feedback
                WHERE artist LIKE ? ESCAPE '\\' AND action IN ('skip','complete')
                """,
                (f"%{escaped}%",),
            ).fetchone()
            score = row[0] if row and row[0] is not None else 0.5
            scores[name] = score
    return scores
