"""SoundWave Backend — Rutas de playlists."""

from db import _parse_thumbs_json, get_db
from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/playlists")
async def list_playlists():
    """Listar todas las playlists con cantidad de canciones."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT p.*,
               COALESCE(s.song_count,0) as song_count,
               s.first_cover
               FROM playlists p
               LEFT JOIN (
                 SELECT playlist_id, COUNT(*) as song_count,
                        (
                          SELECT thumbnail FROM playlist_songs ps2
                          WHERE ps2.playlist_id = ps.playlist_id
                            AND thumbnail IS NOT NULL AND thumbnail != ''
                          ORDER BY ps2.added_at ASC LIMIT 1
                        ) as first_cover
                 FROM playlist_songs ps
                 GROUP BY playlist_id
               ) s ON p.id = s.playlist_id
               ORDER BY p.created_at DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/playlists")
async def create_playlist(request: Request):
    """Crear una nueva playlist."""
    body = await request.json()
    name = body.get("name", "Nueva playlist")
    color = body.get("color", None)
    cover = body.get("cover", None)
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO playlists(name, color, cover) VALUES(?, ?, ?)",
            (name, color, cover),
        )
        return {
            "id": cur.lastrowid,
            "name": name,
            "color": color,
            "cover": cover,
            "song_count": 0,
        }


@router.put("/playlists/{pid}")
async def update_playlist(pid: int, request: Request):
    """Actualizar nombre/cover de una playlist."""
    body = await request.json()
    with get_db() as conn:
        if "name" in body:
            conn.execute("UPDATE playlists SET name=? WHERE id=?", (body["name"], pid))
        if "cover" in body:
            conn.execute(
                "UPDATE playlists SET cover=? WHERE id=?", (body["cover"], pid)
            )
        if "color" in body:
            conn.execute(
                "UPDATE playlists SET color=? WHERE id=?", (body["color"], pid)
            )
    return {"ok": True}


@router.delete("/playlists/{pid}")
async def delete_playlist(pid: int):
    """Eliminar una playlist."""
    with get_db() as conn:
        conn.execute("DELETE FROM playlist_songs WHERE playlist_id=?", (pid,))
        conn.execute("DELETE FROM playlists WHERE id=?", (pid,))
    return {"ok": True}


@router.get("/playlists/{pid}/songs")
async def get_playlist_songs(pid: int):
    """Obtener canciones de una playlist (con thumbnails[] parseado)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM playlist_songs WHERE playlist_id=? ORDER BY added_at ASC",
            (pid,),
        ).fetchall()
    songs = []
    for r in rows:
        d = dict(r)
        songs.append(
            {
                "videoId": d.get("video_id", ""),
                "title": d.get("title", ""),
                "artist": d.get("artist", ""),
                "thumbnail": d.get("thumbnail", ""),
                "thumbnails": _parse_thumbs_json(d.get("thumbnails")),
                "duration": d.get("duration", 0),
            }
        )
    return songs


@router.post("/playlists/{pid}/songs")
async def add_to_playlist(pid: int, request: Request):
    """Agregar canciones a una playlist.
    Accepts videoIds and optionally a songs array with full metadata.
    """
    import json as _json

    body = await request.json()
    video_ids = body.get("videoIds", [])
    songs_data = body.get("songs", []) or []

    # Build a lookup of metadata sent from frontend
    songs_meta = {}
    for s in songs_data:
        if s and s.get("videoId"):
            songs_meta[s["videoId"]] = s

    with get_db() as conn:
        for vid in video_ids:
            meta = songs_meta.get(vid)

            title = ""
            artist = ""
            thumbnail = ""
            duration = 0
            thumbs_json = "[]"

            # 1. Use metadata from frontend if available
            if meta:
                title = meta.get("title", "")
                artist = meta.get("artist", "")
                thumbnail = meta.get("thumbnail", "")
                duration = meta.get("duration", 0)
                thumbs_raw = meta.get("thumbnails", [])
                thumbs_json = (
                    _json.dumps(thumbs_raw, ensure_ascii=False) if thumbs_raw else "[]"
                )

            # 2. Fallback: try history/downloads
            if not title:
                existing = conn.execute(
                    "SELECT title, artist, thumbnail, duration FROM history WHERE video_id=? "
                    "UNION SELECT title, artist, thumbnail, duration FROM downloads WHERE video_id=?",
                    (vid, vid),
                ).fetchone()
                if existing:
                    title = existing["title"] or ""
                    artist = existing["artist"] or ""
                    thumbnail = existing["thumbnail"] or ""
                    duration = existing["duration"] or 0

            if not thumbs_json or thumbs_json == "[]":
                thumbs_row = conn.execute(
                    "SELECT thumbnails FROM history WHERE video_id=? "
                    "UNION SELECT thumbnails FROM downloads WHERE video_id=?",
                    (vid, vid),
                ).fetchone()
                if thumbs_row and thumbs_row["thumbnails"]:
                    raw = thumbs_row["thumbnails"]
                    if isinstance(raw, str):
                        thumbs_json = raw
                    else:
                        thumbs_json = _json.dumps(raw, ensure_ascii=False)

            # 3. Insert with all available metadata
            conn.execute(
                "INSERT OR IGNORE INTO playlist_songs(playlist_id,video_id,title,artist,thumbnail,duration,thumbnails) "
                "VALUES(?,?,?,?,?,?,?)",
                (pid, vid, title, artist, thumbnail, duration, thumbs_json),
            )
    return {"ok": True}


@router.delete("/playlists/{pid}/songs/{video_id}")
async def remove_from_playlist(pid: int, video_id: str):
    """Eliminar una canción de una playlist."""
    with get_db() as conn:
        conn.execute(
            "DELETE FROM playlist_songs WHERE playlist_id=? AND video_id=?",
            (pid, video_id),
        )
    return {"ok": True}


@router.post("/playlists/{pid}/reorder")
async def reorder_playlist(pid: int, request: Request):
    """Reordenar canciones en una playlist."""
    body = await request.json()
    video_ids = body.get("videoIds", [])
    with get_db() as conn:
        for idx, vid in enumerate(video_ids):
            conn.execute(
                "UPDATE playlist_songs SET added_at = datetime('now', ?) WHERE playlist_id=? AND video_id=?",
                (f"-{idx} seconds", pid, vid),
            )
    return {"ok": True}
