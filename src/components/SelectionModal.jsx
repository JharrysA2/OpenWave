import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, RADIUS, TRANSITIONS, SHADOWS, GLASS, withAlpha } from "../utils/theme";

export function SelectionModal({ open, onClose, songs, currentSong, onDelete }) {
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  if (!open || !songs) return null;

  const toggle = (vid) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(vid) ? n.delete(vid) : n.add(vid);
      return n;
    });
  const allSelected = selected.size === songs.length;
  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(songs.map((s) => s.videoId || s.video_id).filter(Boolean)),
    );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        zIndex: 800,
        animation: "overlayIn .2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          borderRadius: "24px",
          width: "440px",
          maxWidth: "92vw",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "900",
              color: COLORS.textPrimary,
              letterSpacing: "-.3px",
            }}
          >
            Seleccionar canciones
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={toggleAll}
              style={{
                background: "none",
                border: "none",
                color: COLORS.accentFallback,
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "800",
                fontFamily: FONT,
              }}
            >
              {allSelected ? "Ninguna" : "Todas"}
            </button>
            <button
              onClick={onClose}
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%)",
                border: "1px solid rgba(255,255,255,.14)",
                color: "rgba(255,255,255,.55)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "34px",
                height: "34px",
                borderRadius: RADIUS.full,
                padding: "0",
                boxShadow: SHADOWS.settingsClose,
                transition: TRANSITIONS.normal,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textPlayerTitle)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.progressTime)}
            >
              {Ic.close}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {songs.map((song, i) => {
            const vid = song.videoId || song.video_id;
            const checked = selected.has(vid);
            const active = currentSong?.videoId === vid;
            return (
              <div
                key={(vid || "") + i}
                onClick={() => toggle(vid)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "9px 10px",
                  borderRadius: RADIUS.default,
                  cursor: "pointer",
                  background: checked
                    ? "var(--neon-18)"
                    : active
                      ? COLORS.surfaceCard
                      : "transparent",
                  transition: TRANSITIONS.fast,
                }}
                onMouseEnter={(e) => {
                  if (!checked) e.currentTarget.style.background = COLORS.surfaceNav;
                }}
                onMouseLeave={(e) => {
                  if (!checked) {
                    e.currentTarget.style.background = active ? COLORS.surfaceCard : "transparent";
                  }
                }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "6px",
                    flexShrink: 0,
                    background: checked ? COLORS.accentFallback : COLORS.surfaceSearchbar,
                    border: `2px solid ${
                      checked ? COLORS.accentFallback : "rgba(255,255,255,.15)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: TRANSITIONS.fast,
                  }}
                >
                  {checked && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={COLORS.white}
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    flexShrink: 0,
                    background: COLORS.surfaceCoverBg,
                  }}
                >
                  <MusicCover
                    thumbnails={song.thumbnails}
                    src={song.thumbnail}
                    displaySize={40}
                    alt=""
                    style={{ width: "38px", height: "38px" }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13.5px",
                      fontWeight: "700",
                      color: checked ? "#c4b5fd" : COLORS.textPlayerTitle,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {song.title}
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: COLORS.progressTime,
                      fontWeight: "600",
                      marginTop: "1px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {song.artist}
                  </div>
                </div>
                {active && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--neon)",
                      fontWeight: "800",
                      flexShrink: 0,
                    }}
                  >
                    ▶
                  </span>
                )}
                <span
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,.15)",
                    fontWeight: "700",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
        {onDelete && (
          <div
            style={{
              padding: "14px 20px 20px",
              borderTop: "1px solid rgba(255,255,255,.07)",
            }}
          >
            <button
              onClick={() => {
                if (selected.size > 0) {
                  onDelete([...selected]);
                  setSelected(new Set());
                }
              }}
              disabled={selected.size === 0}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "16px",
                border: "none",
                background:
                  selected.size > 0 ? withAlpha(COLORS.errorColor, "cc") : COLORS.surfaceCard,
                color: selected.size > 0 ? COLORS.white : COLORS.iconDimmer,
                fontWeight: "800",
                fontSize: "14px",
                cursor: selected.size > 0 ? "pointer" : "default",
                fontFamily: FONT,
                transition: TRANSITIONS.normal,
              }}
            >
              {selected.size > 0
                ? `Eliminar ${selected.size} ${selected.size === 1 ? "canción" : "canciones"}`
                : "Selecciona canciones"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
