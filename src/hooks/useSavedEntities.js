import { useState, useCallback } from "react";

const ALBUMS_KEY = "sw_liked_albums_v1";
const ARTISTS_KEY = "sw_followed_artists_v1";

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Álbumes con "Me gusta" + artistas que sigues (persistidos en localStorage).
 * Devuelve listas, chequeos y toggles; los toggles retornan true si se añadió.
 */
export function useSavedEntities() {
  const [likedAlbums, setLikedAlbums] = useState(() => readList(ALBUMS_KEY));
  const [followedArtists, setFollowedArtists] = useState(() => readList(ARTISTS_KEY));

  const isAlbumLiked = useCallback(
    (browseId) => !!browseId && likedAlbums.some((a) => a.browseId === browseId),
    [likedAlbums],
  );

  const isArtistFollowed = useCallback(
    (artist) => {
      const key = typeof artist === "string" ? artist : artist?.browseId || artist?.name;
      if (!key) return false;
      return followedArtists.some(
        (a) => a.browseId === key || a.name === key || (artist?.name && a.name === artist.name),
      );
    },
    [followedArtists],
  );

  const toggleAlbumLike = useCallback(
    (album) => {
      if (!album?.browseId) return false;
      const exists = likedAlbums.some((a) => a.browseId === album.browseId);
      const next = exists
        ? likedAlbums.filter((a) => a.browseId !== album.browseId)
        : [
            {
              browseId: album.browseId,
              title: album.title || "",
              artist: album.artist || "",
              type: album.type || "Álbum",
              year: album.year || "",
              artistBrowseId: album.artistBrowseId || "",
              thumbnail: album.thumbnail || "",
              thumbnails: album.thumbnails || [],
              likedAt: Date.now(),
            },
            ...likedAlbums,
          ];
      setLikedAlbums(next);
      writeList(ALBUMS_KEY, next);
      return !exists;
    },
    [likedAlbums],
  );

  const toggleFollow = useCallback(
    (artist) => {
      const browseId = typeof artist === "string" ? "" : artist?.browseId || "";
      const name = typeof artist === "string" ? artist : artist?.name || "";
      if (!browseId && !name) return false;
      const exists = followedArtists.some(
        (a) => (browseId && a.browseId === browseId) || (name && a.name === name),
      );
      const next = exists
        ? followedArtists.filter(
            (a) => !((browseId && a.browseId === browseId) || (name && a.name === name)),
          )
        : [
            {
              browseId,
              name,
              thumbnail:
                (typeof artist === "string" ? "" : artist?.thumbnail) ||
                (typeof artist === "string" ? "" : artist?.thumbnails?.[0]?.url) ||
                "",
              thumbnails: typeof artist === "string" ? [] : artist?.thumbnails || [],
              followedAt: Date.now(),
            },
            ...followedArtists,
          ];
      setFollowedArtists(next);
      writeList(ARTISTS_KEY, next);
      return !exists;
    },
    [followedArtists],
  );

  return {
    likedAlbums,
    followedArtists,
    isAlbumLiked,
    isArtistFollowed,
    toggleAlbumLike,
    toggleFollow,
  };
}
