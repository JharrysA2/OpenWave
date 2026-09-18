/**
 * SoundWave — Cliente API centralizado
 *
 * Maneja todas las llamadas HTTP al backend con:
 * - Timeouts automáticos (10s por defecto)
 * - Manejo consistente de errores
 * - Parsing de JSON
 * - Soporte para callback de error (toast)
 * - Caché en memoria con TTL de 5 minutos para TODAS las respuestas GET
 * - Normalización automática de thumbnails HD en todos los resultados
 */

import { withHDThumbnails } from "./thumbnails";
import { markOffline, markOnline } from "./backendHealth";

const API_BASE = "http://127.0.0.1:8765";
const DEFAULT_TIMEOUT = 10_000;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const JSON_HEADERS = { "Content-Type": "application/json" };

// ── Tipos de error ────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
//  CACHÉ EN MEMORIA CON TTL
// ═══════════════════════════════════════════════════════════════════════════════════
//
// Guarda TODAS las respuestas GET (JSON) en un Map.
// Cada entrada tiene timestamp; expira después de 5 minutos (CACHE_TTL).
// Limpieza automática al llegar a 100 entradas.
//
// Para saltar la caché en una llamada específica:
//   api.get("/path", { _skipCache: true })

const apiCache = new Map();

function cacheGet(path, options = {}) {
  if (options._skipCache) return null;
  const entry = apiCache.get(path);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    apiCache.delete(path);
    return null;
  }
  return entry.data;
}

function cacheSet(path, data) {
  apiCache.set(path, { data, timestamp: Date.now() });
  // Limpiar entradas expiradas cada 100 sets
  if (apiCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of apiCache) {
      if (now - v.timestamp > CACHE_TTL) apiCache.delete(k);
    }
  }
}

// Invalidar entradas de caché cuyo path empiece por `prefix`.
// E.g. borrar descargas muta `/downloads/all`, pero la lista se cacheó
// exactamente bajo `/downloads` — hay que invalidarla también.
function invalidatePrefix(prefix) {
  for (const key of [...apiCache.keys()]) {
    if (key.startsWith(prefix)) apiCache.delete(key);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
//  NORMALIZACIÓN DE THUMBNAILS HD
// ═══════════════════════════════════════════════════════════════════════════════════
//
// Convierte URLs individuales de thumbnail en arrays thumbnails[] con 5
// resoluciones HD (Google) o 4 resoluciones (YouTube). Esto se aplica
// AUTOMÁTICAMENTE a todos los resultados que pasan por la caché,
// garantizando que MusicCover tenga opciones HD para elegir.

function normalizeThumbsHD(data) {
  if (!data || typeof data !== "object") return data;

  // Array de canciones/artistas
  if (Array.isArray(data)) {
    return data.map(withHDThumbnails);
  }

  // Campos comunes que contienen listas de canciones
  if (data.results) data.results = normalizeThumbsHD(data.results);
  if (data.tracks) data.tracks = normalizeThumbsHD(data.tracks);
  if (data.songs) data.songs = normalizeThumbsHD(data.songs);
  if (data.albums) data.albums = normalizeThumbsHD(data.albums);
  if (data.artists) data.artists = normalizeThumbsHD(data.artists);

  // El objeto mismo puede ser una canción (para cache de /song/album, /song/details)
  if (data.videoId) return withHDThumbnails(data);

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════════
//  UTILIDAD: fetch con timeout
// ═══════════════════════════════════════════════════════════════════════════════════

async function _fetch(path, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...fetchOpts,
      signal: controller.signal,
    });

    // El servidor respondió (aunque sea con un 4xx/5xx): está vivo.
    // Si veníamos de offline, esto cuenta como reconexión.
    markOnline();

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new ApiError(
        body ? `[${resp.status}] ${body.slice(0, 120)}` : `HTTP ${resp.status}`,
        resp.status,
      );
    }

    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await resp.json();
    }
    return resp;
  } catch (err) {
    // ApiError => el servidor respondió con un error HTTP (ya marcado online).
    if (err instanceof ApiError) throw err;

    // Error de red / timeout => el backend no está accesible.
    const timedOut = err.name === "AbortError";
    markOffline(timedOut ? "Timeout" : err.message || "Error de conexión");

    if (timedOut) throw new ApiError("Timeout");
    throw new ApiError(err.message || "Error de conexión");
  } finally {
    clearTimeout(timer);
  }
}

// ── Toast helper ──────────────────────────────────────────────────────────────

function _handleError(err, toast) {
  const msg = err.status
    ? `Error del servidor (${err.status})`
    : "Error de conexión con el servidor";
  toast?.(msg, "error");
  console.warn("[API]", err.message);
}

// ── API Pública ───────────────────────────────────────────────────────────────

export const api = {
  /** URL base (para casos especiales como EventSource) */
  base: API_BASE,

  /**
   * Limpiar toda la caché (útil para recargar forzada)
   */
  clearCache() {
    apiCache.clear();
  },

  // ── GET (con caché automática + normalización de thumbnails HD) ────────────

  async get(path, options = {}) {
    // Verificar caché primero
    const cached = cacheGet(path, options);
    if (cached !== null) {
      return cached;
    }

    // Fetch desde el servidor
    const data = await _fetch(path, options);

    // Cachear + normalizar thumbnails (solo respuestas JSON con objetos)
    if (data && typeof data === "object" && !Array.isArray(data)) {
      // ⭐ No cachear respuestas de error: un fallo transitorio del servidor
      //    no debe quedarse pegado en caché hasta que expire el TTL.
      if (data.error) return data;
      const normalized = normalizeThumbsHD(data);
      cacheSet(path, normalized);
      return normalized;
    }
    if (data && Array.isArray(data)) {
      const normalized = normalizeThumbsHD(data);
      // Solo cachear arrays con al menos un elemento
      if (normalized.length > 0) cacheSet(path, normalized);
      return normalized;
    }

    return data;
  },

  // ── POST ───────────────────────────────────────────────────────────────────

  async post(path, body = {}) {
    const result = await _fetch(path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    // Invalidar caché después de exito
    apiCache.delete(path);
    return result;
  },

  // ── PUT ─────────────────────────────────────────────────────────────────────

  async put(path, body = {}) {
    const result = await _fetch(path, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    apiCache.delete(path);
    return result;
  },

  // ── DELETE ──────────────────────────────────────────────────────────────────

  async del(path, body = null) {
    const opts = { method: "DELETE" };
    if (body) {
      opts.headers = JSON_HEADERS;
      opts.body = JSON.stringify(body);
    }
    const result = await _fetch(path, opts);
    // Invalidar caché después de exito
    apiCache.delete(path);
    return result;
  },

  // ── Historial ───────────────────────────────────────────────────────────────

  async logHistory(song, toast) {
    if (!song?.videoId) return;
    try {
      await this.post("/history", song);
    } catch (err) {
      _handleError(err, toast);
    }
  },

  // ── Playlists ───────────────────────────────────────────────────────────────

  fetchPlaylists: () =>
    api
      .get("/playlists", { _skipCache: true })
      .then((d) => {
        const lists = d || [];
        return lists.map((pl) => ({
          id: pl.id,
          name: pl.name || "",
          color: pl.color || null,
          cover: pl.cover || null,
          first_cover: pl.first_cover || null,
          song_count: pl.song_count || 0,
        }));
      })
      .catch((err) => {
        _handleError(err, toast);
        return [];
      }),

  fetchPlaylistSongs: (pid, toast) =>
    api
      .get(`/playlists/${pid}/songs`, { _skipCache: true })
      .then((d) => {
        const songs = d || [];
        // Normalize: backend may return video_id (snake_case) or videoId (camelCase)
        return songs.map((s) => ({
          videoId: s.videoId || s.video_id || "",
          title: s.title || "",
          artist: s.artist || "",
          thumbnail: s.thumbnail || "",
          thumbnails: Array.isArray(s.thumbnails) ? s.thumbnails : [],
          duration: s.duration || 0,
        }));
      })
      .catch((err) => {
        _handleError(err, toast);
        return [];
      }),

  createPlaylist: (data, toast) =>
    api.post("/playlists", data).catch((err) => {
      _handleError(err, toast);
      return null;
    }),

  renamePlaylist: (pid, name, toast) =>
    api.put(`/playlists/${pid}`, { name }).catch((err) => {
      _handleError(err, toast);
    }),

  deletePlaylist: (pid, toast) =>
    api.del(`/playlists/${pid}`).catch((err) => {
      _handleError(err, toast);
    }),

  removeFromPlaylist: async (pid, videoId, toast) => {
    try {
      await api.del(`/playlists/${pid}/songs/${videoId}`);
      apiCache.delete(`/playlists/${pid}/songs`);
    } catch (err) {
      _handleError(err, toast);
    }
  },

  addToPlaylist: async (pid, songs, toast) => {
    try {
      const videoIds = songs.map((s) => s.videoId);
      await api.post(`/playlists/${pid}/songs`, { videoIds, songs });
      apiCache.delete(`/playlists/${pid}/songs`);
    } catch (err) {
      _handleError(err, toast);
    }
  },

  reorderPlaylist: (pid, videoIds, toast) =>
    api.post(`/playlists/${pid}/reorder`, { videoIds }).catch((err) => {
      _handleError(err, toast);
    }),

  deleteHistory: async (toast) => {
    try {
      await api.del("/history/all");
      invalidatePrefix("/history");
    } catch (err) {
      _handleError(err, toast);
    }
  },

  deleteDownloads: async (toast) => {
    try {
      await api.del("/downloads/all");
      invalidatePrefix("/downloads");
    } catch (err) {
      _handleError(err, toast);
    }
  },

  fetchDownloads: (toast) =>
    api
      .get("/downloads")
      .then((d) => d || [])
      .catch((err) => {
        _handleError(err, toast);
        return [];
      }),

  fetchHistory: (toast) =>
    api
      .get("/history")
      .then((d) => d || [])
      .catch((err) => {
        _handleError(err, toast);
        return [];
      }),

  // ── Error handler exportado ─────────────────────────────────────────────────

  handleError: _handleError,
};
