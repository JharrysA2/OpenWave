"""SoundWave Backend — Rutas de gestión de descargas."""

import asyncio
import json
import threading

from cache import download_progress
from config import BASE_DIR, COVERS_DIR, LYRICS_DIR, MUSIC_DIR
from db import _parse_thumbs_json, get_db
from downloads import do_download, get_mp3_path
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from rate_limit import limiter

from utils import require_valid_video_id

router = APIRouter()


@router.post("/download/{video_id}")
@limiter.limit("5/minute")
async def start_download(video_id: str, request: Request):
    """Iniciar descarga de una canción."""
    require_valid_video_id(video_id)
    body = await request.json()
    # Iniciar en background thread
    thread = threading.Thread(
        target=do_download,
        args=(
            video_id,
            body.get("title", ""),
            body.get("artist", ""),
            body.get("thumbnail", ""),
            int(body.get("duration", 0) or 0),
            body.get("album_title", ""),
            body.get("album_type", ""),
        ),
        kwargs={"thumbnails": body.get("thumbnails", [])},
        daemon=True,
    )
    thread.start()
    return {"ok": True}


@router.get("/download/progress/{video_id}")
async def download_progress_route(video_id: str):
    """SSE endpoint para progreso de descarga."""
    require_valid_video_id(video_id)

    async def event_stream():

        while True:
            progress = download_progress.get(
                video_id, {"status": "downloading", "progress": 0}
            )
            yield f"data: {json.dumps(progress)}\n\n"
            if progress.get("status") in ("done", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/downloads")
async def list_downloads():
    """Listar canciones descargadas."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM downloads ORDER BY downloaded_at DESC"
        ).fetchall()
    songs = []
    for r in rows:
        mp3_path = get_mp3_path(r["video_id"])
        size = mp3_path.stat().st_size if mp3_path.exists() else 0
        parsed_thumbs = _parse_thumbs_json(r["thumbnails"])

        songs.append(
            {
                "videoId": r["video_id"],
                "title": r["title"],
                "artist": r["artist"],
                "thumbnail": r["thumbnail"],
                "thumbnails": parsed_thumbs,
                "duration": r["duration"],
                "downloaded": True,
                "size": size,
                "albumTitle": r["album_title"] or "",
                "albumType": r["album_type"] or "",
            }
        )
    return songs


@router.delete("/downloads/all")
@limiter.limit("10/minute")
async def delete_all_downloads(request: Request):
    """Eliminar todas las descargas."""
    for f in MUSIC_DIR.glob("*.mp3"):
        f.unlink()
    for f in MUSIC_DIR.glob("*.json"):
        f.unlink()
    for f in COVERS_DIR.glob("*.jpg"):
        f.unlink()
    for f in LYRICS_DIR.glob("*.lrc"):
        f.unlink()
    with get_db() as conn:
        conn.execute("DELETE FROM downloads")
    return {"ok": True}


@router.delete("/downloads/{video_id}")
@limiter.limit("10/minute")
async def delete_download(request: Request, video_id: str):
    """Eliminar una descarga."""
    require_valid_video_id(video_id)
    mp3_path = get_mp3_path(video_id)
    if mp3_path.exists():
        mp3_path.unlink()
    # Eliminar cover
    cover = BASE_DIR / "downloads" / "covers" / f"{video_id}.jpg"
    if cover.exists():
        cover.unlink()
    # Eliminar lyrics
    lrc = BASE_DIR / "downloads" / "lyrics" / f"{video_id}.lrc"
    if lrc.exists():
        lrc.unlink()
    # Eliminar metadata
    meta = MUSIC_DIR / f"{video_id}.json"
    if meta.exists():
        meta.unlink()
    with get_db() as conn:
        conn.execute("DELETE FROM downloads WHERE video_id=?", (video_id,))
    return {"ok": True}


@router.post("/downloads/delete")
@limiter.limit("10/minute")
async def delete_selected_downloads(request: Request):
    """Eliminar descargas seleccionadas."""
    body = await request.json()
    video_ids = body.get("videoIds", [])
    for vid in video_ids:
        require_valid_video_id(vid)
        mp3 = get_mp3_path(vid)
        if mp3.exists():
            mp3.unlink()
        cover = BASE_DIR / "downloads" / "covers" / f"{vid}.jpg"
        if cover.exists():
            cover.unlink()
        lrc = BASE_DIR / "downloads" / "lyrics" / f"{vid}.lrc"
        if lrc.exists():
            lrc.unlink()
    with get_db() as conn:
        placeholders = ",".join("?" for _ in video_ids)
        conn.execute(
            f"DELETE FROM downloads WHERE video_id IN ({placeholders})",
            video_ids,
        )
    return {"ok": True}
