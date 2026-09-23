"""SoundWave Backend — Rutas de búsqueda, tendencias y home."""

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

from utils import best_thumb_raw, extract_chart_items, fmt_song, fmt_thumbs

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
            if r.get("resultType") == "song"
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

    result = await loop.run_in_executor(None, _do)
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
            return extract_chart_items(charts, limit=25)
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

    songs = await loop.run_in_executor(None, _read)
    api_cache_set("home:quick-picks", songs)
    return {"results": songs}


@router.get("/home/for-you")
@limiter.limit("20/minute")
async def home_for_you(request: Request):
    cached = api_cache_get("home:for-you", ttl=300)
    if cached:
        return {"results": cached}

    with get_db() as conn:
        rows = conn.execute(
            "SELECT artist, SUM(play_count) as total FROM history "
            "WHERE artist IS NOT NULL AND artist != '' AND artist != 'Desconocido' "
            "GROUP BY artist ORDER BY total DESC LIMIT 6"
        ).fetchall()

    if not rows:
        cached_trend = api_cache_get("trending", ttl=TRENDING_TTL)
        if cached_trend:
            return {"results": cached_trend[:20]}
        return {"results": []}

    loop = asyncio.get_running_loop()

    def _build():
        seen = set()
        out = []
        ytm = get_ytm()
        artists = [r["artist"] for r in rows]
        per_artist = max(4, 25 // len(artists))
        for artist in artists:
            if len(out) >= 25:
                break
            for attempt in range(2):
                try:
                    results_list = ytm.search(
                        artist, filter="songs", limit=per_artist + 3
                    )
                    for r in results_list:
                        if len(out) >= 25:
                            break
                        if r.get("resultType") != "song":
                            continue
                        vid = r.get("videoId")
                        if not vid or vid in seen:
                            continue
                        seen.add(vid)
                        out.append(fmt_song(r))
                    break
                except Exception as e:
                    logger.warning(
                        "for-you artist '%s' attempt %d: %s", artist, attempt + 1, e
                    )
        if not out:
            with get_db() as conn:
                hist = conn.execute(
                    "SELECT video_id, title, artist, thumbnail, duration FROM history "
                    "ORDER BY last_played_at DESC LIMIT 25"
                ).fetchall()
            out = [
                {
                    "videoId": r["video_id"],
                    "title": r["title"],
                    "artist": r["artist"],
                    "thumbnail": r["thumbnail"],
                    "duration": r["duration"],
                }
                for r in hist
            ]
        random.shuffle(out)
        return out[:25]

    songs = await loop.run_in_executor(None, _build)
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

    albums = await loop.run_in_executor(None, _build)
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

            songs_out = extract_chart_items(charts, limit=30)
        except Exception as e:
            logger.warning("trending: %s", e)
        return songs_out

    songs = await loop.run_in_executor(None, _do)
    if songs:
        api_cache_set("trending", songs)
    return {"results": songs}
