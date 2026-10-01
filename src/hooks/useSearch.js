import { useState, useRef, useCallback } from "react";
import { api } from "../utils/api";
import { DEFAULT_ERROR_CODE } from "../utils/errorCodes";

export function useSearch(initialTab = "music") {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchArtists, setSearchArtists] = useState([]);
  const [searchAlbums, setSearchAlbums] = useState([]);
  const [songsVisible, setSongsVisible] = useState(5);
  // Pestaña inicial de Búsqueda — settings.defaultSearchTab ("music" | "videos").
  const [searchTab, setSearchTab] = useState(initialTab);
  const [videoResults, setVideoResults] = useState([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // ── Errores con código reportable ────────────────────────────────────────
  // Sin esto un fallo de búsqueda se tragaba en silencio y la pantalla
  // decía "Sin resultados" cuando en realidad no se pudo consultar.
  const [searchError, setSearchError] = useState(null); // { message, code }
  const [videoErrorCode, setVideoErrorCode] = useState(null);

  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // ── Búsqueda de canciones ──────────────────────────────────────────────────

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([]);
      setSearchArtists([]);
      setSearchAlbums([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const d = await api.get(`/search?q=${encodeURIComponent(q)}&limit=25`);
      setResults(d.results || []);
      setSearchArtists(d.artists || []);
      setSearchAlbums(d.albums || []);
    } catch (e) {
      // Sin datos fiables: se limpian para que el estado de error no conviva
      // con resultados de una búsqueda anterior.
      setResults([]);
      setSearchArtists([]);
      setSearchAlbums([]);
      setSearchError({
        message: e?.message || "Error de búsqueda",
        code: e?.code || DEFAULT_ERROR_CODE,
      });
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // ── Búsqueda de videos ─────────────────────────────────────────────────────

  const doSearchVideos = useCallback(async (q) => {
    if (!q.trim()) {
      setVideoResults([]);
      setVideoErrorCode(null);
      return;
    }
    setVideoLoading(true);
    setVideoError(null);
    setVideoErrorCode(null);
    try {
      const d = await api.get(`/search/videos?q=${encodeURIComponent(q)}&limit=20`);
      if (d.error) {
        // El backend devuelve 200 con { results: [], error } cuando el
        // proveedor de música falla: el mensaje llega sin `code`, se deriva.
        setVideoError(d.error);
        setVideoErrorCode(/ytmusic/i.test(String(d.error)) ? "E-YTM-01" : DEFAULT_ERROR_CODE);
        setVideoResults([]);
      } else setVideoResults(d.results || []);
    } catch (e) {
      setVideoError(e.message);
      setVideoErrorCode(e.code || DEFAULT_ERROR_CODE);
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
        setSearchError(null);
        setVideoErrorCode(null);
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
          searchTimeoutRef.current = null;
        }
        return;
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(async () => {
        searchTimeoutRef.current = null;
        try {
          await Promise.all([doSearch(value), doSearchVideos(value)]).catch(() => {});
        } catch (e) {
          // Silently fail
        }
      }, 300);
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
    videoErrorCode,
    searchError,
    searchLoading,
    searchInputRef,
    doSearch,
    doSearchVideos,
    handleSearchChange,
  };
}
