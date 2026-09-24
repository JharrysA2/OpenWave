import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { fmtTime } from "../utils/formatTime";
import {
  COLORS,
  RADIUS,
  SPACING,
  TYPOGRAPHY,
  LAYOUTS,
  withAlpha,
  ANIMATIONS,
  GLASS,
  safeAccentText,
} from "../utils/theme";
import { SkeletonGrid, SkeletonSongRow } from "./SkeletonLoader";
import { SearchBar } from "./SearchBar";

/** Devuelve un saludo según la hora del día */
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

/** Devuelve un icono según la hora del día */
const getGreetingIcon = () => {
  const h = new Date().getHours();
  if (h < 6) return Ic.moon(22);
  if (h < 12) return Ic.sun(22);
  if (h < 19) return Ic.cloud(22);
  return Ic.moon(22);
};

export default function HomeView({
  currentSong,
  isPlaying: isActuallyPlaying,
  playSong,
  history,
  accentColor = "#a78bfa",
  onSearch,
  openOptions,
}) {
  // Quick picks from history
  const quickPicks = history.slice(0, 6);

  // For-you mixed (if there's a section)
  const forYou = history.slice(0, 12);

  // ── Search bar state ────────────────────────────────────────────────────────
  const [searchValue, setSearchValue] = React.useState("");
  const searchInputRef = React.useRef(null);

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
      {/* ── Hero: Saludo + Search — la personalidad de la página ─────────── */}
      <div
        style={{
          marginBottom: SPACING.section.marginBottom,
          paddingTop: "8px",
        }}
      >
        {/* Greeting — la primera cosa que ve el usuario */}
        <div
          style={{
            ...ANIMATIONS.fadeSlideUp(0),
            marginBottom: SPACING.gap.xwide,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: COLORS.textTertiary,
              marginBottom: "4px",
              letterSpacing: ".3px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {getGreetingIcon()} {getGreeting()}
            </span>
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "800",
              color: COLORS.textPrimary,
              letterSpacing: "-.5px",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {quickPicks.length > 0 ? "¿Qué quieres escuchar?" : "Descubre tu sonido"}
          </h1>
        </div>

        {/* Search bar — glassmorphism */}
        <SearchBar
          value={searchValue}
          onChange={setSearchValue}
          onSearch={(v) => {
            const trimmed = v.trim();
            if (trimmed) onSearch(trimmed);
          }}
          inputRef={searchInputRef}
          placeholder="Buscar canciones, artistas, álbumes…"
          accentColor={accentColor}
          glowOnFocus
          clearCircle
          height="44px"
          padding="0 16px"
          borderRadius="14px"
          containerStyle={{ ...ANIMATIONS.fadeSlideUp(60) }}
        />
      </div>

      {/* Skeleton loading state — shows when no data yet */}
      {quickPicks.length === 0 && (
        <div style={{ ...ANIMATIONS.fadeIn(100) }}>
          <div style={{ ...ANIMATIONS.fadeSlideUp(120), marginBottom: SPACING.gap.wide }}>
            <div
              className="skeleton"
              style={{ width: "100px", height: "14px", borderRadius: "6px" }}
            />
          </div>
          <SkeletonGrid count={6} />
          <div style={{ marginTop: SPACING.section.marginBottom }}>
            <div
              className="skeleton"
              style={{ width: "80px", height: "14px", borderRadius: "6px", marginBottom: "12px" }}
            />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonSongRow key={i} />
            ))}
          </div>
        </div>
      )}

      {quickPicks.length > 0 && (
        <>
          <div
            style={{
              ...ANIMATIONS.fadeSlideUp(120),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.gap.wide,
            }}
          >
            <h3
              style={{
                ...TYPOGRAPHY.h3,
                color: COLORS.iconActive,
                margin: 0,
              }}
            >
              Recientes
            </h3>
          </div>
          <div
            style={{
              ...LAYOUTS.cardGrid,
              marginBottom: SPACING.section.marginBottom,
            }}
          >
            {quickPicks.map((song, i) => {
              const isPlaying = currentSong?.videoId === song.videoId;
              return (
                <div
                  key={song.videoId || i}
                  onClick={() => playSong(song)}
                  style={{
                    ...ANIMATIONS.fadeSlideUp(160 + i * 50),
                    ...GLASS.card,
                    background: isPlaying
                      ? `linear-gradient(135deg, ${withAlpha(accentColor, "18")}, ${withAlpha(accentColor, "08")})`
                      : GLASS.card.background,
                    borderRadius: RADIUS.card,
                    cursor: "pointer",
                    transition: "all .2s cubic-bezier(.16,1,.3,1)",
                    border: isPlaying
                      ? `1.5px solid ${withAlpha(accentColor, "44")}`
                      : GLASS.card.border,
                    boxShadow: isPlaying
                      ? `0 0 16px ${withAlpha(accentColor, "33")}, inset 0 1px 0 rgba(255,255,255,.06)`
                      : "none",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isPlaying
                      ? `linear-gradient(135deg, ${withAlpha(accentColor, "22")}, ${withAlpha(accentColor, "10")})`
                      : GLASS.cardHover.background;
                    e.currentTarget.style.transform = "translateY(-3px)";
                    e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.06)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isPlaying
                      ? `linear-gradient(135deg, ${withAlpha(accentColor, "18")}, ${withAlpha(accentColor, "08")})`
                      : GLASS.card.background;
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Cover con overlay sutil de gradiente en la parte inferior */}
                  <div
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: `${RADIUS.card}px ${RADIUS.card}px 0 0`,
                    }}
                  >
                    <MusicCover
                      thumbnails={song.thumbnails}
                      src={song.thumbnail}
                      displaySize={200}
                      alt={song.title}
                      style={{ width: "100%", aspectRatio: "1" }}
                    />
                    {/* Gradiente sutil en la parte inferior del cover */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: "40%",
                        background: "linear-gradient(to top, rgba(0,0,0,.5), transparent)",
                        pointerEvents: "none",
                      }}
                    />
                    {/* Indicador de reproducción en esquina inferior derecha */}
                    {isPlaying && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "8px",
                          right: "8px",
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: accentColor,
                          // Icono del pulso: primer plano dinámico sobre el acento
                          color: "var(--neon-fg)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: `0 0 12px ${accentColor}88`,
                          animation: "pulse 1.5s ease infinite",
                        }}
                        data-testid="now-playing-pulse"
                      >
                        {isActuallyPlaying ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 3-dot menu — outside overflow container */}
                  {openOptions && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openOptions(song);
                      }}
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        background: "rgba(0,0,0,.5)",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255,255,255,.8)",
                        opacity: 0,
                        transition: "opacity .15s",
                        zIndex: 10,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0";
                      }}
                    >
                      {Ic.dots}
                    </button>
                  )}
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isPlaying ? safeAccentText(accentColor) : COLORS.textPrimary,
                        lineHeight: 1.3,
                      }}
                    >
                      {song.title}
                    </div>
                    <div
                      style={{
                        fontSize: "11.5px",
                        color: COLORS.textTertiary,
                        fontWeight: "500",
                        marginTop: "3px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {song.artist}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {forYou.length > 0 && (
        <>
          <div
            style={{
              ...ANIMATIONS.fadeSlideUp(350),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.gap.wide,
            }}
          >
            <h3
              style={{
                ...TYPOGRAPHY.h3,
                color: COLORS.iconActive,
                margin: 0,
              }}
            >
              Para ti
            </h3>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {forYou.map((song, i) => {
              const isPlaying = currentSong?.videoId === song.videoId;
              return (
                <div
                  key={song.videoId || i}
                  onClick={() => playSong(song)}
                  style={{
                    ...ANIMATIONS.fadeSlideUp(400 + i * 35),
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "8px 12px",
                    borderRadius: RADIUS.default,
                    cursor: "pointer",
                    background: isPlaying
                      ? `linear-gradient(90deg, ${withAlpha(accentColor, "15")}, transparent)`
                      : "transparent",
                    transition: "all .15s cubic-bezier(.16,1,.3,1)",
                    borderLeft: isPlaying ? `2px solid ${accentColor}` : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isPlaying) {
                      e.currentTarget.style.background = COLORS.surfaceNav;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isPlaying) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {/* Número de orden — más sutil, estilo playlist */}
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: isPlaying ? safeAccentText(accentColor) : COLORS.textDimmest,
                      minWidth: "20px",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {isPlaying ? (
                      isActuallyPlaying ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill={safeAccentText(accentColor)}
                          style={{ verticalAlign: "middle" }}
                        >
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill={safeAccentText(accentColor)}
                          style={{ verticalAlign: "middle" }}
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )
                    ) : (
                      i + 1
                    )}
                  </span>
                  {/* Cover con bordes más suaves */}
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      flexShrink: 0,
                      background: COLORS.surfaceCoverBg,
                    }}
                  >
                    <MusicCover
                      thumbnails={song.thumbnails}
                      src={song.thumbnail}
                      displaySize={50}
                      alt=""
                      style={{ width: "42px", height: "42px" }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13.5px",
                        fontWeight: "600",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isPlaying ? safeAccentText(accentColor) : COLORS.textPrimary,
                        lineHeight: 1.3,
                      }}
                    >
                      {song.title}
                    </div>
                    <div
                      style={{
                        fontSize: "11.5px",
                        color: COLORS.textTertiary,
                        fontWeight: "500",
                        marginTop: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {song.artist}
                    </div>
                  </div>
                  {song.duration > 0 && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: COLORS.textMuted,
                        flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtTime(song.duration)}
                    </span>
                  )}
                  {openOptions && (
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
                        transition: "all .15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = accentColor;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = COLORS.iconDefault;
                      }}
                    >
                      {Ic.dots}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {quickPicks.length === 0 && forYou.length === 0 && (
        <div
          style={{
            ...ANIMATIONS.fadeIn(200),
            padding: "80px 20px",
            textAlign: "center",
          }}
        >
          {/* Icono con glow sutil del accent color */}
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${withAlpha(accentColor, "15")}, ${withAlpha(accentColor, "05")})`,
              border: `1px solid ${withAlpha(accentColor, "15")}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={safeAccentText(accentColor)}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.7 }}
            >
              <path d="M9 18 C9 19.66 7.66 21 6 21 C4.34 21 3 19.66 3 18 C3 16.34 4.34 15 6 15 C7.66 15 9 16.34 9 18 Z" />
              <path d="M21 16 C21 17.66 19.66 19 18 19 C16.34 19 15 17.66 15 16 C15 14.34 16.34 13 18 13 C19.66 13 21 14.34 21 16 Z" />
              <path d="M9 18 L9 5 L21 3 L21 16" />
            </svg>
          </div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: COLORS.textSecondary,
              marginBottom: "8px",
            }}
          >
            Busca tu primera canción
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "500",
              color: COLORS.textMuted,
              lineHeight: 1.5,
              maxWidth: "280px",
              margin: "0 auto",
            }}
          >
            Encuentra cualquier canción, artista o álbum y comienza a disfrutar
          </div>
        </div>
      )}
    </div>
  );
}
