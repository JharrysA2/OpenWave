"""SoundWave Backend — Rutas de canciones, álbumes, artistas y cola."""

import asyncio

from cache import api_cache_get, api_cache_set
from fastapi import APIRouter, Query, Request
from logging_config import get_logger
from pydantic import BaseModel
from rate_limit import limiter
from ytmusic_client import get_ytm

from utils import (
    best_thumb_raw,
    clean_artist_name,
    fmt_num,
    fmt_song,
    fmt_thumbs,
    parse_duration,
    require_valid_video_id,
)


def _get_artist_browse_id(data):
    """Extraer el primer artist browseId del campo 'artists' de ytmusicapi."""
    for a in data.get("artists") or []:
        aid = a.get("id", "") or a.get("browseId", "")
        if aid:
            return aid
    return ""


logger = get_logger(__name__)

router = APIRouter()


@router.get("/song/album/{video_id}")
async def get_song_album(video_id: str):
    """Obtener el álbum exacto al que pertenece una canción."""
    require_valid_video_id(video_id)
    cached = api_cache_get(f"song_album:{video_id}", ttl=3600)
    if cached:
        return cached

    loop = asyncio.get_running_loop()

    def _do():
        ytm = get_ytm()
        try:
            song_data = ytm.get_song(video_id)
            vd = song_data.get("videoDetails") or {}
            song_title = vd.get("title", "")
            author = vd.get("author", "")
        except Exception as e:
            logger.warning("get_song failed: %s", e)
            return {"error": "get_song_failed"}

        browse_id = ""
        album_name = ""
        for query in [song_title, f"{song_title} {author}"]:
            if not query.strip():
                continue
            try:
                hits = ytm.search(query, filter="songs", limit=10)
                for h in hits:
                    if h.get("videoId") == video_id:
                        alb = h.get("album") or {}
                        if isinstance(alb, dict):
                            browse_id = (
                                alb.get("id", "") or alb.get("browseId", "") or ""
                            )
                            album_name = alb.get("name", "")
                        break
                if browse_id:
                    break
            except Exception as e:
                logger.warning("search failed: %s", e)

        if not browse_id:
            return {"error": "no_album"}

        try:
            album_data = ytm.get_album(browse_id)
            raw_t = album_data.get("thumbnails") or []
            return {
                "browseId": browse_id,
                "title": album_data.get("title", "") or album_name,
                "artist": ", ".join(
                    a.get("name", "")
                    for a in (album_data.get("artists") or [])
                    if a.get("name")
                ),
                "artistBrowseId": _get_artist_browse_id(album_data),
                "year": album_data.get("year", ""),
                "type": album_data.get("type", "Album"),
                "thumbnail": best_thumb_raw(raw_t),
                "thumbnails": fmt_thumbs(raw_t),
            }
        except Exception as e:
            logger.warning("get_album failed: %s", e)
            return {
                "browseId": browse_id,
                "title": album_name,
                "thumbnail": "",
                "thumbnails": [],
            }

    result = await loop.run_in_executor(None, _do)
    if "error" not in result:
        api_cache_set(f"song_album:{video_id}", result)
    return result


@router.get("/album/{browse_id}")
async def get_album(browse_id: str):
    """Obtener tracks de un álbum/EP por browseId."""
    cached = api_cache_get(f"album:{browse_id}", ttl=3600)
    if cached:
        return cached

    loop = asyncio.get_running_loop()

    def _do():
        try:
            data = get_ytm().get_album(browse_id)
            tracks = []
            for t in data.get("tracks") or []:
                vid = t.get("videoId", "")
                if not vid:
                    continue
                artists = t.get("artists") or []
                art = ", ".join(
                    a.get("name", "")
                    for a in artists
                    if a.get("name") and clean_artist_name(a.get("name", ""))
                )
                if not art:
                    art = ", ".join(
                        a.get("name", "")
                        for a in (data.get("artists") or [])
                        if a.get("name")
                    )
                album_raw_thumbs = data.get("thumbnails", [])
                thumb = best_thumb_raw(album_raw_thumbs)
                album_thumbs = fmt_thumbs(album_raw_thumbs)
                tracks.append(
                    {
                        "videoId": vid,
                        "title": t.get("title", ""),
                        "artist": art,
                        "thumbnail": thumb,
                        "thumbnails": album_thumbs,
                        "duration": t.get("duration_seconds")
                        or parse_duration(t.get("duration")),
                        "trackNumber": t.get("trackNumber") or 0,
                    }
                )
            album_raw_thumbs = data.get("thumbnails", [])
            return {
                "title": data.get("title", ""),
                "artist": ", ".join(
                    a.get("name", "")
                    for a in (data.get("artists") or [])
                    if a.get("name")
                ),
                "artistBrowseId": _get_artist_browse_id(data),
                "year": data.get("year", ""),
                "type": data.get("type", "Album"),
                "thumbnail": best_thumb_raw(album_raw_thumbs),
                "thumbnails": fmt_thumbs(album_raw_thumbs),
                "tracks": tracks,
            }
        except Exception as e:
            logger.warning("album %s: %s", browse_id, e)
            return None

    result = await loop.run_in_executor(None, _do)
    if result:
        api_cache_set(f"album:{browse_id}", result)
        return result
    return {"tracks": [], "title": "", "artist": ""}


@router.get("/artist/{browse_id}")
async def get_artist(browse_id: str):
    """Obtener información de un artista."""
    cached = api_cache_get(f"artist:{browse_id}", ttl=1800)
    if cached:
        return cached

    loop = asyncio.get_running_loop()

    def _do():
        ytm = get_ytm()
        data = ytm.get_artist(browse_id)
        thumbs = data.get("thumbnails") or []
        best = (
            max(
                thumbs,
                key=lambda t: t.get("width", 0) * t.get("height", 0),
                default=None,
            )
            if thumbs
            else None
        )
        thumb = best.get("url", "") if best else ""
        if "googleusercontent.com" in thumb:
            thumb = thumb.split("=")[0] + "=w576-h576-l90-rj"

        songs_raw = (data.get("songs") or {}).get("results") or []
        songs = [fmt_song(s) for s in songs_raw if s.get("videoId")][:10]

        def _fmt_album(r):
            raw_t = r.get("thumbnails") or []
            return {
                "browseId": r.get("browseId", ""),
                "title": r.get("title", ""),
                "year": r.get("year", ""),
                "type": r.get("type", "Album"),
                "thumbnail": best_thumb_raw(raw_t),
                "thumbnails": fmt_thumbs(raw_t),
            }

        albums_raw = (data.get("albums") or {}).get("results") or []
        singles_raw = (data.get("singles") or {}).get("results") or []
        return {
            "browseId": browse_id,
            "name": data.get("name", ""),
            "subscribers": data.get("subscribers", ""),
            "views": data.get("views", ""),
            "description": data.get("description", ""),
            "thumbnail": thumb,
            "thumbnails": [{"url": thumb, "width": 576, "height": 576}]
            if thumb
            else [],
            "songs": songs,
            "albums": [_fmt_album(r) for r in albums_raw],
            "singles": [_fmt_album(r) for r in singles_raw],
        }

    result = await loop.run_in_executor(None, _do)
    api_cache_set(f"artist:{browse_id}", result)
    return result


@router.get("/song/details/{video_id}")
async def song_details(video_id: str):
    """Obtener detalles de una canción: reproducciones, vistas, likes, etc."""
    require_valid_video_id(video_id)
    cached = api_cache_get(f"details:{video_id}", ttl=3600)
    if cached:
        return cached

    loop = asyncio.get_running_loop()

    def _do():
        out = {"videoId": video_id}
        try:
            data = get_ytm().get_song(video_id)
            vd = data.get("videoDetails") or {}
            md = data.get("microformat", {}).get("microformatDataRenderer", {}) or {}
            out["title"] = vd.get("title", "")
            out["views"] = fmt_num(vd.get("viewCount", ""))
            out["likes"] = fmt_num(vd.get("likes", "") or vd.get("likeCount", ""))
            out["genre"] = md.get("genre", "") or ""

            pl = get_ytm().get_watch_playlist(videoId=video_id, limit=1)
            tracks = pl.get("tracks") or []
            t = tracks[0] if tracks else {}
            raw_artists = t.get("artists") or []
            out["artist"] = ", ".join(
                a.get("name", "")
                for a in raw_artists
                if isinstance(a, dict) and clean_artist_name(a.get("name", ""))
            )
            alb = t.get("album") or {}
            if isinstance(alb, dict):
                out["album"] = alb.get("name", "")
                out["year"] = alb.get("year", "") or ""

            hits = get_ytm().search(
                f"{out.get('title', '')} {out.get('artist', '')}",
                filter="songs",
                limit=3,
            )
            for h in hits:
                if h.get("videoId") == video_id:
                    plays = h.get("plays", "") or h.get("playCount", "")
                    if plays:
                        out["plays"] = plays
                    break
        except Exception as e:
            logger.warning("song details %s: %s", video_id, e)
        return out

    result = await loop.run_in_executor(None, _do)
    api_cache_set(f"details:{video_id}", result)
    return result


@router.get("/artist/related/{browse_id}")
async def get_related_artists(browse_id: str):
    """Obtener artistas relacionados a un artista."""
    cached = api_cache_get(f"artist_related:{browse_id}", ttl=3600)
    if cached:
        return {"results": cached}

    loop = asyncio.get_running_loop()

    def _do():
        ytm = get_ytm()
        data = ytm.get_artist(browse_id)
        related = []
        for r in data.get("related", {}).get("results") or []:
            thumbs = r.get("thumbnails") or []
            best = (
                max(
                    thumbs,
                    key=lambda t: t.get("width", 0) * t.get("height", 0),
                    default=None,
                )
                if thumbs
                else None
            )
            thumb_url = best.get("url", "") if best else ""
            if "googleusercontent.com" in thumb_url:
                thumb_url = thumb_url.split("=")[0] + "=w576-h576-l90-rj"
            related.append(
                {
                    "browseId": r.get("browseId", ""),
                    "name": r.get("name", "") or r.get("artist", ""),
                    "subscribers": r.get("subscribers", ""),
                    "thumbnail": thumb_url,
                }
            )
        return related

    result = await loop.run_in_executor(None, _do)
    if result:
        api_cache_set(f"artist_related:{browse_id}", result)
    return {"results": result}


class FeedbackRequest(BaseModel):
    """Cuerpo de la solicitud de feedback para entrenar recomendaciones."""

    videoId: str  # noqa: N815 — contrato JSON con el frontend (camelCase)
    action: str  # 'skip' | 'complete' | 'like' | 'unlike'
    artist: str = ""
    title: str = ""


@router.post("/queue/feedback")
@limiter.limit("60/minute")
async def record_feedback(request: Request, data: FeedbackRequest):
    """Registrar feedback del usuario para entrenar el algoritmo de radio.

    Almacena la acción localmente y, si es posible, envía la señal a
    YouTube Music via rate_song() para mejorar recomendaciones futuras.
    """
    from db import db_record_feedback

    db_record_feedback(data.videoId, data.action, data.artist, data.title)

    # Intentar también enviar a YouTube Music (falla graceful si no hay auth)
    if data.action in ("like", "unlike"):
        try:
            ytm = get_ytm()
            rating = "LIKE" if data.action == "like" else "INDIFFERENT"
            ytm.rate_song(data.videoId, rating)
            logger.info("feedback: rate_song(%s, %s) OK", data.videoId, rating)
        except Exception as e:
            logger.debug("feedback: rate_song no disponible (sin auth): %s", e)

    return {"ok": True}


def _rerank_by_artist(tracks: list, artist_name: str) -> list:
    """Reordenar tracks: canciones del MISMO artista primero.

    Compara los nombres de artista de cada track contra el artista
    de la canción actual. Los tracks que comparten al menos un
    artista se colocan al inicio; el resto se desplaza al final.

    Además, dentro del grupo de "otros" artistas, usa datos de
    feedback local para ordenar: los artistas que el usuario suele
    saltar van al final; los que nunca salta van más arriba.
    """
    if not artist_name or not tracks:
        return tracks

    current_artists = {a.strip().lower() for a in artist_name.split(",") if a.strip()}
    if not current_artists:
        return tracks

    matches: list = []
    others: list = []
    for t in tracks:
        track_artist = (t.get("artist") or "").lower()
        track_artists = {a.strip() for a in track_artist.split(",") if a.strip()}
        if track_artists & current_artists:
            matches.append(t)
        else:
            others.append(t)

    # Ordenar "others" por feedback del usuario: artistas que menos se
    # saltan van primero; los que más se saltan van al final.
    if others:
        try:
            from db import db_get_artist_feedback_scores

            other_artists = list(
                {t.get("artist", "") for t in others if t.get("artist")}
            )
            scores = db_get_artist_feedback_scores(other_artists)
            others.sort(key=lambda t: scores.get(t.get("artist", ""), 0.5))
        except Exception:
            pass

    return matches + others


@router.get("/queue/{video_id}")
@limiter.limit("30/minute")
async def get_queue(
    request: Request,
    video_id: str,
    limit: int = Query(25, ge=1, le=100),
    artist: str = "",
):
    """Obtener cola de reproducción (radio) para una canción.

    Acepta un parámetro opcional `artist` para reordenar los
    resultados: las canciones del mismo artista aparecen primero.

    Estrategia de fallback (la radio de YTM puede fallar si YouTube
    cambia la estructura del watchNextRenderer — KeyError 'endpoint'):
      1. Radio de YouTube Music (radio=True)
      2. Watch playlist normal (radio=False) — probada, funciona
      3. Búsqueda de canciones por artista/título
    Nunca devuelve 500; ante fallo total devuelve lista vacía.
    """
    require_valid_video_id(video_id)
    cached = api_cache_get(f"queue:{video_id}", ttl=600)
    if cached:
        tracks = _rerank_by_artist(cached, artist)
        return {"tracks": tracks}

    loop = asyncio.get_running_loop()

    def _do():
        ytm = get_ytm()

        # 1) Radio de YouTube Music
        try:
            pl = ytm.get_watch_playlist(videoId=video_id, radio=True, limit=limit)
            tracks = [fmt_song(t) for t in (pl.get("tracks") or []) if t.get("videoId")]
            if tracks:
                return tracks
        except Exception as e:
            logger.warning("radio falló para %s: %s", video_id, e)

        # 2) Watch playlist normal (sin radio) — excluye la canción actual
        try:
            pl = ytm.get_watch_playlist(videoId=video_id, limit=limit)
            tracks = [
                fmt_song(t)
                for t in (pl.get("tracks") or [])
                if t.get("videoId") and t.get("videoId") != video_id
            ]
            if tracks:
                return tracks
        except Exception as e:
            logger.warning("watch playlist falló para %s: %s", video_id, e)

        # 3) Último recurso: búsqueda por artista/título
        try:
            song = ytm.get_song(video_id)
            vd = song.get("videoDetails") or {}
            query = (vd.get("author") or vd.get("title") or "").strip()
            if query:
                hits = ytm.search(query, filter="songs", limit=limit)
                return [
                    fmt_song(h)
                    for h in hits
                    if h.get("videoId") and h.get("videoId") != video_id
                ]
        except Exception as e:
            logger.warning("búsqueda de respaldo falló para %s: %s", video_id, e)

        return []

    tracks = await loop.run_in_executor(None, _do)
    # No cachear resultados vacíos: así el siguiente intento reintenta la radio
    # en vez de quedar bloqueado con una cola vacía durante el TTL.
    if tracks:
        api_cache_set(f"queue:{video_id}", tracks)
    tracks = _rerank_by_artist(tracks, artist)
    return {"tracks": tracks}
