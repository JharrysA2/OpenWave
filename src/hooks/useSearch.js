import { useState, useRef, useCallback } from "react";
import { api } from "../utils/api";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchArtists, setSearchArtists] = useState([]);
  const [searchAlbums, setSearchAlbums] = useState([]);
  const [songsVisible, setSongsVisible] = useState(5);
  const [searchTab, setSearchTab] = useState("music");
  const [videoResults, setVideoResults] = useState([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const searchInputRef = useRef(null);

  // ── Búsqueda de canciones ──────────────────────────────────────────────────

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([]);
      setSearchArtists([]);
      setSearchAlbums([]);
      return;
    }
    setSearchLoading(true);
    try {
      const d = await api.get(`/search?q=${encodeURIComponent(q)}&limit=25`);
      setResults(d.results || []);
      setSearchArtists(d.artists || []);
      setSearchAlbums(d.albums || []);
    } catch {
      // Silently fail
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // ── Búsqueda de videos ─────────────────────────────────────────────────────

  const doSearchVideos = useCallback(async (q) => {
    if (!q.trim()) {
      setVideoResults([]);
      return;
    }
    setVideoLoading(true);
    setVideoError(null);
    try {
      const d = await api.get(`/search/videos?q=${encodeURIComponent(q)}&limit=20`);
      if (d.error) {
        setVideoError(d.error);
        setVideoResults([]);
      } else setVideoResults(d.results || []);
    } catch (e) {
      setVideoError(e.message);
      setVideoResults([]);
    }
    setVideoLoading(false);
  }, []);

  // ── Manejador de búsqueda inmediata (sin debounce) ──────────────────────────
  //    La búsqueda se ejecuta SOLO cuando el usuario presiona Enter o clickea
  //    el ícono de búsqueda (no en cada tecleo).
  //    ⚡ Rule: async-parallel — Promise.all para operaciones independientes

  const handleSearchChange = useCallback(
    (value) => {
      setQuery(value);
      if (!value.trim()) {
        setResults([]);
        setSearchArtists([]);
        setSearchAlbums([]);
        setVideoResults([]);
        return;
      }
      // Ejecutar ambas búsquedas en paralelo (antes: secuencial)
      Promise.all([doSearch(value), doSearchVideos(value)]).catch(() => {});
    },
    [doSearch, doSearchVideos],
  );

  return {
    query,
    setQuery,
    results,
    setResults,
    searchArtists,
    setSearchArtists,
    searchAlbums,
    setSearchAlbums,
    songsVisible,
    setSongsVisible,
    searchTab,
    setSearchTab,
    videoResults,
    setVideoResults,
    videoLoading,
    setVideoLoading,
    videoError,
    setVideoError,
    searchLoading,
    searchInputRef,
    doSearch,
    doSearchVideos,
    handleSearchChange,
  };
}
