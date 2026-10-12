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


# ── Motor de "Para ti" (Mix estilo YouTube Music) ────────────────────────────
# Antes se buscaba por NOMBRE de artista: el mix quedaba dominado por el
# artista más escuchado (p. ej. C.R.O / CRO) y apenas aparecía el resto del
# historial. Ahora se replica el Mix de YouTube Music: se toman canciones
# reales del historial como SEMILLAS, se pide la "radio" de cada una
# (get_watch_playlist → la cadena canción → relacionadas → relacionadas de
# esas) y se mezclan los resultados repartiendo cuota por artista, para que
# ningún cantante copie la sección.


def _split_artists(value: str) -> list[str]:
    """Separar un campo "A, B, C" en nombres de artista individuales."""
    return [a.strip() for a in (value or "").split(",") if a.strip()]


def _artist_key(name: str) -> str:
    """Clave normalizada de artista: colapsa C.R.O, CRO y c.r.o en "cro".

    Sin esto, el mix trata cada variante de escritura como un artista
    distinto y la cuota por artista no frena al mismo cantante.
    """
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def _pick_seeds(rows, limit: int = 6) -> list[dict]:
    """Elegir canciones-semilla diversas para el mix.

    Primera pasada: la canción más escuchada de cada artista principal (así
    una colaboración "A, B" no cuenta como dos artistas ni deja que uno solo
    acapare las semillas). Segunda pasada: completa con el resto de las más
    escuchadas.
    """
    seeds: list[dict] = []
    used_videos: set[str] = set()
    used_artists: set[str] = set()
    for r in rows:
        vid = r["videoId"]
        if not vid or vid in used_videos:
            continue
        artists = _split_artists(r["artist"])
        primary = _artist_key(artists[0]) if artists else ""
        if primary and primary in used_artists:
            continue
        used_videos.add(vid)
        if primary:
            used_artists.add(primary)
        seeds.append(dict(r))
        if len(seeds) >= limit:
            return seeds
    for r in rows:
        vid = r["videoId"]
        if not vid or vid in used_videos:
            continue
        used_videos.add(vid)
        seeds.append(dict(r))
        if len(seeds) >= limit:
            break
    return seeds


def _radio_tracks(ytm, video_id: str, limit: int) -> list:
    """Canciones de la radio de YouTube Music para una semilla.

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


def _mix_diverse(
    candidates: list, limit: int = 25, per_artist: int = 3, scores=None
) -> list:
    """Mezclar candidatos repartiendo cuota por artista.

    Agrupa por artista principal (normalizado), limita a `per_artist`
    canciones por artista y reparte en round-robin: los primeros puestos son
    siempre de artistas distintos. `scores` (0.0–1.0, menor = mejor) reordena
    los grupos para que los artistas que el usuario suele saltar caigan al
    final. La cuota es estricta: ningún artista puede acaparar la sección.
    """
    buckets: dict[str, list] = {}
    order: list[str] = []
    for c in candidates:
        artists = _split_artists(c.get("artist", ""))
        key = _artist_key(artists[0]) if artists else "__unknown__"
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(c)

    if scores:
        order.sort(key=lambda k: scores.get(k, 0.5))

    out: list[dict] = []
    seen: set[str] = set()

    def _take(track) -> bool:
        vid = track.get("videoId")
        if not vid or vid in seen:
            return False
        seen.add(vid)
        out.append(track)
        return True

    pos = {k: 0 for k in order}
    taken = {k: 0 for k in order}
    while len(out) < limit:
        progressed = False
        for key in order:
            pool = buckets[key]
            if taken[key] >= per_artist:
                continue
            while pos[key] < len(pool) and taken[key] < per_artist:
                track = pool[pos[key]]
                pos[key] += 1
                if _take(track):
                    taken[key] += 1
                    progressed = True
                    break
            if len(out) >= limit:
                break
        if not progressed:
            break
    return out


def _build_mix(seeds: list[dict], limit: int = 25) -> list:
    """Construir el mix encadenando las radios de las semillas.

    Nivel 1: radio de cada semilla. Nivel 2: radio de un par de canciones
    nuevas de OTROS artistas (el "después de esas, aún más" del Mix).
    """
    ytm = get_ytm()
    candidates: list[dict] = []
    seen: set[str] = set()

    def _collect(video_id: str, radio_limit: int) -> None:
        for t in _radio_tracks(ytm, video_id, radio_limit):
            vid = t.get("videoId")
            if not vid or vid in seen or vid == video_id:
                continue
            seen.add(vid)
            candidates.append(fmt_song(t))

    for seed in seeds:
        _collect(seed["videoId"], limit)

    seed_artists = {
        _artist_key(a) for s in seeds for a in _split_artists(s.get("artist", ""))
    }
    chained = 0
    for c in candidates:
        if chained >= 2:
            break
        artists = _split_artists(c.get("artist", ""))
        if artists and _artist_key(artists[0]) not in seed_artists:
            seed_artists.add(_artist_key(artists[0]))
            _collect(c["videoId"], 15)
            chained += 1

    # Feedback local: demotar artistas que el usuario suele saltar.
    scores = {}
    try:
        from db import db_get_artist_feedback_scores

        names = list({c.get("artist", "") for c in candidates if c.get("artist")})
        if names:
            scores = {
                _artist_key(k): v
                for k, v in db_get_artist_feedback_scores(names).items()
            }
    except Exception as e:
        logger.debug("for-you feedback: %s", e)

    return _mix_diverse(candidates, limit=limit, scores=scores)


def _search_fallback(rows, limit: int = 25) -> list:
    """Respaldo si la radio no devuelve nada: búsqueda por artista."""
    ytm = get_ytm()
    artists: list[str] = []
    for r in rows:
        for a in _split_artists(r["artist"]):
            if a not in artists:
                artists.append(a)
    artists = artists[:6]
    if not artists:
        return []
    per_artist = max(4, limit // len(artists))
    out: list[dict] = []
    seen: set[str] = set()
    for artist in artists:
        if len(out) >= limit:
            break
        try:
            hits = ytm.search(artist, filter="songs", limit=per_artist + 3)
        except Exception as e:
            logger.warning("for-you search '%s': %s", artist, e)
            continue
        for h in hits:
            if len(out) >= limit:
                break
            if h.get("resultType") != "song":
                continue
            vid = h.get("videoId")
            if not vid or vid in seen:
                continue
            seen.add(vid)
            out.append(fmt_song(h))
    random.shuffle(out)
    return out


@router.get("/home/for-you")
@limiter.limit("20/minute")
async def home_for_you(request: Request):
    cached = api_cache_get("home:for-you", ttl=300)
    if cached:
        return {"results": cached}

    with get_db() as conn:
        rows = conn.execute(
            "SELECT video_id AS videoId, title, artist, thumbnail, duration, "
            "play_count, last_played_at FROM history "
            "ORDER BY play_count DESC, last_played_at DESC LIMIT 60"
        ).fetchall()

    if not rows:
        cached_trend = api_cache_get("trending", ttl=TRENDING_TTL)
        if cached_trend:
            return {"results": cached_trend[:20]}
        return {"results": []}

    seeds = _pick_seeds(rows)
    loop = asyncio.get_running_loop()

    def _build():
        songs = _build_mix(seeds)
        if not songs:
            songs = _search_fallback(rows)
        if not songs:
            songs = [
                {
                    "videoId": r["videoId"],
                    "title": r["title"],
                    "artist": r["artist"],
                    "thumbnail": r["thumbnail"],
                    "duration": r["duration"],
                }
                for r in rows[:25]
            ]
        return songs

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
