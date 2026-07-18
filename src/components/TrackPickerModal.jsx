import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS } from "../utils/theme";

export function TrackPickerModal({ open, playlist, tracks, loadingTracks, onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(tracks.map((t) => t.videoId).filter(Boolean)));
  }, [open, tracks]);

  const toggle = (vid) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(vid) ? n.delete(vid) : n.add(vid);
      return n;
    });

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.8)",
        zIndex: 900,
        animation: "sw-fade-in .15s ease both",
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
          borderRadius: RADIUS.card,
          width: "400px",
          maxWidth: "90vw",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 20px 12px",
            display: "flex",
            alignItems: "center",
            gap: SPACING.gap.normal,
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <button
            onClick={onClose}
            title="Cerrar"
            style={{
              background: COLORS.surfaceNav,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: RADIUS.full,
              width: "32px",
              height: "32px",
              cursor: "pointer",
              color: COLORS.winCtrlDefault,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: TRANSITIONS.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.surfaceCardHover;
              e.currentTarget.style.color = COLORS.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.surfaceNav;
              e.currentTarget.style.color = COLORS.winCtrlDefault;
            }}
          >
            {Ic.close}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "15px",
                fontWeight: "900",
                color: COLORS.textPrimary,
                letterSpacing: "-.3px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {playlist?.name}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: COLORS.textMuted,
                fontWeight: "700",
                marginTop: "2px",
              }}
            >
              Elige las canciones a agregar
            </div>
          </div>
          <button
            onClick={() =>
              setSelected((prev) =>
                prev.size === tracks.length
                  ? new Set()
                  : new Set(tracks.map((t) => t.videoId).filter(Boolean)),
              )
            }
            style={{
              background: COLORS.surfaceNav,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: RADIUS.full,
              cursor: "pointer",
              color: COLORS.winCtrlDefault,
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "800",
              flexShrink: 0,
              fontFamily: FONT,
              transition: TRANSITIONS.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.surfaceCardHover;
              e.currentTarget.style.color = COLORS.textPrimary;
              e.currentTarget.style.borderColor = COLORS.borderActive;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.surfaceNav;
              e.currentTarget.style.color = COLORS.winCtrlDefault;
              e.currentTarget.style.borderColor = COLORS.borderLight;
            }}
          >
            {selected.size === tracks.length ? "Ninguna" : "Todas"}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
          {loadingTracks && (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: COLORS.textMuted,
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              Cargando canciones...
            </div>
          )}
          {!loadingTracks &&
            tracks.map((t, i) => {
              const checked = selected.has(t.videoId);
              return (
                <div
                  key={(t.videoId || "") + i}
                  onClick={() => toggle(t.videoId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.gap.normal,
                    padding: "9px 10px",
                    borderRadius: RADIUS.default,
                    cursor: "pointer",
                    background: checked ? "var(--neon-18)" : "transparent",
                    transition: TRANSITIONS.fast,
                  }}
                  onMouseEnter={(e) => {
                    if (!checked) e.currentTarget.style.background = COLORS.surfaceNav;
                  }}
                  onMouseLeave={(e) => {
                    if (!checked) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "6px",
                      flexShrink: 0,
                      background: checked ? "var(--neon)" : COLORS.surfaceSearchbar,
                      border: `2px solid ${checked ? "var(--neon)" : COLORS.borderLight}`,
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
                        stroke={COLORS.black}
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
                      thumbnails={t.thumbnails}
                      src={t.thumbnail}
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
                        color: checked ? "var(--neon)" : COLORS.textPlayerTitle,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title}
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
                      {t.artist}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: COLORS.iconDimmer,
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
        <div style={{ padding: "14px 20px 20px", borderTop: `1px solid ${COLORS.borderSubtle}` }}>
          <button
            onClick={() => {
              if (selected.size > 0) onConfirm([...selected]);
            }}
            disabled={selected.size === 0}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: RADIUS.cover,
              border: "none",
              background:
                selected.size > 0
                  ? `color-mix(in srgb, var(--neon) 90%, ${COLORS.black})`
                  : COLORS.surfaceCard,
              color: selected.size > 0 ? COLORS.white : COLORS.iconDimmer,
              fontWeight: "800",
              fontSize: "14px",
              cursor: selected.size > 0 ? "pointer" : "default",
              fontFamily: FONT,
              boxShadow: selected.size > 0 ? "0 4px 16px var(--neon)" : "none",
              transition: TRANSITIONS.normal,
            }}
            onMouseEnter={(e) => {
              if (selected.size > 0) {
                e.currentTarget.style.transform = "scale(1.01)";
                e.currentTarget.style.boxShadow = "0 6px 24px var(--neon)";
              }
            }}
            onMouseLeave={(e) => {
              if (selected.size > 0) {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 16px var(--neon)";
              }
            }}
          >
            {selected.size > 0
              ? `Agregar ${selected.size} ${selected.size !== 1 ? "canciones" : "canción"}`
              : "Selecciona canciones"}
          </button>
        </div>
      </div>
    </div>
  );
}
