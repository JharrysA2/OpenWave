import React, { useState, useEffect, useCallback, useRef } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { MusicCover } from "./MusicCover";
import { ConfirmModal } from "./ConfirmModal";
import TrackList from "./TrackList";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { TransferModal } from "./TransferModal";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  GLASS,
  ANIMATIONS,
} from "../utils/theme";

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
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(playlist?.name || "");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  // Ref siempre fresco de los ids descargados — se usa al cargar las canciones
  // y se re-sincroniza si la lista de descargas cambia con la vista abierta.
  const downloadedIdsRef = useRef(downloadedIds);
  downloadedIdsRef.current = downloadedIds;

  // ── Multi-select mode ──
  const {
    selectMode,
    selected,
    count: selectedCount,
    toggleSelect,
    toggleSelectMode,
    resetSelect,
  } = useMultiSelect();

  // ── Transfer modal ──
  const [showTransferModal, setShowTransferModal] = useState(false);

  // ── Load songs ──
  useEffect(() => {
    if (!playlist?.id) return;
    let cancelled = false;
    setLoading(true);
    api.fetchPlaylistSongs(playlist.id, toast).then((data) => {
      if (!cancelled) {
        // Marcar las canciones descargadas para que usePlayer reproduzca el
        // archivo local (offline) en vez de pedir stream al backend.
        setSongs(
          (data || []).map((s) =>
            downloadedIdsRef.current?.has(s.videoId) ? { ...s, downloaded: true } : s,
          ),
        );
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [playlist?.id, toast]);

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

  // ── Save edited name ──
  const saveName = async () => {
    if (editName.trim() && editName.trim() !== playlist.name) {
      await api.renamePlaylist(playlist.id, editName.trim(), toast);
      playlist.name = editName.trim();
      if (onPlaylistUpdated) onPlaylistUpdated();
    }
    setEditing(false);
  };

  // ── Delete entire playlist ──
  const handleDeletePlaylist = async () => {
    await api.deletePlaylist(playlist.id, toast);
    setShowDeleteModal(false);
    if (onPlaylistUpdated) onPlaylistUpdated();
    if (onBack) onBack();
  };

  // ── Remove a single song ──
  const handleRemoveSong = async (videoId, e) => {
    if (e) e.stopPropagation();
    setSongs((prev) => prev.filter((s) => s.videoId !== videoId));
    await api.removeFromPlaylist(playlist.id, videoId, toast);
    if (onPlaylistUpdated) onPlaylistUpdated();
  };

  // ── Remove selected songs ──
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

  // ── Transfer selected songs to another playlist ──
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

  // ── Play all songs ──
  const playAll = useCallback(
    (shuffle = false) => {
      if (songs.length === 0) return;
      const list = shuffle ? [...songs].sort(() => Math.random() - 0.5) : [...songs];
      playSong(list[0], 0, false, list);
    },
    [songs, playSong],
  );

  // ── Drag & drop ──
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

  // ── Cover resolution ──
  const coverSong = songs[0];
  const songCoverUrl =
    coverSong?.thumbnails?.[coverSong.thumbnails.length - 1]?.url || coverSong?.thumbnail;
  const coverUrl = playlist.cover || playlist.first_cover || songCoverUrl;

  // ── Other playlists for transfer ──
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
      {/* ── Hero ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          marginBottom: "24px",
          alignItems: "flex-end",
          ...ANIMATIONS.fadeIn(0),
        }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            ...GLASS.btn,
            borderRadius: RADIUS.full,
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "rgba(255,255,255,.6)",
            flexShrink: 0,
            transition: TRANSITIONS.fast,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = GLASS.btnHover.background;
            e.currentTarget.style.color = "rgba(255,255,255,.9)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = GLASS.btn.background;
            e.currentTarget.style.color = "rgba(255,255,255,.6)";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Cover */}
        <div
          style={{
            width: "160px",
            height: "160px",
            borderRadius: RADIUS.card,
            overflow: "hidden",
            flexShrink: 0,
            background: COLORS.surfaceCoverBg,
            boxShadow: "0 8px 30px rgba(0,0,0,.4)",
          }}
        >
          {coverUrl ? (
            <MusicCover
              src={coverUrl}
              displaySize={160}
              alt=""
              style={{ width: "160px", height: "160px" }}
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
                  ? `linear-gradient(135deg, ${playlist.color}55, ${playlist.color}11)`
                  : `linear-gradient(135deg, ${accentColor}44, ${accentColor}11)`,
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
              fontSize: "11px",
              fontWeight: "700",
              color: "rgba(255,255,255,.5)",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "4px",
            }}
          >
            Playlist
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
                fontWeight: "800",
                color: COLORS.textPrimary,
                background: "rgba(255,255,255,.06)",
                border: `1px solid ${accentColor}66`,
                borderRadius: "8px",
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
                fontWeight: "800",
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: "-.5px",
                cursor: "pointer",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textPrimary)}
            >
              {playlist.name}
            </h1>
          )}
          <div
            style={{
              fontSize: "13px",
              color: COLORS.textTertiary,
              fontWeight: "600",
              marginTop: "4px",
            }}
          >
            {songs.length} {songs.length === 1 ? "canción" : "canciones"}
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "14px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Shuffle */}
            <button
              onClick={() => playAll(true)}
              disabled={songs.length === 0}
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: RADIUS.pill,
                padding: "9px 18px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: COLORS.textPrimary,
                fontFamily: FONT,
                cursor: songs.length === 0 ? "not-allowed" : "pointer",
                opacity: songs.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "background .12s, border-color .12s, opacity .12s",
              }}
              onMouseEnter={(e) => {
                if (songs.length > 0) {
                  e.currentTarget.style.background = "rgba(255,255,255,.12)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,.18)";
                }
              }}
              onMouseLeave={(e) => {
                if (songs.length > 0) {
                  e.currentTarget.style.background = "rgba(255,255,255,.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,.08)";
                }
              }}
            >
              {Ic.shuffle(16)}
              Aleatorio
            </button>

            {/* Play All */}
            <button
              onClick={() => playAll(false)}
              disabled={songs.length === 0}
              style={{
                background: accentColor,
                border: "none",
                borderRadius: RADIUS.pill,
                padding: "9px 20px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "#fff",
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

            {/* Select mode toggle */}
            {songs.length > 0 && (
              <button
                onClick={toggleSelectMode}
                style={{
                  background: selectMode ? `${accentColor}18` : "rgba(255,255,255,.06)",
                  border: selectMode
                    ? `1px solid ${accentColor}44`
                    : "1px solid rgba(255,255,255,.08)",
                  borderRadius: RADIUS.pill,
                  padding: "9px 16px",
                  fontSize: "12.5px",
                  fontWeight: "700",
                  fontFamily: FONT,
                  color: selectMode ? accentColor : "rgba(255,255,255,.5)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background .12s, border-color .12s, color .12s",
                }}
                onMouseEnter={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.background = "rgba(255,255,255,.12)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.18)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.background = "rgba(255,255,255,.06)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.08)";
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
                  background: "rgba(239,68,68,.12)",
                  border: "1px solid rgba(239,68,68,.25)",
                  borderRadius: RADIUS.pill,
                  padding: "9px 16px",
                  fontSize: "12.5px",
                  fontWeight: "700",
                  color: "#ef4444",
                  fontFamily: FONT,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background .12s, border-color .12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(239,68,68,.2)";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(239,68,68,.12)";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,.25)";
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
                  background: "rgba(255,255,255,.06)",
                  border: `1px solid ${accentColor}33`,
                  borderRadius: RADIUS.pill,
                  padding: "9px 16px",
                  fontSize: "12.5px",
                  fontWeight: "700",
                  color: accentColor,
                  fontFamily: FONT,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background .12s, border-color .12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,.1)";
                  e.currentTarget.style.borderColor = `${accentColor}55`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,.06)";
                  e.currentTarget.style.borderColor = `${accentColor}33`;
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
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: RADIUS.pill,
                padding: "9px 16px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "rgba(255,255,255,.4)",
                fontFamily: FONT,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "background .12s, border-color .12s, color .12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239,68,68,.15)";
                e.currentTarget.style.borderColor = "rgba(239,68,68,.3)";
                e.currentTarget.style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.06)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,.08)";
                e.currentTarget.style.color = "rgba(255,255,255,.4)";
              }}
            >
              {Ic.trash}
              Eliminar playlist
            </button>
          </div>
        </div>
      </div>

      {/* ── Song list ──────────────────────────────────── */}
      {loading ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "rgba(255,255,255,.3)",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Cargando...
        </div>
      ) : songs.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "rgba(255,255,255,.3)",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Esta playlist está vacía. Agrega canciones desde el menú de opciones.
        </div>
      ) : (
        <TrackList
          songs={songs}
          currentSong={currentSong}
          accentColor={accentColor}
          onPlay={(song) => playSong(song, 0, false, songs)}
          openOptions={openOptions}
          onRemove={handleRemoveSong}
          selectMode={selectMode}
          selected={selected}
          toggleSelect={toggleSelect}
          dragEnabled
          dragIdx={dragIdx ?? -1}
          dragOverIdx={dragOverIdx ?? -1}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* ── Transfer Modal ─────────────────────────── */}
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
