// ═══════════════════════════════════════════════════════════════════════════
//  lyricsOverrides — Letras elegidas por el usuario (Buscar / Editar letras)
//
//  El overlay de letras se DESMONTA al cerrarlo (montaje condicional en
//  App.jsx), así que el estado local de LyricsView se pierde: sin este mapa,
//  la letra buscada/editada se descartaba y volvía la automática. La clave es
//  por `videoId`, por lo que la elección sobrevive a cerrar/reabrir e incluso
//  a reiniciar la app.
//
//  Se guardan las líneas CRUDAS (con tags LRC si las hay), no los objetos
//  parseados: en la carga se reutiliza `processLyricsData`, que ya detecta los
//  tags de tiempo y parsea con `parseLrc`.
// ═══════════════════════════════════════════════════════════════════════════

const OVERRIDES_KEY = "sw_lyrics_overrides_v1";

// Poda: las letras son ~2-8 KB, pero para no crecer sin límite se conservan
// solo las N entradas más recientes (por updatedAt).
const MAX_ENTRIES = 100;

function readAll() {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === "object" && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    // localStorage lleno o bloqueado: la letra sigue vigente en memoria
    // (estado de LyricsView) hasta que se cierre la pantalla.
  }
}

function isValidEntry(entry) {
  return (
    !!entry &&
    Array.isArray(entry.lines) &&
    entry.lines.length > 0 &&
    entry.lines.every((l) => typeof l === "string")
  );
}

/**
 * Letra elegida para una canción, o `null` si no hay (o es inválida).
 */
export function getLyricsOverride(videoId) {
  if (!videoId) return null;
  const entry = readAll()[videoId];
  return isValidEntry(entry) ? entry : null;
}

/**
 * Persistir la letra elegida (resultado de búsqueda o edición manual).
 * Devuelve `false` si no había nada válido que guardar.
 */
export function setLyricsOverride(videoId, { lines, source } = {}) {
  if (!videoId || !Array.isArray(lines)) return false;

  const clean = lines.filter((l) => typeof l === "string" && l.trim());
  if (clean.length === 0) return false;

  const map = readAll();
  map[videoId] = {
    lines: clean,
    source: source || "manual",
    updatedAt: Date.now(),
  };

  const ids = Object.keys(map);
  if (ids.length > MAX_ENTRIES) {
    ids.sort((a, b) => (map[b]?.updatedAt || 0) - (map[a]?.updatedAt || 0));
    for (const id of ids.slice(MAX_ENTRIES)) delete map[id];
  }

  writeAll(map);
  return true;
}

/**
 * Descartar la letra elegida ("Recargar letras" → vuelve a la automática).
 * Devuelve `false` si no había nada que borrar.
 */
export function clearLyricsOverride(videoId) {
  if (!videoId) return false;
  const map = readAll();
  if (!(videoId in map)) return false;
  delete map[videoId];
  writeAll(map);
  return true;
}
