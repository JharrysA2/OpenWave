import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  LAYOUTS,
  GLASS,
  safeAccentText,
  ANIMATIONS,
} from "../utils/theme";

export function LikedView({
  likedSongs,
  currentSong,
  accentColor,
  playSong,
  toggleLike,
  openOptions,
}) {
  const playAll = (shuffle = false) => {
    if (likedSongs.length === 0) return;
    const list = shuffle ? [...likedSongs].sort(() => Math.random() - 0.5) : likedSongs;
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
        {/* Cover gradient placeholder */}
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
          <svg width="48" height="48" viewBox="0 0 256 256" fill={accentColor}>
            <path d="M128 213.16l-9.52-8.66C56 149.06 24 120.48 24 85.6 24 57.14 47.14 34 75.6 34c15.84 0 31.01 7.48 40.4 19.25h24C149.39 41.48 164.56 34 180.4 34 208.86 34 232 57.14 232 85.6c0 34.88-32 63.46-94.48 118.9L128 213.16z" />
          </svg>
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
            Tu biblioteca
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
            Canciones que te gustan
          </h1>
          <div
            style={{
              fontSize: "13px",
              color: COLORS.textTertiary,
              fontWeight: "600",
              marginTop: "4px",
            }}
          >
            {likedSongs.length} canción{likedSongs.length !== 1 ? "es" : ""}
          </div>

          {/* Botones */}
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
              disabled={likedSongs.length === 0}
              style={{
                ...GLASS.btn,
                borderRadius: RADIUS.pill,
                padding: "9px 18px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: COLORS.textPrimary,
                cursor: likedSongs.length === 0 ? "not-allowed" : "pointer",
                opacity: likedSongs.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (likedSongs.length > 0) {
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
              disabled={likedSongs.length === 0}
              style={{
                background: accentColor,
                border: "none",
                borderRadius: RADIUS.pill,
                padding: "9px 20px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "#fff",
                cursor: likedSongs.length === 0 ? "not-allowed" : "pointer",
                opacity: likedSongs.length === 0 ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                if (likedSongs.length > 0) e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = likedSongs.length === 0 ? "0.4" : "1";
              }}
            >
              {Ic.play(16)}
              Reproducir
            </button>
          </div>
        </div>
      </div>

      {/* ── Lista de canciones ────────────────────── */}
      {likedSongs.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "rgba(255,255,255,.3)",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Dale me gusta a canciones para verlas aquí
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {likedSongs.map((song, i) => {
            const isActive = currentSong?.videoId === song.videoId;
            return (
              <div
                key={song.videoId || i}
                style={{
                  ...ANIMATIONS.staggerFast(i),
                  ...LAYOUTS.songRow(isActive, accentColor),
                }}
                onClick={() => playSong(song)}
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
                    thumbnails={song.thumbnails}
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(song.videoId, song);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: COLORS.likeColor,
                    display: "flex",
                    padding: "4px",
                  }}
                >
                  {Ic.heart(true, 16)}
                </button>
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
                  }}
                >
                  {Ic.dots}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
