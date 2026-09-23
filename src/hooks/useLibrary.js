import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { api } from "../utils/api";

const LIKED_KEY = "sw_liked_v2";
const LIKED_META_KEY = "sw_liked_meta_v1";

/** Campos útiles para reconstruir la lista "Me gusta" sin depender de la cola. */
const META_FIELDS = [
  "title",
  "artist",
  "thumbnail",
  "thumbnails",
  "duration",
  "album",
  "albumTitle",
  "albumType",
  "albumBrowseId",
  "artistBrowseId",
];

function pickMeta(song) {
  const meta = {};
  for (const f of META_FIELDS) {
    if (song[f] !== undefined && song[f] !== null && song[f] !== "") meta[f] = song[f];
  }
  meta.likedAt = Date.now();
  return meta;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useLibrary() {
  const [liked, setLiked] = useState(new Set());
  const [likedMeta, setLikedMeta] = useState(() => readJson(LIKED_META_KEY, {}));
  const [history, setHistory] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  // Refs espejo para que toggleLike no dependa de closures obsoletas
  const likedRef = useRef(liked);
  const likedMetaRef = useRef(likedMeta);
  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);
  useEffect(() => {
    likedMetaRef.current = likedMeta;
  }, [likedMeta]);

  useEffect(() => {
    const stored = readJson(LIKED_KEY, []);
    if (stored.length > 0) setLiked(new Set(stored));

    Promise.all([
      api.fetchPlaylists().catch(() => []),
      api.fetchDownloads().catch(() => []),
      api.fetchHistory().catch(() => []),
    ]).then(([playlists, downloads, history]) => {
      setPlaylists(playlists);
      setDownloads(downloads);
      setHistory(history);

      // Hidratar metadatos de canciones gustadas que no tienen (likes previos
      // a sw_liked_meta_v1): historial y descargas son fuentes baratas.
      try {
        const ids = new Set(readJson(LIKED_KEY, []));
        if (ids.size === 0) return;
        const meta = { ...likedMetaRef.current };
        const byId = {};
        for (const s of [...history, ...downloads]) {
          if (s?.videoId) byId[s.videoId] = s;
        }
        let changed = false;
        for (const id of ids) {
          if (!meta[id] && byId[id]) {
            meta[id] = pickMeta(byId[id]);
            changed = true;
          }
        }
        if (changed) {
          writeJson(LIKED_META_KEY, meta);
          likedMetaRef.current = meta;
          setLikedMeta(meta);
        }
      } catch {}
    });
  }, []);

  const toggleLike = useCallback((videoId, song) => {
    if (!videoId) return;

    const next = new Set(likedRef.current);
    const nowLiked = !next.has(videoId);
    if (nowLiked) next.add(videoId);
    else next.delete(videoId);
    likedRef.current = next;
    setLiked(next);
    writeJson(LIKED_KEY, [...next]);

    const meta = { ...likedMetaRef.current };
    if (nowLiked && song && (song.title || song.artist)) {
      meta[videoId] = pickMeta({ ...song, videoId });
    } else if (!nowLiked) {
      delete meta[videoId];
    }
    likedMetaRef.current = meta;
    setLikedMeta(meta);
    writeJson(LIKED_META_KEY, meta);
  }, []);

  // ── Función para refrescar playlists desde cualquier componente ──
  const refreshPlaylists = useCallback(async () => {
    try {
      const fresh = await api.fetchPlaylists(); // _skipCache: true interno
      setPlaylists(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const mostPlayed = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 20);
  }, [history]);

  return {
    liked,
    setLiked,
    likedMeta,
    history,
    setHistory,
    downloads,
    setDownloads,
    playlists,
    setPlaylists,
    toggleLike,
    mostPlayed,
    refreshPlaylists,
  };
}
