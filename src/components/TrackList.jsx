import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, LAYOUTS, TRANSITIONS, ANIMATIONS, safeAccentText } from "../utils/theme";

/**
 * Lista de filas tipo PlaylistView (índice/checkbox, cover, info, duración,
 * badge, corazón, X y menú ⋮). Todo el estado vive en el padre: esta
 * componente solo renderiza y delega eventos — así LikedView/DownloadsView
 * se ven idénticos a una playlist.
 */
export default function TrackList({
  songs,
  currentSong,
  accentColor,
  onPlay,
  openOptions,
  liked = null,
  onToggleLike = null,
  badgeFor = null,
  onRemove = null,
  selectMode = false,
  selected = null,
  toggleSelect = null,
  dragEnabled = false,
  dragIdx = -1,
  dragOverIdx = -1,
  onDragStart = null,
  onDragOver = null,
  onDrop = null,
  onDragEnd = null,
}) {
  if (!songs || songs.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontFamily: FONT }}>
      {songs.map((song, i) => {
        if (!song || !song.videoId) return null;
        const isActive = currentSong?.videoId === song.videoId;
        const isSelected = !!selected?.has(song.videoId);
        const isDragging = dragIdx === i;
        const isDragOver = dragOverIdx === i;

        return (
          <div
            key={`${song.videoId}-${i}`}
            draggable={dragEnabled && !selectMode}
            onDragStart={dragEnabled && onDragStart ? (e) => onDragStart(e, i) : undefined}
            onDragOver={dragEnabled && onDragOver ? (e) => onDragOver(e, i) : undefined}
            onDrop={dragEnabled && onDrop ? (e) => onDrop(e, i) : undefined}
            onDragEnd={dragEnabled && onDragEnd ? onDragEnd : undefined}
            style={{
              ...ANIMATIONS.staggerFast(i),
              ...LAYOUTS.songRow(isActive, accentColor),
              opacity: isDragging ? 0.4 : 1,
              cursor: selectMode ? "pointer" : dragEnabled ? "grab" : "pointer",
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
                toggleSelect?.(song.videoId);
              } else {
                onPlay?.(song, i);
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
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {song.artist || "Desconocido"}
              </div>
            </div>

            {/* Badge (ej. OFFLINE + tamaño) */}
            {badgeFor && badgeFor(song, i)}

            {/* Duration */}
            {song.duration > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,.35)",
                  fontWeight: "600",
                  marginRight: "8px",
                  flexShrink: 0,
                }}
              >
                {Math.floor(song.duration / 60)}:
                {String(Math.floor(song.duration % 60)).padStart(2, "0")}
              </span>
            )}

            {/* Heart (quitar de "Me gusta") */}
            {onToggleLike && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLike(song.videoId, song);
                }}
                title="Quitar de Me gusta"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: liked?.has?.(song.videoId) ? COLORS.likeColor : COLORS.iconDimmer,
                  display: "flex",
                  padding: "4px",
                  transition: TRANSITIONS.fast,
                  flexShrink: 0,
                }}
              >
                {Ic.heart(!!liked?.has?.(song.videoId), 16)}
              </button>
            )}

            {/* Remove (solo cuando el padre lo pide) */}
            {onRemove && !selectMode && (
              <button
                onClick={(e) => onRemove(song.videoId, e)}
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
            {openOptions && !selectMode && (
              <button
                title="Más opciones"
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
  );
}
