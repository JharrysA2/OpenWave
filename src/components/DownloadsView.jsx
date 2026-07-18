import React, { useState } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { MusicCover } from "./MusicCover";
import { ConfirmModal } from "./ConfirmModal";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  LAYOUTS,
  GLASS,
  withAlpha,
  safeAccentText,
  ANIMATIONS,
} from "../utils/theme";

export function DownloadsView({
  downloads,
  currentSong,
  accentColor,
  playSong,
  openOptions,
  onDownloadsCleared,
  toast,
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleClearDownloads = async () => {
    await api.deleteDownloads(toast);
    setShowConfirmModal(false);
    if (onDownloadsCleared) onDownloadsCleared();
  };

  const playAll = (shuffle = false) => {
    if (downloads.length === 0) return;
    const list = shuffle ? [...downloads].sort(() => Math.random() - 0.5) : downloads;
    const songData = {
      videoId: list[0].videoId || list[0].video_id,
      title: list[0].title,
      artist: list[0].artist,
      thumbnail: list[0].thumbnail,
      thumbnails: list[0].thumbnails,
      duration: list[0].duration,
      downloaded: true,
    };
    playSong(songData, 0, false);
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
            background: `linear-gradient(135deg, ${COLORS.successColor || "#22c55e"}55, ${COLORS.successColor || "#22c55e"}11)`,
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
            stroke={COLORS.successColor || "#22c55e"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
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
            Modo sin conexión
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
            Descargas
          </h1>
          <div
            style={{
              fontSize: "13px",
              color: COLORS.textTertiary,
              fontWeight: "600",
              marginTop: "4px",
            }}
          >
            {downloads.length} canción{downloads.length !== 1 ? "es" : ""} descargada
            {downloads.length !== 1 ? "s" : ""}
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
              disabled={downloads.length === 0}
              style={{
                ...GLASS.btn,
                borderRadius: RADIUS.pill,
                padding: "9px 18px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: COLORS.textPrimary,
                cursor: downloads.length === 0 ? "not-allowed" : "pointer",
                opacity: downloads.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (downloads.length > 0) {
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
              disabled={downloads.length === 0}
              style={{
                background: accentColor,
                border: "none",
                borderRadius: RADIUS.pill,
                padding: "9px 20px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "#fff",
                cursor: downloads.length === 0 ? "not-allowed" : "pointer",
                opacity: downloads.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (downloads.length > 0) e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = downloads.length === 0 ? "0.4" : "1";
              }}
            >
              {Ic.play(16)}
              Reproducir
            </button>

            <button
              onClick={() => downloads.length > 0 && setShowConfirmModal(true)}
              disabled={downloads.length === 0}
              style={{
                ...GLASS.btn,
                borderRadius: RADIUS.pill,
                padding: "9px 16px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "rgba(255,255,255,.4)",
                cursor: downloads.length === 0 ? "not-allowed" : "pointer",
                opacity: downloads.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (downloads.length > 0) {
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
              Eliminar todo
            </button>
          </div>
        </div>
      </div>

      {/* ── Lista ─────────────────────────────────── */}
      {downloads.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "rgba(255,255,255,.3)",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Descarga canciones para escucharlas sin conexión
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {downloads.map((song, i) => {
            const vid = song.videoId || song.video_id;
            const isActive = currentSong?.videoId === vid;
            const songData = {
              videoId: vid,
              title: song.title,
              artist: song.artist,
              thumbnail: song.thumbnail,
              thumbnails: song.thumbnails,
              duration: song.duration,
              downloaded: true,
            };
            return (
              <div
                key={vid || i}
                style={{
                  ...ANIMATIONS.staggerFast(i),
                  ...LAYOUTS.songRow(isActive, accentColor),
                }}
                onClick={() => playSong(songData)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = LAYOUTS.songRowHover.background;
                    e.currentTarget.style.borderColor = LAYOUTS.songRowHover.borderColor;
                    e.currentTarget.style.boxShadow = LAYOUTS.songRowHover.boxShadow;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                <div style={LAYOUTS.listCover}>
                  <MusicCover
                    src={song.thumbnail}
                    displaySize={50}
                    alt=""
                    style={{ width: "40px", height: "40px" }}
                  />
                </div>
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
                    {song.title}
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: COLORS.textTertiary,
                      fontWeight: "600",
                      marginTop: "1px",
                    }}
                  >
                    {song.artist}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "9px",
                    color: COLORS.successColor || "#22c55e",
                    fontWeight: "800",
                    background: withAlpha(COLORS.successColor || "#22c55e", "1a"),
                    borderRadius: RADIUS.pill,
                    padding: "2px 8px",
                    flexShrink: 0,
                    letterSpacing: ".2px",
                  }}
                >
                  OFFLINE
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptions(songData);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: COLORS.iconDefault,
                    display: "flex",
                    padding: "4px",
                  }}
                >
                  {Ic.dots}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={showConfirmModal}
        title="Eliminar descargas"
        message="¿Estás seguro de que quieres eliminar todas las canciones descargadas? Las canciones no estarán disponibles sin conexión."
        confirmLabel="Eliminar todo"
        onConfirm={handleClearDownloads}
        onCancel={() => setShowConfirmModal(false)}
        danger
      />
    </div>
  );
}
