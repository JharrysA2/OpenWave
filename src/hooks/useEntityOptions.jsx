import React, { useState, useCallback } from "react";
import { api } from "../utils/api";
import { EntityOptionsSheet } from "../components/EntityOptionsSheet";

/**
 * Estado + acciones de la hoja de opciones de álbum/artista.
 * Compartida por LikedView, DownloadsView, SearchView, AlbumView y ArtistView.
 */
export function useEntityOptions({
  toast,
  isAlbumLiked,
  toggleAlbumLike,
  isArtistFollowed,
  toggleFollow,
  goToAlbum,
  goToArtist,
  playSong,
  setShuffleActive,
  setDownloads,
  playlists,
  setPlaylistPickerOpen,
  setPlaylistPickerSongs,
}) {
  const [entityOptions, setEntityOptions] = useState(null);
  // { type: 'album'|'artist', entity, tracks: array|null, open: bool }

  const openEntityOptions = useCallback((type, entity, tracks = null) => {
    if (!entity) return;
    setEntityOptions({ type, entity, tracks, open: true });
  }, []);

  const closeEntityOptions = useCallback(() => {
    setEntityOptions((prev) => (prev ? { ...prev, open: false } : prev));
  }, []);

  /** Carga las pistas de un álbum (la caché de api.get evita repeticiones). */
  const fetchAlbumTracks = useCallback(
    async (album, providedTracks) => {
      if (providedTracks && providedTracks.length > 0) return providedTracks;
      if (!album?.browseId) return [];
      try {
        const d = await api.get(`/album/${encodeURIComponent(album.browseId)}`);
        return d?.tracks || [];
      } catch {
        return [];
      }
    },
    [],
  );

  /**
   * Descarga un álbum completo en el backend (POST /downloads/album) y
   * sigue el progreso agregado por SSE. Idempotente: las pistas ya
   * presentes se omiten en el backend.
   */
  const downloadAlbum = useCallback(
    async (album, tracks = null) => {
      if (!album) return;
      const list = await fetchAlbumTracks(album, tracks);
      if (list.length === 0) {
        toast?.("El álbum no tiene canciones", "info");
        return;
      }
      const body = {
        browseId: album.browseId || "",
        title: album.title || "",
        type: album.type || "Album",
        artist: album.artist || "",
        artistBrowseId: album.artistBrowseId || "",
        thumbnail: album.thumbnail || "",
        thumbnails: album.thumbnails || [],
        tracks: list.map((t) => ({
          videoId: t.videoId,
          title: t.title || "",
          artist: t.artist || "",
          thumbnail: t.thumbnail || "",
          thumbnails: t.thumbnails || [],
          duration: t.duration || 0,
        })),
      };
      try {
        const r = await api.post("/downloads/album", body);
        if (r?.already) {
          toast?.("El álbum ya se está descargando", "info");
          return;
        }
        toast?.(`Descargando álbum (${r?.total ?? list.length} canciones)…`, "info");
        const key = album.browseId || album.title || "";
        const es = new EventSource(
          `${api.base}/download/progress/album/${encodeURIComponent(key)}`,
        );
        es.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.status === "done") {
              es.close();
              toast?.("Álbum descargado", "success");
              api.fetchDownloads().then(setDownloads).catch(() => {});
            } else if (d.status === "error") {
              es.close();
              toast?.("Error al descargar el álbum", "error");
            }
          } catch {}
        };
        es.onerror = () => {
          try {
            es.close();
          } catch {}
        };
      } catch {
        toast?.("No se pudo iniciar la descarga", "error");
      }
    },
    [fetchAlbumTracks, toast, setDownloads],
  );

  const withTracks = useCallback(
    async (fn) => {
      const { entity, tracks } = entityOptions || {};
      const list = await fetchAlbumTracks(entity, tracks);
      if (list.length === 0) {
        toast?.("No se pudieron cargar las canciones", "error");
        return;
      }
      fn(list);
      closeEntityOptions();
    },
    [entityOptions, fetchAlbumTracks, toast, closeEntityOptions],
  );

  const playAlbum = useCallback(
    (shuffle) =>
      withTracks((list) => {
        const finalList = shuffle ? [...list].sort(() => Math.random() - 0.5) : list;
        if (shuffle) setShuffleActive?.(true);
        playSong(finalList[0], 0, false, finalList);
      }),
    [withTracks, playSong, setShuffleActive],
  );

  /**
   * Reproduce un álbum directamente (para el ▶ de las tarjetas): carga las
   * pistas si no se pasaron y arma la cola.
   */
  const playAlbumDirect = useCallback(
    async (album, shuffle = false) => {
      const list = await fetchAlbumTracks(album, null);
      if (list.length === 0) {
        toast?.("No se pudieron cargar las canciones", "error");
        return;
      }
      const finalList = shuffle ? [...list].sort(() => Math.random() - 0.5) : list;
      if (shuffle) setShuffleActive?.(true);
      playSong(finalList[0], 0, false, finalList);
    },
    [fetchAlbumTracks, toast, playSong, setShuffleActive],
  );

  const addAlbumToPlaylist = useCallback(async () => {
    if (playlists && playlists.length === 0) {
      toast?.("No hay playlists. Crea una en Ajustes", "info");
      closeEntityOptions();
      return;
    }
    const { entity, tracks } = entityOptions || {};
    const list = await fetchAlbumTracks(entity, tracks);
    if (list.length === 0) {
      toast?.("No se pudieron cargar las canciones", "error");
      closeEntityOptions();
      return;
    }
    setPlaylistPickerSongs?.(list);
    setPlaylistPickerOpen?.(true);
    // la hoja queda abierta hasta elegir playlist (igual que canciones)
    closeEntityOptions();
  }, [entityOptions, fetchAlbumTracks, playlists, toast, setPlaylistPickerSongs, setPlaylistPickerOpen, closeEntityOptions]);

  const toggleEntityLike = useCallback(() => {
    const { type, entity } = entityOptions || {};
    if (type === "album") {
      const added = toggleAlbumLike?.(entity);
      toast?.(added ? "Añadido a Me gusta" : "Quitado de Me gusta", added ? "success" : "info");
    } else {
      const added = toggleFollow?.(entity);
      toast?.(added ? `Siguiendo a ${entity?.name || "artista"}` : "Dejaste de seguir", added ? "success" : "info");
    }
  }, [entityOptions, toggleAlbumLike, toggleFollow, toast]);

  const goToEntity = useCallback(() => {
    const { type, entity } = entityOptions || {};
    if (type === "album") goToAlbum?.(entity.browseId);
    else goToArtist?.(entity.browseId || entity.name);
  }, [entityOptions, goToAlbum, goToArtist]);

  const type = entityOptions?.type || "album";
  const entity = entityOptions?.entity || null;
  const liked =
    type === "album" ? !!isAlbumLiked?.(entity?.browseId) : !!isArtistFollowed?.(entity);

  const entityOptionsSheet = entity ? (
    <EntityOptionsSheet
      open={!!entityOptions.open}
      onClose={closeEntityOptions}
      type={type}
      entity={entity}
      liked={liked}
      onToggleLike={toggleEntityLike}
      onDownload={
        type === "album" ? () => downloadAlbum(entity, entityOptions.tracks) : null
      }
      onPlay={type === "album" ? (shuffle) => playAlbum(shuffle) : null}
      onShuffle={type === "album" ? () => playAlbum(true) : null}
      onGoTo={goToEntity}
      onAddToPlaylist={type === "album" ? addAlbumToPlaylist : null}
    />
  ) : null;

  return {
    openEntityOptions,
    closeEntityOptions,
    downloadAlbum,
    fetchAlbumTracks,
    playAlbum: playAlbumDirect,
    entityOptionsSheet,
  };
}
