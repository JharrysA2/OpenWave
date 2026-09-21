import React, { useState } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { ConfirmModal } from "./ConfirmModal";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS, ANIMATIONS } from "../utils/theme";
import SongRow from "./SongRow";

export default function HistoryView({
  history,
  currentSong,
  accentColor,
  playSong,
  openOptions,
  onHistoryCleared,
  toast,
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleClearHistory = async () => {
    await api.deleteHistory(toast);
    setShowConfirmModal(false);
    if (onHistoryCleared) onHistoryCleared();
  };

  const playAll = (shuffle = false) => {
    if (history.length === 0) return;
    const list = shuffle ? [...history].sort(() => Math.random() - 0.5) : history;
    playSong(list[0], 0, false);
  };

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
      {/* ── Hero Section ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          marginBottom: "24px",
          alignItems: "flex-end",
          ...ANIMATIONS.fadeIn(0),
        }}
      >
        <div
          style={{
            width: "160px",
            height: "160px",
            borderRadius: RADIUS.card,
            overflow: "hidden",
            flexShrink: 0,
            background: `linear-gradient(135deg, ${accentColor}55, ${accentColor}11)`,
            boxShadow: "0 8px 30px rgba(0,0,0,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={accentColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

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
            Actividad
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "800",
              color: COLORS.textPrimary,
              margin: 0,
              letterSpacing: "-.5px",
            }}
          >
            Historial
          </h1>
          <div
            style={{
              fontSize: "13px",
              color: COLORS.textTertiary,
              fontWeight: "600",
              marginTop: "4px",
            }}
          >
            {history.length} reproduccion{history.length !== 1 ? "es" : ""}
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "14px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => playAll(true)}
              disabled={history.length === 0}
              style={{
                ...GLASS.btn,
                borderRadius: RADIUS.pill,
                padding: "9px 18px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: COLORS.textPrimary,
                cursor: history.length === 0 ? "not-allowed" : "pointer",
                opacity: history.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (history.length > 0) {
                  e.currentTarget.style.background = "rgba(255,255,255,.14)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "";
              }}
            >
              {Ic.shuffle(16)}
              Aleatorio
            </button>

            <button
              onClick={() => playAll(false)}
              disabled={history.length === 0}
              style={{
                background: accentColor,
                border: "none",
                borderRadius: RADIUS.pill,
                padding: "9px 20px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "#fff",
                cursor: history.length === 0 ? "not-allowed" : "pointer",
                opacity: history.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (history.length > 0) e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = history.length === 0 ? "0.4" : "1";
              }}
            >
              {Ic.play(16)}
              Reproducir
            </button>

            <button
              onClick={() => history.length > 0 && setShowConfirmModal(true)}
              disabled={history.length === 0}
              style={{
                ...GLASS.btn,
                borderRadius: RADIUS.pill,
                padding: "9px 16px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "rgba(255,255,255,.4)",
                cursor: history.length === 0 ? "not-allowed" : "pointer",
                opacity: history.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (history.length > 0) {
                  e.currentTarget.style.background = "rgba(239,68,68,.15)";
                  e.currentTarget.style.color = "#ef4444";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "";
                e.currentTarget.style.color = "rgba(255,255,255,.4)";
              }}
            >
              {Ic.trash}
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* ── Lista ─────────────────────────────────── */}
      {history.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "rgba(255,255,255,.3)",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          No hay historial aún
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {history.map((song, i) => {
            const isActive = currentSong?.videoId === song.videoId;
            return (
              <SongRow
                key={song.videoId || i}
                song={song}
                isActive={isActive}
                accentColor={accentColor}
                index={i}
                onClick={() => playSong(song)}
                coverSrc={song.thumbnail || song.thumbnails?.[0]?.url}
                subtitle={`${song.artist} · ${song.playCount || 1} reproducción${
                  song.playCount !== 1 ? "es" : ""
                }`}
                onOpenOptions={openOptions}
              />
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={showConfirmModal}
        title="Limpiar historial"
        message="¿Estás seguro de que quieres eliminar todo el historial de reproducción? Esta acción no se puede deshacer."
        confirmLabel="Limpiar"
        onConfirm={handleClearHistory}
        onCancel={() => setShowConfirmModal(false)}
        danger
      />
    </div>
  );
}
