import { useMemo } from "react";

function albumKeyOf(song) {
  if (song.albumBrowseId) return `id:${song.albumBrowseId}`;
  const title = song.album || song.albumTitle || "";
  if (!title) return "";
  return `name:${title}|${song.artist || ""}`;
}

function artistKeyOf(song) {
  return song.artistBrowseId || song.artist || "";
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return 0;
  return bytes;
}

function buildGroups(songs, keyOf) {
  const map = new Map();
  for (const song of songs || []) {
    if (!song) continue;
    const key = keyOf(song);
    if (!key) continue;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        songs: [],
        count: 0,
        size: 0,
        downloadedCount: 0,
        browseId: "",
        thumbnail: "",
        thumbnails: [],
      };
      map.set(key, g);
    }
    g.songs.push(song);
    g.count += 1;
    g.size += fmtSize(song.size);
    if (song.downloaded) g.downloadedCount += 1;
    if (!g.thumbnail && (song.thumbnail || song.thumbnails?.[0]?.url)) {
      g.thumbnail = song.thumbnail || song.thumbnails?.[0]?.url;
      g.thumbnails = song.thumbnails || [];
    }
    if (!g.browseId && (song.albumBrowseId || song.artistBrowseId)) {
      g.browseId = song.albumBrowseId || song.artistBrowseId;
    }
  }
  return [...map.values()];
}

/** Agrupa canciones por álbum (id de álbum si existe, si no por nombre+artista). */
export function groupByAlbum(songs) {
  const groups = buildGroups(songs, albumKeyOf);
  return groups
    .map((g) => {
      const first = g.songs[0] || {};
      return {
        ...g,
        browseId: g.browseId || first.albumBrowseId || "",
        title: first.album || first.albumTitle || "Sin álbum",
        artist: first.artist || "",
        type: first.albumType || "",
        year: first.year || "",
        artistBrowseId: first.artistBrowseId || "",
      };
    })
    .sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0) || b.count - a.count);
}

/** Agrupa canciones por artista (id de artista si existe, si no por nombre). */
export function groupByArtist(songs) {
  const groups = buildGroups(songs, artistKeyOf);
  return groups.map((g) => {
    const first = g.songs[0] || {};
    const albums = new Set(g.songs.map(albumKeyOf).filter(Boolean));
    return {
      ...g,
      browseId: g.browseId || first.artistBrowseId || "",
      name: first.artist || "Desconocido",
      albumsCount: albums.size,
    };
  });
}

/**
 * Hook: agrupaciones memoizadas de una lista de canciones.
 * `size` en los grupos es la suma de bytes (útil en Descargas).
 */
export function useLibraryGroups(songs) {
  return useMemo(
    () => ({
      albums: groupByAlbum(songs),
      artists: groupByArtist(songs),
    }),
    [songs],
  );
}
