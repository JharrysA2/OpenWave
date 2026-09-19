import React from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, GLASS, TRANSITIONS } from "../utils/theme";

/**
 * Modal "Mover/Transferir a playlist" — extraído de PlaylistView/AlbumView.
 * `playlists` es la lista (ya filtrada por el caller) y `onSelect(id)` la
 * acción de transferencia.
 */
export function TransferModal({ open, onClose, title, emptyMessage, playlists = [], onSelect }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000010,
        background: "rgba(0,0,0,.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "sw-fade-in .15s ease both",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          borderRadius: RADIUS.card,
          width: "380px",
          maxWidth: "90vw",
          maxHeight: "70vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
          animation: "sw-fade-slide-up .2s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <span
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: COLORS.textPrimary,
              fontFamily: FONT,
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              ...GLASS.btn,
              borderRadius: RADIUS.full,
              width: "30px",
              height: "30px",
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
              e.currentTarget.style.background = "";
              e.currentTarget.style.color = COLORS.winCtrlDefault;
            }}
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
        </div>

        {/* Playlist list */}
        <div style={{ padding: "8px 0" }}>
          {playlists.length === 0 ? (
            <div
              style={{
                padding: "24px 20px",
                textAlign: "center",
                color: COLORS.textTertiary,
                fontSize: "13px",
                fontWeight: "500",
                fontFamily: FONT,
              }}
            >
              {emptyMessage}
            </div>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => onSelect(pl.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 20px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: FONT,
                  textAlign: "left",
                  transition: TRANSITIONS.fast,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                {/* Playlist color dot or icon */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    flexShrink: 0,
                    background: pl.color
                      ? `linear-gradient(135deg, ${pl.color}55, ${pl.color}11)`
                      : "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={pl.color || "rgba(255,255,255,.3)"}
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13.5px",
                      fontWeight: "600",
                      color: COLORS.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pl.name}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: COLORS.textTertiary,
                      fontWeight: "500",
                      marginTop: "1px",
                    }}
                  >
                    {pl.song_count || 0} canciones
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
