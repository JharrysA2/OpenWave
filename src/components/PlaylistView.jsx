import React, { useState, useEffect, useCallback, useRef } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { MusicCover } from "./MusicCover";
import { ConfirmModal } from "./ConfirmModal";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { TransferModal } from "./TransferModal";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  LAYOUTS,
  GLASS,
  ANIMATIONS,
  safeAccentText,
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
}) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(playlist?.name || "");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

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
        setSongs(data || []);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [playlist?.id, toast]);

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
      `${songsToTransfer.length} canción${songsToTransfer.length !== 1 ? "es" : ""} transferida${songsToTransfer.length !== 1 ? "s" : ""}`,
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
            {songs.length} canción{songs.length !== 1 ? "es" : ""}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {songs.map((song, i) => {
            if (!song || !song.videoId) return null;
            const isActive = currentSong?.videoId === song.videoId;
            const isDragging = dragIdx === i;
            const isDragOver = dragOverIdx === i;
            const isSelected = selected.has(song.videoId);

            return (
              <div
                key={`${song.videoId}-${i}`}
                draggable={!selectMode}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                style={{
                  ...ANIMATIONS.staggerFast(i),
                  ...LAYOUTS.songRow(isActive, accentColor),
                  opacity: isDragging ? 0.4 : 1,
                  cursor: selectMode ? "pointer" : "grab",
                  borderLeft: isDragOver
                    ? `2px solid ${accentColor}`
                    : LAYOUTS.songRow(isActive, accentColor).borderLeft || "2px solid transparent",
                  background: isSelected
                    ? `rgba(255,255,255,.08)`
                    : isDragging
                      ? "rgba(255,255,255,.03)"
                      : undefined,
                  transition: "background .1s, opacity .1s",
                }}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(song.videoId);
                  } else {
                    playSong(song, 0, false, songs);
                  }
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !selectMode && !isSelected) {
                    e.currentTarget.style.background = LAYOUTS.songRowHover.background;
                    e.currentTarget.style.borderColor = LAYOUTS.songRowHover.borderColor;
                    e.currentTarget.style.boxShadow = LAYOUTS.songRowHover.boxShadow;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive && !selectMode && !isSelected) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                {/* Select checkbox or order number */}
                {selectMode ? (
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      border: `2px solid ${isSelected ? accentColor : "rgba(255,255,255,.2)"}`,
                      background: isSelected ? accentColor : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all .15s",
                    }}
                  >
                    {isSelected && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      width: "24px",
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: "700",
                      color: isActive ? safeAccentText(accentColor) : "rgba(255,255,255,.3)",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                )}

                {/* Cover */}
                <div style={LAYOUTS.listCover}>
                  <MusicCover
                    thumbnails={song.thumbnails}
                    src={song.thumbnail}
                    displaySize={50}
                    alt=""
                    style={{ width: "40px", height: "40px" }}
                  />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13.5px",
                      fontWeight: "700",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isActive ? safeAccentText(accentColor) : COLORS.textPlayerTitle,
                    }}
                  >
                    {song.title || "Sin título"}
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: COLORS.textTertiary,
                      fontWeight: "600",
                      marginTop: "1px",
                    }}
                  >
                    {song.artist || "Desconocido"}
                  </div>
                </div>

                {/* Duration */}
                {song.duration > 0 && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "rgba(255,255,255,.35)",
                      fontWeight: "600",
                      marginRight: "8px",
                    }}
                  >
                    {Math.floor(song.duration / 60)}:
                    {String(Math.floor(song.duration % 60)).padStart(2, "0")}
                  </span>
                )}

                {/* Remove from playlist */}
                {!selectMode && (
                  <button
                    onClick={(e) => handleRemoveSong(song.videoId, e)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "rgba(255,255,255,.25)",
                      display: "flex",
                      padding: "4px",
                      transition: TRANSITIONS.fast,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.25)")}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}

                {/* 3-dot menu */}
                {!selectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openOptions(song);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: COLORS.iconDefault,
                      display: "flex",
                      padding: "4px",
                      flexShrink: 0,
                    }}
                  >
                    {Ic.dots}
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
