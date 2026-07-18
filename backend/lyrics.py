"""SoundWave Backend — Obtención de letras desde múltiples fuentes."""

import asyncio
import os
import re

import httpx
from cache import api_cache_get, api_cache_set
from config import LYRICS_DIR
from logging_config import get_logger
from ytmusic_client import get_ytm

from utils import fmt_song

logger = get_logger(__name__)


async def get_local_lyrics(video_id: str):
    """Obtener letras locales (.lrc) de una canción descargada."""
    lrc_path = LYRICS_DIR / f"{video_id}.lrc"
    if not lrc_path.exists():
        return {"lyrics": None}
    lines = lrc_path.read_text(encoding="utf-8").splitlines()
    return {"lyrics": [ln for ln in lines if ln.strip()]}


async def search_lyrics(title: str = "", artist: str = "", source: str = "lrclib"):
    """Buscar letras desde múltiples fuentes."""
    results = []

    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
        if source == "lrclib":
            try:
                r = await client.get(
                    "https://lrclib.net/api/search",
                    params={"artist_name": artist, "track_name": title},
                    headers={"Lrclib-Client": "SoundWave/1.0"},
                )
                r.raise_for_status()
                data = r.json()
                for item in (data if isinstance(data, list) else [])[:6]:
                    synced = item.get("syncedLyrics", "").strip()
                    plain = item.get("plainLyrics", "").strip()
                    lyrics_text = synced or plain
                    if not lyrics_text:
                        continue
                    results.append(
                        {
                            "source": "LRCLib",
                            "title": item.get("trackName", ""),
                            "artist": item.get("artistName", ""),
                            "duration": item.get("duration"),
                            "synced": bool(synced),
                            "text": lyrics_text,
                        }
                    )
            except Exception as e:
                logger.warning("lrclib search: %s", e)

        elif source == "ytmusic":
            loop = asyncio.get_running_loop()

            def _do_yt():
                try:
                    hits = get_ytm().search(
                        f"{artist} {title}", filter="songs", limit=5
                    )
                    out = []
                    for h in hits[:3]:
                        vid = h.get("videoId")
                        if not vid:
                            continue
                        try:
                            pl = get_ytm().get_watch_playlist(videoId=vid, limit=1)
                            lid = pl.get("lyrics")
                            if not lid:
                                continue
                            d = get_ytm().get_lyrics(lid)
                            txt = (d.get("lyrics") or "").strip()
                            if txt:
                                out.append(
                                    {
                                        "source": "YTMusic",
                                        "title": h.get("title", ""),
                                        "artist": fmt_song(h).get("artist", ""),
                                        "synced": False,
                                        "text": txt,
                                    }
                                )
                                if out:
                                    break
                        except Exception:
                            continue
                    return out
                except Exception as e:
                    logger.warning("ytmusic lyrics: %s", e)
                    return []

            results = await loop.run_in_executor(None, _do_yt)

        elif source == "genius":
            try:
                GENIUS_TOKEN = os.environ.get("GENIUS_TOKEN", "")
                if not GENIUS_TOKEN:
                    raise Exception("GENIUS_TOKEN no configurado")

                search_r = await client.get(
                    "https://api.genius.com/search",
                    params={"q": f"{artist} {title}", "per_page": 10},
                    headers={
                        "Authorization": f"Bearer {GENIUS_TOKEN}",
                        "User-Agent": "SoundWave/1.0",
                    },
                )
                search_r.raise_for_status()
                hits = search_r.json().get("response", {}).get("hits", [])

                def is_valid_hit(h):
                    if h.get("type") != "song":
                        return False
                    url = h.get("result", {}).get("url", "")
                    return (
                        not any(
                            x in url
                            for x in [
                                "/lists/",
                                "/annotations/",
                                "/videos/",
                                "/articles/",
                            ]
                        )
                        and "lyrics" in url.lower()
                    )

                song_hits = [h for h in hits if is_valid_hit(h)]
                if not song_hits:
                    song_hits = [h for h in hits if h.get("type") == "song"]

                for hit in song_hits[:3]:
                    res = hit.get("result", {})
                    song_url = res.get("url", "")
                    if not song_url:
                        continue
                    try:
                        page_r = await client.get(
                            song_url,
                            headers={
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                            },
                        )
                        page_r.raise_for_status()
                        html = page_r.text
                        containers = re.findall(
                            r'data-lyrics-container="true"[^>]*>(.*?)</div>',
                            html,
                            re.DOTALL,
                        )
                        if containers:
                            raw = "\n".join(containers)
                            raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
                            raw = re.sub(r"<[^>]+>", "", raw)
                            raw = (
                                raw.replace("&amp;", "&")
                                .replace("&apos;", "'")
                                .replace("&#x27;", "'")
                                .replace("&quot;", '"')
                                .replace("&#39;", "'")
                                .replace("&lt;", "<")
                                .replace("&gt;", ">")
                            )
                            raw = re.sub(r"\n{3,}", "\n\n", raw).strip()
                            if len(raw) > 80:
                                results.append(
                                    {
                                        "source": "Genius",
                                        "title": res.get("title", ""),
                                        "artist": res.get("primary_artist", {}).get(
                                            "name", ""
                                        ),
                                        "synced": False,
                                        "text": raw,
                                        "url": song_url,
                                    }
                                )
                                break
                    except Exception as page_e:
                        logger.warning("genius page: %s", page_e)
                        continue
            except Exception as e:
                logger.warning("genius search: %s", e)

        elif source == "musixmatch":
            results = [
                {
                    "source": "Musixmatch",
                    "title": "",
                    "artist": "",
                    "synced": False,
                    "text": "__NO_KEY__",
                    "message": "Musixmatch requiere API key",
                }
            ]

    return {"results": results, "source": source}


async def get_lyrics(video_id: str, title: str = "", artist: str = ""):
    """Auto-fetch lyrics: LRCLib exacta → LRCLib búsqueda → YTMusic nativa."""
    cache_key = f"lyrics:{video_id}"
    cached = api_cache_get(cache_key, ttl=3600)
    if cached is not None:
        return {"lyrics": cached}

    loop = asyncio.get_running_loop()

    # Paso 1: Obtener metadata si no se proporcionó
    yt_lyrics_id = None
    if not title:

        def _get_meta():
            try:
                pl = get_ytm().get_watch_playlist(videoId=video_id, limit=1)
                tracks = pl.get("tracks") or []
                t = tracks[0] if tracks else {}
                t_title = t.get("title", "")
                artists = t.get("artists") or []
                t_artist = (
                    ", ".join(a.get("name", "") for a in artists if isinstance(a, dict))
                    if isinstance(artists, list)
                    else str(artists)
                )
                return t_title, t_artist, pl.get("lyrics")
            except Exception as e:
                logger.warning("lyrics meta: %s", e)
                return "", "", None

        title, artist, yt_lyrics_id = await loop.run_in_executor(None, _get_meta)

    # Paso 2: LRCLib
    if title:
        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                headers={
                    "Lrclib-Client": "SoundWave/1.0",
                    "User-Agent": "SoundWave/1.0",
                },
            ) as client:
                # Exact match
                r = await client.get(
                    "https://lrclib.net/api/get",
                    params={
                        "artist_name": artist,
                        "track_name": title,
                        "album_name": "",
                        "duration": 0,
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    text = (
                        data.get("syncedLyrics") or data.get("plainLyrics") or ""
                    ).strip()
                    if text:
                        lines = [ln for ln in text.split("\n") if ln.strip()]
                        api_cache_set(cache_key, lines, ttl=3600)
                        return {"lyrics": lines, "source": "lrclib"}

                # Search fallback
                for params in [
                    {"artist_name": artist, "track_name": title},
                    {"track_name": title},
                ]:
                    r2 = await client.get(
                        "https://lrclib.net/api/search", params=params
                    )
                    if r2.status_code == 200:
                        data = r2.json() if isinstance(r2.json(), list) else []
                        for item in data[:5]:
                            text = (
                                item.get("syncedLyrics")
                                or item.get("plainLyrics")
                                or ""
                            ).strip()
                            if text:
                                lines = [ln for ln in text.split("\n") if ln.strip()]
                                api_cache_set(cache_key, lines, ttl=3600)
                                return {"lyrics": lines, "source": "lrclib"}
        except Exception as e:
            logger.warning("lrclib: %s", e)

    # Paso 3: YTMusic nativa
    if not yt_lyrics_id:

        def _get_yt_id():
            try:
                pl = get_ytm().get_watch_playlist(videoId=video_id, limit=1)
                return pl.get("lyrics")
            except Exception:
                return None

        yt_lyrics_id = await loop.run_in_executor(None, _get_yt_id)

    if yt_lyrics_id:

        def _get_yt_lyrics():
            try:
                data = get_ytm().get_lyrics(yt_lyrics_id)
                text = (data.get("lyrics") or "").strip()
                lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
                if lines:
                    api_cache_set(cache_key, lines, ttl=3600)
                    return lines
            except Exception as e:
                logger.warning("lyrics yt: %s", e)
            return None

        result = await loop.run_in_executor(None, _get_yt_lyrics)
        if result:
            return {"lyrics": result, "source": "ytmusic"}

    return {"lyrics": None}
