import React, { useState, useEffect, useCallback, useRef } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { filterSongs } from "../utils/songFilter";
import { MusicCover } from "./MusicCover";
import { ConfirmModal } from "./ConfirmModal";
import { StatusState } from "./StatusState";
import { SearchBar } from "./SearchBar";
import TrackList from "./TrackList";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { TransferModal } from "./TransferModal";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS, ANIMATIONS } from "../utils/theme";

export default function PlaylistView({
  playlist,
  currentSong,
  accentColor,
  playSong,
  openOptions,
  onBack,
  toast,
  onPlaylistUpdated,
  playlists,
  refreshPlaylists,
  downloadedIds = null,
}) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(playlist?.name || "");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  // Buscador local: filtra las canciones de ESTA playlist (sin red).
  const [songQuery, setSongQuery] = useState("");

  // Ref siempre fresco de los ids descargados — se usa al cargar las canciones
  // y se re-sincroniza si la lista de descargas cambia con la vista abierta.
  const downloadedIdsRef = useRef(downloadedIds);
  downloadedIdsRef.current = downloadedIds;

  // Multi-select mode
  const {
    selectMode,
    selected,
    count: selectedCount,
    toggleSelect,
    toggleSelectMode,
    resetSelect,
  } = useMultiSelect();

  // Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Load songs
  //  Exponido como retry: un fallo de red muestra estado de error con
  //  «Reintentar», NUNCA «Esta playlist está vacía» (bug: el error se
  //  tragaba y se pintaba como vacío).
  const loadSongs = useCallback(async () => {
    if (!playlist?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.fetchPlaylistSongs(playlist.id);
      // Marcar las canciones descargadas para que usePlayer reproduzca el
      // archivo local (offline) en vez de pedir stream al backend.
      setSongs(
        (data || []).map((s) =>
          downloadedIdsRef.current?.has(s.videoId) ? { ...s, downloaded: true } : s,
        ),
      );
    } catch (err) {
      setSongs([]);
      setLoadError(err || new Error("load failed"));
    } finally {
      setLoading(false);
    }
  }, [playlist?.id]);

  useEffect(() => {
    if (!playlist?.id) return;
    setSongQuery("");
    loadSongs();
  }, [playlist?.id, loadSongs]);

  // Mantener `downloaded` al día si cambia la lista de descargas con la
  // playlist abierta (nueva descarga o borrado desde otra vista).
  useEffect(() => {
    setSongs((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const should = !!downloadedIds?.has(s.videoId);
        if (!!s.downloaded === should) return s;
        changed = true;
        return should ? { ...s, downloaded: true } : { ...s, downloaded: false };
      });
      return changed ? next : prev;
    });
  }, [downloadedIds]);

  // Lista filtrada por el buscador local (vacío = todas).
  const filteredSongs = filterSongs(songs, songQuery);
  const isFiltering = !!songQuery.trim();

  // Save edited name
  const saveName = async () => {
    if (editName.trim() && editName.trim() !== playlist.name) {
      await api.renamePlaylist(playlist.id, editName.trim(), toast);
      playlist.name = editName.trim();
      if (onPlaylistUpdated) onPlaylistUpdated();
    }
    setEditing(false);
  };

  // Delete entire playlist
  const handleDeletePlaylist = async () => {
    await api.deletePlaylist(playlist.id, toast);
    setShowDeleteModal(false);
    if (onPlaylistUpdated) onPlaylistUpdated();
    if (onBack) onBack();
  };

  // Remove a single song
  const handleRemoveSong = async (videoId, e) => {
    if (e) e.stopPropagation();
    setSongs((prev) => prev.filter((s) => s.videoId !== videoId));
    await api.removeFromPlaylist(playlist.id, videoId, toast);
    if (onPlaylistUpdated) onPlaylistUpdated();
  };

  // Remove selected songs
  const handleRemoveSelected = async () => {
    if (selected.size === 0) return;
    const toRemove = [...selected];
    setSongs((prev) => prev.filter((s) => !selected.has(s.videoId)));
    resetSelect();
    for (const vid of toRemove) {
      await api.removeFromPlaylist(playlist.id, vid, toast).catch(() => {});
    }
    if (onPlaylistUpdated) onPlaylistUpdated();
  };

  // Transfer selected songs to another playlist
  const handleTransferSelected = async (targetPlaylistId) => {
    if (selected.size === 0) return;
    const songsToTransfer = songs.filter((s) => selected.has(s.videoId));
    await api.addToPlaylist(targetPlaylistId, songsToTransfer, toast);
    toast(
      `${songsToTransfer.length} ${songsToTransfer.length === 1 ? "canción" : "canciones"} transferida${songsToTransfer.length !== 1 ? "s" : ""}`,
      "success",
    );
    setShowTransferModal(false);
    resetSelect();
    if (refreshPlaylists) await refreshPlaylists();
  };

  // Play all songs
  const playAll = useCallback(
    (shuffle = false) => {
      if (songs.length === 0) return;
      const list = shuffle ? [...songs].sort(() => Math.random() - 0.5) : [...songs];
      playSong(list[0], 0, false, list);
    },
    [songs, playSong],
  );

  // Drag & drop
  const dragIdxRef = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = useCallback((e, idx) => {
    dragIdxRef.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setDragImage(e.currentTarget, 30, 30);
    } catch {}
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdxRef.current !== null && dragIdxRef.current !== idx) {
      setDragOverIdx(idx);
    }
  }, []);

  const handleDrop = useCallback(
    (e, idx) => {
      e.preventDefault();
      const from = dragIdxRef.current;
      if (from === null || from === idx) {
        setDragIdx(null);
        setDragOverIdx(null);
        return;
      }
      setSongs((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(from, 1);
        updated.splice(idx, 0, moved);
        const videoIds = updated.map((s) => s.videoId);
        api.reorderPlaylist(playlist.id, videoIds, toast);
        if (onPlaylistUpdated) onPlaylistUpdated();
        return updated;
      });
      setDragIdx(null);
      setDragOverIdx(null);
    },
    [playlist?.id, toast, onPlaylistUpdated],
  );

  const handleDragEnd = useCallback(() => {
    dragIdxRef.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  // Cover resolution
  const coverSong = songs[0];
  const songCoverUrl =
    coverSong?.thumbnails?.[coverSong.thumbnails.length - 1]?.url || coverSong?.thumbnail;
  const coverUrl = playlist.cover || playlist.first_cover || songCoverUrl;

  // Other playlists for transfer
  const otherPlaylists = (playlists || []).filter((p) => p.id !== playlist?.id);

  return (
    <div
      style={{
        padding: SPACING.content.pad,
        fontFamily: FONT,
        overflowY: "auto",
        height: "100%",
        paddingBottom: "90px",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <button
          onClick={onBack}
          style={{
            ...GLASS.control,
            borderRadius: RADIUS.default,
            minHeight: "44px",
            padding: "0 14px 0 10px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
            color: COLORS.textSecondary,
            fontFamily: FONT,
            fontSize: "14px",
            fontWeight: "500",
            transition: TRANSITIONS.fast,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = GLASS.controlHover.background;
            e.currentTarget.style.color = COLORS.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = GLASS.control.background;
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
      </div>

      {/* Hero */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          marginBottom: "24px",
          alignItems: "flex-end",
          ...ANIMATIONS.fadeIn(0),
        }}
      >
        {/* Cover */}
        <div
          style={{
            width: "144px",
            height: "144px",
            borderRadius: RADIUS.default,
            overflow: "hidden",
            flexShrink: 0,
            background: COLORS.surfaceCoverBg,
          }}
        >
          {coverUrl ? (
            <MusicCover
              src={coverUrl}
              displaySize={144}
              alt=""
              style={{ width: "144px", height: "144px" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: playlist.color
                  ? `color-mix(in srgb, ${playlist.color} 18%, transparent)`
                  : `color-mix(in srgb, ${accentColor} 18%, transparent)`,
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,.3)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              fontWeight: "600",
              color: COLORS.textTertiary,
              textTransform: "uppercase",
              letterSpacing: ".04em",
              marginBottom: "4px",
            }}
          >
            <span>Playlist</span>
            <span aria-hidden="true">·</span>
            <span style={{ textTransform: "none", letterSpacing: 0 }}>
              {songs.length} {songs.length === 1 ? "canción" : "canciones"}
            </span>
          </div>
          {editing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              autoFocus
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: COLORS.textPrimary,
                background: "rgba(255,255,255,.06)",
                border: `1px solid ${accentColor}66`,
                borderRadius: RADIUS.default,
                padding: "2px 8px",
                outline: "none",
                width: "100%",
                fontFamily: FONT,
                letterSpacing: "-.5px",
              }}
            />
          ) : (
            <h1
              onClick={() => {
                setEditName(playlist.name);
                setEditing(true);
              }}
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: "-.02em",
                cursor: "pointer",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textPrimary)}
            >
              {playlist.name}
            </h1>
          )}
          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "16px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Play All */}
            <button
              onClick={() => playAll(false)}
              disabled={songs.length === 0}
              style={{
                background: accentColor,
                border: "none",
                borderRadius: RADIUS.default,
                minHeight: "44px",
                padding: "0 20px",
                fontSize: "14px",
                fontWeight: "600",
                // Acento de fondo → primer plano dinámico (nunca blanco fijo)
                color: "var(--neon-fg)",
                fontFamily: FONT,
                cursor: songs.length === 0 ? "not-allowed" : "pointer",
                opacity: songs.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (songs.length > 0) e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = songs.length === 0 ? "0.4" : "1";
              }}
            >
              {Ic.play(16)}
              Reproducir
            </button>

            <button
              onClick={() => playAll(true)}
              disabled={songs.length === 0}
              style={{
                ...GLASS.control,
                borderRadius: RADIUS.default,
                minHeight: "44px",
                padding: "0 16px",
                fontSize: "14px",
                fontWeight: "600",
                color: COLORS.textPrimary,
                fontFamily: FONT,
                cursor: songs.length === 0 ? "not-allowed" : "pointer",
                opacity: songs.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "background .12s, opacity .12s",
              }}
              onMouseEnter={(e) => {
                if (songs.length > 0) {
                  e.currentTarget.style.background = GLASS.controlHover.background;
                }
              }}
              onMouseLeave={(e) => {
                if (songs.length > 0) {
                  e.currentTarget.style.background = GLASS.control.background;
                }
              }}
            >
              {Ic.shuffle(16)}
              Aleatorio
            </button>

            {/* Select mode toggle */}
            {songs.length > 0 && (
              <button
                onClick={toggleSelectMode}
                style={{
                  ...GLASS.control,
                  // Modo selección: relleno del acento, sin contorno.
                  ...(selectMode ? { background: `${accentColor}22` } : {}),
                  borderRadius: RADIUS.default,
                  minHeight: "44px",
                  padding: "0 16px",
                  fontSize: "14px",
                  fontWeight: "600",
                  fontFamily: FONT,
                  color: selectMode ? accentColor : COLORS.textSecondary,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background .12s, color .12s",
                }}
                onMouseEnter={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.background = GLASS.controlHover.background;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.background = GLASS.control.background;
                  }
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                {selectMode ? `Seleccionar (${selectedCount})` : "Seleccionar"}
              </button>
            )}

            {/* Delete selected */}
            {selectMode && selected.size > 0 && (
              <button
                onClick={handleRemoveSelected}
                style={{
                  ...GLASS.control,
                  // Sin rojo: el borrado va con el material y el color neutro
                  // de la barra (la selección ya avisa de lo que se borra).
                  borderRadius: RADIUS.default,
                  minHeight: "44px",
                  padding: "0 16px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: COLORS.textSecondary,
                  fontFamily: FONT,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background .12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = GLASS.controlHover.background;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = GLASS.control.background;
                }}
              >
                {Ic.trash}
                Eliminar ({selectedCount})
              </button>
            )}

            {/* Transfer selected */}
            {selectMode && selected.size > 0 && (
              <button
                onClick={() => setShowTransferModal(true)}
                style={{
                  ...GLASS.control,
                  // Mover: cristal con el texto en acento, sin contorno.
                  borderRadius: RADIUS.default,
                  minHeight: "44px",
                  padding: "0 16px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: accentColor,
                  fontFamily: FONT,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background .12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = GLASS.controlHover.background;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = GLASS.control.background;
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Mover ({selectedCount})
              </button>
            )}

            {/* Delete playlist */}
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                borderRadius: RADIUS.default,
                minHeight: "44px",
                padding: "0 8px",
                fontSize: "14px",
                fontWeight: "500",
                color: COLORS.textTertiary,
                fontFamily: FONT,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "color .12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = COLORS.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = COLORS.textTertiary;
              }}
            >
              {Ic.trash}
              Eliminar playlist
            </button>
          </div>
        </div>
      </div>

      {/* Song list */}
      {loading ? (
        <div
          style={{
            padding: "60px 24px",
            textAlign: "center",
            color: COLORS.textSecondary,
            fontSize: "14px",
            fontWeight: "400",
          }}
        >
          Cargando...
        </div>
      ) : loadError ? (
        <StatusState
          code={loadError?.code}
          title="No se pudo cargar la playlist"
          onRetry={loadSongs}
          accentColor={accentColor || "#a78bfa"}
        />
      ) : songs.length === 0 ? (
        <div
          style={{
            padding: "60px 24px",
            textAlign: "center",
            color: COLORS.textSecondary,
            fontSize: "14px",
            fontWeight: "400",
          }}
        >
          Esta playlist está vacía. Agrega canciones desde el menú de opciones.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "12px" }}>
            <SearchBar
              value={songQuery}
              onChange={setSongQuery}
              placeholder="Buscar en esta playlist"
              accentColor={accentColor}
              glowOnFocus
              clearCircle
              height="44px"
            />
          </div>
          {filteredSongs.length === 0 ? (
            <div
              style={{
                padding: "60px 24px",
                textAlign: "center",
                color: COLORS.textSecondary,
                fontSize: "14px",
                fontWeight: "400",
              }}
            >
              Sin resultados para «{songQuery}»
            </div>
          ) : (
            <TrackList
              songs={filteredSongs}
              currentSong={currentSong}
              accentColor={accentColor}
              onPlay={(song) => playSong(song, 0, false, filteredSongs)}
              openOptions={openOptions}
              onRemove={handleRemoveSong}
              selectMode={selectMode}
              selected={selected}
              toggleSelect={toggleSelect}
              // Reordenar solo con la lista COMPLETA visible: los índices
              // del drag no corresponden a la lista real si hay filtro.
              dragEnabled={!isFiltering}
              dragIdx={dragIdx ?? -1}
              dragOverIdx={dragOverIdx ?? -1}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          )}
        </>
      )}

      {/* Transfer Modal */}
      <TransferModal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Mover a playlist"
        emptyMessage="No hay otras playlists disponibles"
        playlists={otherPlaylists}
        onSelect={handleTransferSelected}
      />

      <ConfirmModal
        open={showDeleteModal}
        title="Eliminar playlist"
        message={`¿Estás seguro de que quieres eliminar la playlist "${playlist.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={handleDeletePlaylist}
        onCancel={() => setShowDeleteModal(false)}
        danger
      />
    </div>
  );
}
