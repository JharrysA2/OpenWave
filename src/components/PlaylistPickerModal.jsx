import React from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS } from "../utils/theme";
import { api } from "../utils/api";
import { Ic } from "../icons/Icons";

export function PlaylistPickerModal({ open, playlists, song, songs, toast, refreshPlaylists, onClose }) {
  if (!open) return null;

  // Una canción (song) o varias (songs, p.ej. las pistas de un álbum)
  const list = Array.isArray(songs) && songs.length > 0 ? songs : song ? [song] : [];

  const addToPlaylist = (pl) => {
    if (list.length === 0) return;
    api
      .post(`/playlists/${pl.id}/songs`, {
        videoIds: list.map((s) => s.videoId),
        songs: list.map((s) => ({
          videoId: s.videoId,
          title: s.title || "",
          artist: s.artist || "",
          thumbnail: s.thumbnail || "",
          thumbnails: s.thumbnails || [],
          duration: s.duration || 0,
        })),
      })
      .then(async () => {
        toast(
          list.length > 1
            ? `${list.length} canciones agregadas a "${pl.name}"`
            : `Agregada a "${pl.name}"`,
          "success",
        );
        onClose();
        // Refresh playlists to update song count in sidebar
        await refreshPlaylists();
      })
      .catch(() => {
        toast("Error al agregar", "error");
        onClose();
      });
  };

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
          width: "340px",
          maxWidth: "90vw",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
        }}
      >
        {/* Header con botón cerrar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px 12px",
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <span
            style={{
              fontSize: "15px",
              fontWeight: "900",
              color: COLORS.textPrimary,
              letterSpacing: "-.3px",
            }}
          >
            Agregar a playlist
          </span>
          <button
            onClick={onClose}
            style={{
              ...GLASS.btn,
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
        </div>

        {/* Lista de playlists */}
        <div style={{ overflowY: "auto", padding: "6px 10px" }}>
          {playlists.length === 0 && (
            <div
              style={{
                padding: "30px",
                textAlign: "center",
                color: COLORS.textMuted,
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              No hay playlists
            </div>
          )}
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => addToPlaylist(pl)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: SPACING.gap.normal,
                padding: "11px 14px",
                borderRadius: RADIUS.default,
                cursor: "pointer",
                transition: TRANSITIONS.fast,
                color: COLORS.textPlayerTitle,
                fontWeight: "700",
                fontSize: "14px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceNav)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              {pl.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
