/**
 * OpenWave — Caché PERSISTENTE de letras automáticas (localStorage).
 *
 * La caché de usePlayer (lyricsCacheRef) vive solo en memoria: al recargar
 * la app sin internet no queda nada y la pantalla de letras salía vacía.
 * Aquí se guardan las letras obtenidas automáticamente (por videoId) para
 * que funcionen también sin conexión tras un reinicio. Las letras
 * elegidas/editadas por el usuario (lyricsOverrides) siguen mandando
 * por encima de esta caché.
 */

const KEY = "sw_lyrics_cache_v1";
const MAX_ENTRIES = 200;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage lleno/bloqueado (modo privado): sin persistencia, sin romper.
  }
}

function prune(map) {
  const entries = Object.entries(map);
  if (entries.length <= MAX_ENTRIES) return map;
  // Conservar las más recientes (at = timestamp de guardado).
  entries.sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0));
  return Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES));
}

/** Letras persistidas de una canción: { lyrics: string[], source } | null. */
export function getStoredLyrics(videoId) {
  if (!videoId) return null;
  const entry = readAll()[videoId];
  if (!entry || !Array.isArray(entry.lyrics) || entry.lyrics.length === 0) return null;
  return { lyrics: entry.lyrics, source: entry.source || "" };
}

/** Persistir letras automáticas recién obtenidas (idempotente). */
export function storeLyrics(videoId, data) {
  if (!videoId || !Array.isArray(data?.lyrics) || data.lyrics.length === 0) return;
  const map = readAll();
  map[videoId] = { lyrics: data.lyrics, source: data.source || "", at: Date.now() };
  writeAll(prune(map));
}

/** Borrar la letra persistida de una canción («Recargar letras»). */
export function clearStoredLyrics(videoId) {
  if (!videoId) return;
  const map = readAll();
  if (!(videoId in map)) return;
  delete map[videoId];
  writeAll(map);
}
