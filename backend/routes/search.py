"""OpenWave Backend — Rutas de búsqueda, tendencias y home."""

import asyncio
import random
import re

import yt_dlp
from cache import api_cache_get, api_cache_set
from config import TRENDING_TTL
from db import get_db
from fastapi import APIRouter, HTTPException, Query, Request
from logging_config import get_logger
from rate_limit import limiter
from ytmusic_client import get_ytm

from utils import (
    best_thumb_raw,
    enrich_local_flags,
    extract_chart_items,
    fmt_song,
    fmt_thumbs,
)

logger = get_logger(__name__)

router = APIRouter()


@router.get("/search")
@limiter.limit("20/minute")
async def search(request: Request, q: str, limit: int = Query(25, ge=1, le=100)):
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
    cached = api_cache_get(f"search2:{q}")
    if cached:
        return cached

    loop = asyncio.get_running_loop()

    def _do():
        ytm = get_ytm()
        songs = [
            fmt_song(r)
            for r in ytm.search(q, filter="songs", limit=limit)
            # ⭐ Sin videoId no hay canción reproducible: fmt_song rechazaría
            #    el None en get_mp3_path y toda la búsqueda devolvería 500
            #    (un resultado de YTMusic sin videoId es posible en vivo).
            if r.get("resultType") == "song" and r.get("videoId")
        ]

        artists = []
        for r in ytm.search(q, filter="artists", limit=6):
            if r.get("resultType") != "artist":
                continue
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
            artists.append(
                {
                    "browseId": r.get("browseId", ""),
                    "name": r.get("artist", "") or r.get("name", ""),
                    "subscribers": r.get("subscribers", ""),
                    "thumbnail": thumb_url,
                    "thumbnails": [{"url": thumb_url, "width": 576, "height": 576}]
                    if thumb_url
                    else [],
                }
            )

        albums = []
        for r in ytm.search(q, filter="albums", limit=10):
            if r.get("resultType") not in ("album", "single", "ep"):
                continue
            raw_thumbs = r.get("thumbnails") or []
            thumb = best_thumb_raw(raw_thumbs)
            albums.append(
                {
                    "browseId": r.get("browseId", ""),
                    "title": r.get("title", ""),
                    "artist": ", ".join(
                        a.get("name", "")
                        for a in (r.get("artists") or [])
                        if a.get("name")
                    ),
                    "year": r.get("year", ""),
                    "type": r.get("type", "Album"),
                    "thumbnail": thumb,
                    "thumbnails": fmt_thumbs(raw_thumbs),
                }
            )

        return {"results": songs, "artists": artists, "albums": albums}

    try:
        result = await loop.run_in_executor(None, _do)
    except Exception as e:
        # YTMusic caído o con formato nuevo: la vista pinta su estado en
        # vez de recibir 500 E-INT-00 (mismo patrón que /search/videos).
        logger.warning("search %s: %s", q, e)
        result = None
    if not result:
        return {"results": [], "artists": [], "albums": []}
    api_cache_set(f"search2:{q}", result)
    return result


@router.get("/search/videos")
@limiter.limit("15/minute")
async def search_videos(request: Request, q: str, limit: int = Query(25, ge=1, le=100)):
    cached = api_cache_get(f"search_videos:{q}")
    if cached and cached.get("results"):
        return cached

    loop = asyncio.get_running_loop()

    def _do():
        opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "skip_download": True,
        }
        results = []
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{q}", download=False)
            entries = (info or {}).get("entries") or []
            for r in entries:
                if not r:
                    continue
                vid = r.get("id") or r.get("videoId", "")
                if not vid:
                    continue
                if r.get("live_status") in ("is_live", "post_live"):
                    continue
                duration = r.get("duration") or 0
                uploader = (
                    r.get("uploader") or r.get("channel") or r.get("artist") or ""
                )
                thumb = f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
                thumb_hq = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                thumbs_raw = r.get("thumbnails") or []
                if thumbs_raw:
                    best = max(
                        thumbs_raw,
                        key=lambda t: t.get("width", 0) * t.get("height", 0),
                        default=None,
                    )
                    if best and best.get("url"):
                        thumb = best["url"]
                results.append(
                    {
                        "videoId": vid,
                        "title": r.get("title", ""),
                        "artist": uploader,
                        "duration": int(duration) if duration else 0,
                        "thumbnail": thumb,
                        "thumbnails": [
                            {"url": thumb, "width": 320, "height": 180},
                            {"url": thumb_hq, "width": 480, "height": 360},
                        ],
                        "views": str(r.get("view_count", "") or ""),
                        "isVideo": True,
                    }
                )
        return {"results": results}

    try:
        result = await loop.run_in_executor(None, _do)
    except Exception as e:
        return {"results": [], "error": str(e)}

    if result.get("results"):
        api_cache_set(f"search_videos:{q}", result, 300)
    return result


@router.get("/trending")
@limiter.limit("20/minute")
async def trending(request: Request, country: str = "US"):
    cached = api_cache_get("trending", ttl=TRENDING_TTL)
    if cached:
        return {"results": cached}

    loop = asyncio.get_running_loop()

    def _do():
        charts = None
        for attempt in [
            lambda: get_ytm().get_charts(country=country),
            lambda: get_ytm().get_charts(),
        ]:
            try:
                charts = attempt()
                break
            except Exception:
                continue
        if not charts:
            return []
        try:
            return extract_chart_items(charts, limit=25, ytm=get_ytm())
        except Exception as e:
            logger.warning("trending: %s", e)
            return []

    try:
        songs = await loop.run_in_executor(None, _do)
    except Exception as e:
        logger.warning("trending: %s", e)
        songs = []
    if songs:
        api_cache_set("trending", songs)
    return {"results": songs or cached or []}


@router.get("/home/quick-picks")
@limiter.limit("20/minute")
async def home_quick_picks(request: Request):
    cached = api_cache_get("home:quick-picks", ttl=120)
    if cached:
        return {"results": cached}

    loop = asyncio.get_running_loop()

    def _read():
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM history ORDER BY last_played_at DESC LIMIT 60"
            ).fetchall()

        seen_titles = set()
        songs = []
        for r in rows:
            norm = (
                re.sub(
                    r"\s*(\(feat\..*?\)|\(with.*?\)|\[.*?\])\s*",
                    "",
                    r["title"],
                    flags=re.I,
                )
                .strip()
                .lower()
            )
            if norm in seen_titles:
                continue
            seen_titles.add(norm)
            songs.append(
                {
                    "videoId": r["video_id"],
                    "title": r["title"],
                    "artist": r["artist"],
                    "thumbnail": r["thumbnail"],
                    "duration": r["duration"],
                    "playCount": r["play_count"],
                }
            )
            if len(songs) >= 20:
                break
        return songs

    try:
        songs = await loop.run_in_executor(None, _read)
    except Exception as e:
        logger.warning("quick-picks: %s", e)
        songs = None
    # Solo cachear con contenido: un fallo no debe congelar la portada
    # vacía durante el TTL.
    if songs:
        api_cache_set("home:quick-picks", songs)
    return {"results": songs or []}


# ── «Para ti» (mix estilo YouTube Music) ────────────────────────────────────
# Réplica del Mix de YouTube Music en 4 pasos:
#   1. Canción Ancla: la más repetida en la ventana reciente (eventos de
#      reproducción de las últimas 72 h). Es la posición #1 del mix.
#   2. Semilla de radio: get_watch_playlist(radio=True) sobre el ancla trae
#      las ~25 canciones que YouTube relaciona (filtrado colaborativo +
#      análisis acústico).
#   3. Cruce con el historial largo plazo: las que el usuario ya disfruta
#      (más reproducidas de siempre / con «Me gusta») van justo después del
#      ancla; el resto se baraja como descubrimiento.
#   4. Dinámico: cada reproducción invalida la caché y el orden se baraja en
#      cada armado, así el mix mantiene las canciones pero no sale siempre
#      igual.
# No se reparte por artista: el orden lo manda YouTube + la afinidad real.

FOR_YOU_WINDOW_HOURS = 72  # ventana del historial reciente
FOR_YOU_MIN_PLAYS = 3  # repeticiones para proclamar «Canción Ancla»
FOR_YOU_LIMIT = 25  # tamaño del mix
FOR_YOU_TTL = 90  # segundos de caché (se invalida al reproducir)


def _song_from_row(row) -> dict:
    """Normalizar una fila de historial al shape de canción del frontend."""
    d = dict(row)
    return {
        "videoId": d.get("video_id") or d.get("videoId") or "",
        "title": d.get("title", ""),
        "artist": d.get("artist", ""),
        "thumbnail": d.get("thumbnail", ""),
        "thumbnails": d.get("thumbnails") or [],
        "duration": d.get("duration", 0) or 0,
        "downloaded": False,
        "coverLocal": "",
    }


def _pick_anchor():
    """Elegir la «Canción Ancla» del mix.

    1) La más repetida de la ventana reciente; si ninguna supera el umbral,
       la más escuchada/reciente de esa ventana. 2) Sin eventos recientes
       (p. ej. historial anterior a esta función), la más escuchada de todo
       el historial.
    """
    from db import db_get_recent_plays

    recent = db_get_recent_plays(hours=FOR_YOU_WINDOW_HOURS, limit=10)
    if recent:
        top = next(
            (r for r in recent if (r.get("plays") or 0) >= FOR_YOU_MIN_PLAYS),
            recent[0],
        )
        return _song_from_row(top)
    with get_db() as conn:
        row = conn.execute(
            "SELECT video_id, title, artist, thumbnail, thumbnails, duration "
            "FROM history ORDER BY play_count DESC, last_played_at DESC LIMIT 1"
        ).fetchone()
    return _song_from_row(row) if row else None


def _long_term_ids() -> set:
    """Historial largo plazo: más reproducidas de siempre + «Me gusta»."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT video_id FROM "
            "(SELECT video_id FROM history ORDER BY play_count DESC LIMIT 100) "
            "UNION SELECT video_id FROM song_feedback WHERE action = 'like'"
        ).fetchall()
    return {r["video_id"] for r in rows}


def _radio_tracks(ytm, video_id: str, limit: int) -> list:
    """Canciones de la radio de YouTube Music para la Canción Ancla.

    Intenta la radio real (radio=True) y, si falla, la watch playlist normal.
    Devuelve [] si ambas fallan; el llamador decide el respaldo.
    """
    for kwargs in ({"radio": True}, {}):
        try:
            pl = ytm.get_watch_playlist(videoId=video_id, limit=limit + 1, **kwargs)
            tracks = (pl or {}).get("tracks") or []
            if isinstance(tracks, list) and tracks:
                return tracks
        except Exception as e:
            logger.debug("radio %s (%s): %s", video_id, kwargs, e)
    return []


def _build_mix(anchor: dict, limit: int = FOR_YOU_LIMIT) -> list:
    """Armar el mix del ancla: radio de YouTube cruzada con el historial.

    Orden: ancla (#1) → unas pocas conocidas → resto de conocidas y
    descubrimiento barajados. Así el mix conserva las mismas canciones entre
    armados pero no sale siempre en el mismo orden.
    """
    ytm = get_ytm()
    anchor_id = anchor.get("videoId", "")
    tracks = _radio_tracks(ytm, anchor_id, limit)
    long_term = _long_term_ids()

    familiar: list[dict] = []
    discovery: list[dict] = []
    seen = {anchor_id}
    for t in tracks:
        vid = t.get("videoId")
        if not vid or vid in seen:
            continue
        seen.add(vid)
        song = fmt_song(t)
        (familiar if vid in long_term else discovery).append(song)

    random.shuffle(familiar)
    random.shuffle(discovery)
    # Unas pocas conocidas tras el ancla y el resto barajado con el
    # descubrimiento: mismas canciones, pero sin repetir siempre el orden.
    out = [anchor, *familiar[:3]]
    tail = familiar[3:] + discovery
    random.shuffle(tail)
    out.extend(tail)
    return out[:limit]


def _history_fallback(limit: int = FOR_YOU_LIMIT) -> list:
    """Respaldo si la radio falla: lo último escuchado."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT video_id, title, artist, thumbnail, thumbnails, duration "
            "FROM history ORDER BY last_played_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [_song_from_row(r) for r in rows]


@router.get("/home/for-you")
@limiter.limit("20/minute")
async def home_for_you(request: Request):
    cached = api_cache_get("home:for-you", ttl=FOR_YOU_TTL)
    if cached:
        return {"results": cached}

    loop = asyncio.get_running_loop()
    anchor = await loop.run_in_executor(None, _pick_anchor)

    if not anchor:
        cached_trend = api_cache_get("trending", ttl=TRENDING_TTL)
        if cached_trend:
            return {"results": cached_trend[:20]}
        return {"results": []}

    def _build():
        songs = _build_mix(anchor)
        if len(songs) > 1:
            return songs
        # Radio vacía: rellena el mix con lo último escuchado.
        seen = {anchor.get("videoId")}
        out = [anchor]
        for s in _history_fallback():
            if s["videoId"] not in seen:
                seen.add(s["videoId"])
                out.append(s)
        return out

    songs = await loop.run_in_executor(None, _build)
    enrich_local_flags(songs)
    if songs:
        api_cache_set("home:for-you", songs)
    return {"results": songs}


@router.get("/home/albums")
@limiter.limit("20/minute")
async def home_albums(request: Request):
    cached = api_cache_get("home:albums", ttl=600)
    if cached:
        return {"results": cached}

    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT artist FROM history ORDER BY play_count DESC, last_played_at DESC LIMIT 8"
        ).fetchall()
    artists = [r["artist"] for r in rows if r["artist"]]
    if not artists:
        return {"results": []}

    loop = asyncio.get_running_loop()

    def _build():
        seen = set()
        albums = []
        for artist in artists[:6]:
            if len(albums) >= 20:
                break
            primary = artist.split(",")[0].strip()
            try:
                results_list = get_ytm().search(primary, filter="albums", limit=4)
                for r in results_list:
                    bid = r.get("browseId") or ""
                    title = r.get("title", "")
                    if not bid or not title or bid in seen:
                        continue
                    seen.add(bid)
                    raw_artists = r.get("artists") or r.get("artist") or []
                    if isinstance(raw_artists, str):
                        art_str = raw_artists
                    elif isinstance(raw_artists, list):
                        art_str = ", ".join(
                            (a.get("name") or a) for a in raw_artists if a
                        )
                    else:
                        art_str = primary
                    year = r.get("year", "")
                    alb_type = r.get("type", "Album")
                    albums.append(
                        {
                            "browseId": bid,
                            "title": title,
                            "artist": art_str or primary,
                            "year": year,
                            "type": alb_type,
                            "thumbnail": best_thumb_raw(r.get("thumbnails", [])) or "",
                        }
                    )
            except Exception as e:
                logger.warning("albums artist=%s: %s", primary, e)
        return albums

    try:
        albums = await loop.run_in_executor(None, _build)
    except Exception as e:
        logger.warning("home albums: %s", e)
        albums = []
    if albums:
        api_cache_set("home:albums", albums)
    return {"results": albums}


@router.get("/home/trending-fixed")
@limiter.limit("20/minute")
async def home_trending_fixed(request: Request):
    loop = asyncio.get_running_loop()

    def _do():
        songs_out = []
        try:
            for country in ("GT", "MX", "US", None):
                try:
                    charts = (
                        get_ytm().get_charts(country=country)
                        if country
                        else get_ytm().get_charts()
                    )
                    break
                except Exception:
                    continue
            else:
                return []

            songs_out = extract_chart_items(charts, limit=30, ytm=get_ytm())
        except Exception as e:
            logger.warning("trending: %s", e)
        return songs_out

    songs = await loop.run_in_executor(None, _do)
    if songs:
        api_cache_set("trending", songs)
    return {"results": songs}
