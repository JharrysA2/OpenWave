"""OpenWave Backend — Base de datos SQLite."""

import atexit
import json
import queue
import re
import sqlite3
import threading
from contextlib import contextmanager, suppress
from datetime import UTC, datetime

from config import DB_FILE
from logging_config import get_logger

logger = get_logger(__name__)

_db_lock = threading.Lock()

# Versión del esquema/criterios de la caché de videoclips. Ver init_db().
# 2: los «sin videoclip» que dejó un fallo de descarga/medición se olvidan una
#    vez al actualizar; el resolver ya no los crea en ese caso.
_ESQUEMA_VERSION = 3

# ── Pool de conexiones SQLite ──────────────────────────────────────────────
# Antes se abría/cerraba UNA conexión por operación (más las PRAGMA de
# configuración), lo que volvía lentos cada /history, /playlists, /downloads
# y /home/*. Ahora se reutilizan hasta _POOL_SIZE conexiones: la config se
# aplica una sola vez y el costo por request baja a un get/put de cola.
_POOL_SIZE = 6

_pool: "queue.LifoQueue[sqlite3.Connection]" = queue.LifoQueue(maxsize=_POOL_SIZE)


def _create_conn() -> sqlite3.Connection:
    """Crear conexión SQLite con configuración optimizada (WAL + cache en memoria)."""
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-32768")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _acquire_conn() -> sqlite3.Connection:
    """Obtener conexión del pool o crear una nueva si está vacío."""
    try:
        return _pool.get_nowait()
    except queue.Empty:
        return _create_conn()


def _return_conn(conn: sqlite3.Connection) -> None:
    """Devolver conexión al pool; si está lleno, cerrarla."""
    try:
        _pool.put_nowait(conn)
    except Exception:
        with suppress(Exception):
            conn.close()


def _drain_pool() -> None:
    """Cerrar y vaciar el pool (shutdown y limpieza en tests)."""
    while True:
        try:
            conn = _pool.get_nowait()
        except queue.Empty:
            break
        with suppress(Exception):
            conn.close()


atexit.register(_drain_pool)


@contextmanager
def get_db():
    """Obtener conexión SQLite del pool con commit/rollback automático.

    Context manager: hace commit al salir, rollback ante excepción y
    devuelve la conexión al pool para reutilizarla (no se cierra).
    Si el rollback falla, la conexión se descarta (posible estado corrupto).
    """
    conn = _acquire_conn()
    healthy = True
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            healthy = False
        raise
    finally:
        if healthy:
            _return_conn(conn)
        else:
            with suppress(Exception):
                conn.close()


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
                album_title TEXT DEFAULT '', album_type TEXT DEFAULT '',
                album_browse_id TEXT DEFAULT '', artist_browse_id TEXT DEFAULT ''
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
        for col in ["album_title", "album_type", "album_browse_id", "artist_browse_id"]:
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

        # Registro de cada reproducción (evento con marca de tiempo): permite
        # contar repeticiones en una ventana reciente (48-72h) para elegir la
        # «Canción Ancla» del mix. `played_at` en hora local de SQLite
        # (YYYY-MM-DD HH:MM:SS) para poder comparar con datetime('now', ...).
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS play_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                played_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_play_events_time ON play_events(played_at);
            CREATE INDEX IF NOT EXISTS idx_play_events_video ON play_events(video_id);
        """)

        # Videoclip oficial resuelto por canción (caché de la resolución del
        # vídeo de fondo): evita repetir la búsqueda en YouTube Music cada vez
        # que se abre la pantalla de letras. Una fila con `oficial_id` vacío
        # significa «se buscó y esta canción no tiene videoclip» (la pantalla
        # se queda con la portada).
        #
        # `desajuste` guarda la diferencia de duración conocida en la
        # resolución y `desfase` el desfase medido entre el videoclip y la
        # canción (NULL = sin medir; ver desfase.py).
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS videoclip_oficial (
                video_id TEXT PRIMARY KEY,
                oficial_id TEXT DEFAULT '',
                desajuste INTEGER,
                desfase REAL,
                resuelto_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
        """)

        # Migración segura de las columnas nuevas
        for col, tipo in [("desajuste", "INTEGER"), ("desfase", "REAL")]:
            try:
                conn.execute(f"ALTER TABLE videoclip_oficial ADD COLUMN {col} {tipo}")
                conn.commit()
            except Exception:
                pass

        # Al cambiar el criterio con que se resuelve el videoclip se sube la
        # versión del esquema: las resoluciones guardadas con el criterio viejo
        # (sobre todo los «no tiene videoclip») se descartan una vez para que
        # se vuelvan a buscar con el nuevo.
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version < _ESQUEMA_VERSION:
            try:
                conn.execute("DELETE FROM videoclip_oficial WHERE oficial_id = ''")
                conn.commit()
                conn.execute(f"PRAGMA user_version = {_ESQUEMA_VERSION}")
                conn.commit()
            except Exception as e:
                logger.warning("migration videoclip: %s", e)


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
        # Evento de reproducción (misma transacción): el mix cuenta
        # repeticiones recientes por video_id con esta tabla.
        vid = entry.get("videoId", "")
        if vid:
            conn.execute("INSERT INTO play_events(video_id) VALUES(?)", (vid,))


def db_import_history(entries: list) -> int:
    """Importar historial desde una copia de seguridad (fusión, nunca sustituye).

    Devuelve el número de entradas válidas insertadas. Si la entrada ya existe
    se conserva el mayor `play_count` y la `last_played_at` más reciente; los
    demás metadatos se actualizan con los de la copia.
    """
    imported = 0
    with _db_lock, get_db() as conn:
        for e in entries:
            if not isinstance(e, dict):
                continue
            vid = (e.get("videoId") or "").strip()
            if not vid:
                continue
            thumbnails_json = json.dumps(e.get("thumbnails") or [], ensure_ascii=False)
            play_count = int(e.get("playCount") or 0) or 1
            last_played = e.get("lastPlayedAt") or datetime.now(UTC).strftime(
                "%Y-%m-%dT%H:%M:%S"
            )
            conn.execute(
                """INSERT INTO history(video_id,title,artist,thumbnail,duration,
                   thumbnails,play_count,last_played_at,
                   album_browse_id,artist_browse_id,album_title,album_type)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(video_id) DO UPDATE SET
                       play_count = MAX(COALESCE(history.play_count,1),
                                        COALESCE(excluded.play_count,1)),
                       last_played_at = MAX(COALESCE(history.last_played_at,''),
                                            COALESCE(excluded.last_played_at,'')),
                       title = excluded.title, artist = excluded.artist,
                       thumbnail = excluded.thumbnail, duration = excluded.duration,
                       thumbnails = excluded.thumbnails,
                       album_browse_id = excluded.album_browse_id,
                       artist_browse_id = excluded.artist_browse_id,
                       album_title = excluded.album_title,
                       album_type = excluded.album_type""",
                (
                    vid,
                    e.get("title") or "",
                    e.get("artist") or "",
                    e.get("thumbnail") or "",
                    int(e.get("duration") or 0),
                    thumbnails_json,
                    play_count,
                    last_played,
                    e.get("albumBrowseId") or "",
                    e.get("artistBrowseId") or "",
                    e.get("albumTitle") or "",
                    e.get("albumType") or "",
                ),
            )
            imported += 1
    return imported


def db_import_playlists(playlists: list) -> int:
    """Restaurar playlists desde una copia de seguridad.

    Fusiona por nombre: si ya existe una playlist con ese nombre se le añaden
    SOLO las canciones que falten (re-importar es idempotente, sin duplicados);
    si no existe, se crea con sus canciones. Devuelve el nº de playlists
    restauradas/creadas.
    """
    restored = 0
    with _db_lock, get_db() as conn:
        by_name = {}
        for r in conn.execute("SELECT id, name FROM playlists").fetchall():
            by_name.setdefault(r["name"], r["id"])

        for pl in playlists:
            if not isinstance(pl, dict):
                continue
            name = (pl.get("name") or "").strip() or "Nueva playlist"
            songs = [s for s in (pl.get("songs") or []) if isinstance(s, dict)]

            pid = by_name.get(name)
            if pid is None:
                cur = conn.execute(
                    "INSERT INTO playlists(name, color, cover) VALUES(?, ?, ?)",
                    (name, pl.get("color"), pl.get("cover")),
                )
                pid = cur.lastrowid
                by_name[name] = pid

            have = {
                row["video_id"]
                for row in conn.execute(
                    "SELECT video_id FROM playlist_songs WHERE playlist_id=?", (pid,)
                ).fetchall()
            }
            for s in songs:
                vid = (s.get("videoId") or s.get("video_id") or "").strip()
                if not vid or vid in have:
                    continue
                have.add(vid)
                thumbs = s.get("thumbnails")
                thumbs_json = (
                    json.dumps(thumbs, ensure_ascii=False)
                    if isinstance(thumbs, list)
                    else "[]"
                )
                conn.execute(
                    """INSERT INTO playlist_songs(playlist_id, video_id, title,
                       artist, thumbnail, thumbnails, duration)
                       VALUES(?,?,?,?,?,?,?)""",
                    (
                        pid,
                        vid,
                        s.get("title") or "",
                        s.get("artist") or "",
                        s.get("thumbnail") or "",
                        thumbs_json,
                        int(s.get("duration") or 0),
                    ),
                )
            restored += 1
    return restored


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


def db_get_recent_plays(hours: int = 72, limit: int = 10):
    """Canciones más repetidas en la ventana reciente (eventos de reproducción).

    Devuelve [{video_id, title, artist, thumbnail, thumbnails, duration,
    plays, last_played_at}] ordenado por número de reproducciones y, en
    empate, por la más reciente. Es la base para elegir la «Canción Ancla».
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT h.video_id, h.title, h.artist, h.thumbnail, h.duration, "
            "h.thumbnails, COUNT(e.id) AS plays, MAX(e.played_at) AS last_played_at "
            "FROM play_events e JOIN history h ON h.video_id = e.video_id "
            "WHERE e.played_at >= datetime('now', ?) "
            "GROUP BY e.video_id ORDER BY plays DESC, last_played_at DESC LIMIT ?",
            (f"-{int(hours)} hours", limit),
        ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        item["thumbnails"] = _parse_thumbs_json(item.get("thumbnails"))
        out.append(item)
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

    Antes corría una query LIKE por artista; ahora trae las filas relevantes
    una sola vez y agrega en memoria (mismo match por substring case-insensitive).
    """
    if not artist_names:
        return {}
    names = [n for n in artist_names if n]
    scores = {n: 0.5 for n in artist_names}
    if not names:
        return scores

    with get_db() as conn:
        rows = conn.execute(
            "SELECT artist, action FROM song_feedback "
            "WHERE action IN ('skip','complete')"
        ).fetchall()

    skips = {n: 0 for n in names}
    totals = {n: 0 for n in names}
    lowered = {n: n.lower() for n in names}
    for row in rows:
        artist_db = (row["artist"] or "").lower()
        if not artist_db:
            continue
        action = row["action"]
        for name in names:
            if lowered[name] in artist_db:
                if action == "skip":
                    skips[name] += 1
                totals[name] += 1

    for name in names:
        if totals[name]:
            scores[name] = skips[name] / totals[name]
    return scores


# ── Vídeo de fondo: videoclip oficial (caché de la resolución) ───────────────────────


def _resuelto_caducado(marca: str | None, vigencia: float) -> bool:
    """¿La marca ``%Y-%m-%dT%H:%M:%S`` (UTC) es más antigua que ``vigencia`` s?

    Sin marca legible se da por caducada: más vale volver a preguntar que
    quedarse con un «no tiene» de fecha desconocida.
    """
    try:
        cuando = datetime.strptime(str(marca), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return True
    return (datetime.now(UTC) - cuando).total_seconds() > vigencia


def db_get_videoclip_oficial(
    video_id: str, vigencia: float | None = None
) -> tuple[bool, str | None]:
    """Leer la resolución del videoclip oficial cacheada para una canción.

    Devuelve ``(consultado, oficial_id)``. ``consultado=False`` → todavía no se
    resolvió nada. ``consultado=True`` con ``oficial_id=None`` → ya se buscó y
    la canción **no tiene** videoclip oficial.

    ``vigencia`` (segundos) solo afecta a los «no tiene»: pasado ese tiempo
    devuelve ``(False, None)`` y se vuelve a resolver. Un «no tiene» puede ser
    la huella de un fallo puntual (una descarga que no llegó a medir el
    desfase), así que no puede quedarse ahí para siempre. Los aciertos no
    caducan: el videoclip de una canción no cambia.
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT oficial_id, resuelto_at FROM videoclip_oficial WHERE video_id=?",
            (video_id,),
        ).fetchone()
    if row is None:
        return False, None
    oficial = row["oficial_id"] or None
    if (
        oficial is None
        and vigencia is not None
        and _resuelto_caducado(row["resuelto_at"], vigencia)
    ):
        return False, None
    return True, oficial


def db_set_videoclip_oficial(
    video_id: str,
    oficial_id: str | None,
    desajuste: int | None = None,
    desfase: float | None = None,
) -> None:
    """Guardar la resolución del videoclip oficial (``None`` = no tiene)."""
    with _db_lock, get_db() as conn:
        conn.execute(
            """INSERT INTO videoclip_oficial(video_id, oficial_id, desajuste, desfase, resuelto_at)
               VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%S','now'))
               ON CONFLICT(video_id) DO UPDATE SET
                   oficial_id = excluded.oficial_id,
                   desajuste = COALESCE(excluded.desajuste, videoclip_oficial.desajuste),
                   desfase = COALESCE(excluded.desfase, videoclip_oficial.desfase),
                   resuelto_at = excluded.resuelto_at""",
            (video_id, oficial_id or "", desajuste, desfase),
        )


def db_get_desfase_videoclip(video_id: str) -> tuple[int | None, float | None]:
    """Detalle del videoclip cacheado: ``(desajuste, desfase)``.

    ``desfase`` es ``None`` si aún no se ha medido (o no hace falta).
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT desajuste, desfase FROM videoclip_oficial WHERE video_id=?",
            (video_id,),
        ).fetchone()
    if not row:
        return None, None
    desajuste, desfase = row["desajuste"], row["desfase"]
    try:
        desajuste = int(desajuste) if desajuste is not None else None
    except Exception:
        desajuste = None
    try:
        desfase = float(desfase) if desfase is not None else None
    except Exception:
        desfase = None
    return desajuste, desfase


def db_set_desfase_videoclip(video_id: str, desfase: float | None) -> None:
    """Guardar el desfase medido (o ``None`` para olvidarlo) de una canción.

    Solo toca la fila que ya existe de la resolución: nunca crea una, porque
    eso daría por sabido el videoclip oficial de la canción.
    """
    with _db_lock, get_db() as conn:
        conn.execute(
            "UPDATE videoclip_oficial SET desfase=? WHERE video_id=?",
            (None if desfase is None else float(desfase), video_id),
        )


def db_delete_videoclip_oficial(video_id: str) -> None:
    """Olvidar la resolución de una canción (se volverá a buscar al preparar)."""
    with _db_lock, get_db() as conn:
        conn.execute("DELETE FROM videoclip_oficial WHERE video_id=?", (video_id,))


def db_delete_all_videoclip_oficial() -> None:
    """Olvidar TODAS las resoluciones de videoclip (vaciar la caché de vídeos).

    Incluye los «no tiene»: son justo los que no dejan fichero en disco y, por
    tanto, los que no se pueden alcanzar borrando vídeos uno a uno.
    """
    with _db_lock, get_db() as conn:
        conn.execute("DELETE FROM videoclip_oficial")
