import { useState, useCallback, useMemo, useEffect } from "react";
import { api } from "../utils/api";

export function useLibrary() {
  const [liked, setLiked] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  useEffect(() => {
    try {
      const r = localStorage.getItem("sw_liked_v2");
      if (r) setLiked(new Set(JSON.parse(r)));
    } catch {}

    Promise.all([
      api.fetchPlaylists().catch(() => []),
      api.fetchDownloads().catch(() => []),
      api.fetchHistory().catch(() => []),
    ]).then(([playlists, downloads, history]) => {
      setPlaylists(playlists);
      setDownloads(downloads);
      setHistory(history);
    });
  }, []);

  const toggleLike = useCallback((videoId) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      try {
        localStorage.setItem("sw_liked_v2", JSON.stringify([...next]));
      } catch {}
      return next;
    });
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
