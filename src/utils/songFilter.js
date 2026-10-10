/**
 * Filtrado LOCAL de canciones para los buscadores de pantalla
 * (Me gusta, Historial, Descargas y Playlist). NO toca la red: solo
 * acota la lista que ya está en memoria a lo que coincide con la
 * consulta, con el comportamiento de «search in playlist» de
 * YouTube Music.
 *
 * La comparación normaliza el texto (NFD sin diacríticos + minúsculas)
 * para que «musica» encuentre «Música» y «Hans Zimmer» a «hans zimmer».
 */

/** Minúsculas y sin acentos/tilde diacrítica. */
export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * ¿La canción coincide con la consulta? Matchea título, artista(s) y
 * álbum. Consulta vacía → todo coincide (la lista queda completa).
 */
export function songMatchesQuery(song, query) {
  const q = normalizeText(query).trim();
  if (!q) return true;
  if (!song) return false;
  const artists = Array.isArray(song.artists)
    ? song.artists.map((a) => (typeof a === "string" ? a : a?.name || "")).join(" ")
    : "";
  const haystack = normalizeText(
    [song.title, song.artist, artists, song.album].filter(Boolean).join(" "),
  );
  return haystack.includes(q);
}

/** Filtra la lista de canciones según la consulta (estable y sin mutar). */
export function filterSongs(songs, query) {
  const list = Array.isArray(songs) ? songs : [];
  const q = normalizeText(query).trim();
  if (!q) return list;
  return list.filter((song) => songMatchesQuery(song, q));
}
