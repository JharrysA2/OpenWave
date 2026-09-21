import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { api } from "../utils/api";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { fmtTime } from "../utils/formatTime";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  TYPOGRAPHY,
  withAlpha,
  LAYOUTS,
  ANIMATIONS,
  GLASS,
  safeAccentText,
} from "../utils/theme";
import { SkeletonArtistView } from "./SkeletonLoader";
import AlbumCardRow from "./AlbumCardRow";
import ArtistCardPill from "./ArtistCardPill";

export default function ArtistView({
  browseId,
  accentColor,
  currentSong,
  playSong,
  toggleLike,
  liked,
  openOptions,
  onGoToAlbum,
  onGoToRelatedArtist,
  onBack,
}) {
  const [artist, setArtist] = useState(null);
  const [relatedArtists, setRelatedArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllSongs, setShowAllSongs] = useState(false);

  useEffect(() => {
    if (!browseId) return;
    setLoading(true);
    setArtist(null);
    setShowAllSongs(false);
    api
      .get(`/artist/${encodeURIComponent(browseId)}`)
      .then((d) => {
        setArtist(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    api
      .get(`/artist/related/${encodeURIComponent(browseId)}`)
      .then((d) => setRelatedArtists(d?.results || []))
      .catch(() => {});
  }, [browseId]);

  if (loading) {
    return <SkeletonArtistView />;
  }

  if (!artist) {
    return (
      <div
        style={{
          padding: SPACING.content.pad,
          fontFamily: FONT,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <div style={{ fontSize: "14px", fontWeight: "600", color: COLORS.textMuted }}>
          No se pudo cargar el artista
        </div>
        <button
          onClick={onBack}
          style={{
            padding: "8px 18px",
            borderRadius: RADIUS.pill,
            border: "none",
            background: accentColor,
            color: COLORS.black,
            fontWeight: "800",
            fontSize: "12px",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  const displaySongs = showAllSongs ? artist.songs : artist.songs?.slice(0, 5);
  const allAlbums = [...(artist.albums || []), ...(artist.singles || [])];

  return (
    <div
      style={{
        fontFamily: FONT,
        height: "100%",
        overflowY: "auto",
        position: "relative",
        paddingBottom: "90px",
      }}
    >
      {/* ── Hero: Banner con foto artista blur + circular overlappeando ─ */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "240px",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Foto del artista como fondo del banner — más dramático */}
        {artist.thumbnail && (
          <img
            src={artist.thumbnail}
            alt=""
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(12px) saturate(1.2) brightness(0.6)",
              transform: "scale(1.3)",
            }}
          />
        )}
        {/* Gradiente base oscuro */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.1) 40%, rgba(0,0,0,.85) 100%)`,
          }}
        />
        {/* Gradiente de acento sutil */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 30% 30%, ${withAlpha(accentColor, "18")} 0%, transparent 60%)`,
          }}
        />
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            top: "14px",
            left: "14px",
            zIndex: 2,
            width: "34px",
            height: "34px",
            borderRadius: RADIUS.full,
            ...GLASS.btn,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .15s cubic-bezier(.16,1,.3,1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = GLASS.btnHover.background;
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = GLASS.btn.background;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <svg
            width="18"
            height="18"
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
      </div>

      {/* ── Foto circular overlappea entre banner y contenido ─────────── */}
      <div
        style={{
          position: "relative",
          padding: "0 22px",
          marginTop: "-65px",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-end" }}>
          {/* Circular photo con borde de acento y sombra profunda */}
          <div
            style={{
              width: "125px",
              height: "125px",
              borderRadius: RADIUS.full,
              overflow: "hidden",
              flexShrink: 0,
              boxShadow: `0 0 0 3px ${withAlpha(accentColor, "40")}, 0 12px 40px rgba(0,0,0,.6)`,
            }}
          >
            <MusicCover
              thumbnails={artist.thumbnails}
              src={artist.thumbnail}
              displaySize={140}
              alt={artist.name}
              style={{ width: "125px", height: "125px" }}
            />
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "8px" }}>
            <h1
              style={{
                fontSize: "26px",
                fontWeight: "800",
                color: "#fff",
                letterSpacing: "-.3px",
                marginBottom: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
            >
              {artist.name}
            </h1>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              {artist.subscribers && (
                <span style={{ fontSize: "13px", fontWeight: "600", color: COLORS.textSecondary }}>
                  {artist.subscribers} suscriptores
                </span>
              )}
              {artist.views && (
                <span style={{ fontSize: "13px", fontWeight: "500", color: COLORS.textTertiary }}>
                  · {artist.views} vistas
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido debajo ─────────────────────────────────────────── */}
      <div style={{ padding: "12px 16px 100px" }}>
        {/* Top canciones */}
        {artist.songs?.length > 0 && (
          <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
            <h3
              style={{
                ...TYPOGRAPHY.h3,
                color: COLORS.iconActive,
                marginBottom: SPACING.gap.wide,
                padding: "0 8px",
              }}
            >
              Canciones populares
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {displaySongs.map((song, i) => {
                const isActive = currentSong?.videoId === song.videoId;
                return (
                  <div
                    key={song.videoId || i}
                    onClick={() => playSong(song)}
                    style={{
                      ...ANIMATIONS.fadeSlideUp(100 + i * 30),
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 10px",
                      borderRadius: RADIUS.default,
                      cursor: "pointer",
                      background: isActive ? withAlpha(accentColor, "1a") : "transparent",
                      transition: TRANSITIONS.fast,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = COLORS.surfaceNav;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        minWidth: "22px",
                        textAlign: "center",
                        fontSize: "12px",
                        fontWeight: "700",
                        color: isActive ? safeAccentText(accentColor) : COLORS.textMuted,
                      }}
                    >
                      {isActive ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill={safeAccentText(accentColor)}
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "6px",
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
                      {song.album && (
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
                          {song.album}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(song.videoId);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: liked?.has(song.videoId) ? COLORS.likeColor : COLORS.iconDimmer,
                        display: "flex",
                        padding: "4px",
                        transition: TRANSITIONS.fast,
                      }}
                    >
                      {Ic.heart(liked?.has(song.videoId), 15)}
                    </button>
                    {song.duration > 0 && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: COLORS.textMuted,
                          flexShrink: 0,
                        }}
                      >
                        {fmtTime(song.duration)}
                      </span>
                    )}
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
            {artist.songs?.length > 5 && (
              <button
                onClick={() => setShowAllSongs(!showAllSongs)}
                style={{
                  width: "100%",
                  padding: "10px",
                  marginTop: "4px",
                  borderRadius: RADIUS.default,
                  border: "none",
                  background: "transparent",
                  color: safeAccentText(accentColor),
                  fontWeight: "700",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  transition: TRANSITIONS.fast,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceNav)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {showAllSongs
                  ? "Mostrar menos"
                  : `Mostrar más (${artist.songs.length - 5} restantes)`}
              </button>
            )}
          </div>
        )}

        {/* Álbumes */}
        {allAlbums.length > 0 && (
          <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
            <h3
              style={{
                ...TYPOGRAPHY.h3,
                color: COLORS.iconActive,
                marginBottom: SPACING.gap.wide,
                padding: "0 8px",
              }}
            >
              Álbumes
            </h3>
            <div style={LAYOUTS.horizontalScroll}>
              {allAlbums.map((a, i) => (
                <AlbumCardRow
                  key={a.browseId || i}
                  album={a}
                  minWidth="140px"
                  animationDelay={200 + i * 40}
                  subtitle={`${a.type}${a.year ? ` · ${a.year}` : ""}`}
                  onClick={() => onGoToAlbum && onGoToAlbum(a)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Artistas relacionados */}
        {relatedArtists.length > 0 && (
          <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
            <h3
              style={{
                ...TYPOGRAPHY.h3,
                color: COLORS.iconActive,
                marginBottom: SPACING.gap.wide,
                padding: "0 8px",
              }}
            >
              Artistas relacionados
            </h3>
            <div style={LAYOUTS.horizontalScroll}>
              {relatedArtists.map((a, i) => (
                <ArtistCardPill
                  key={a.browseId || i}
                  artist={a}
                  animationDelay={300 + i * 50}
                  leaveBackground={GLASS.card.background}
                  leaveBorder={GLASS.card.borderColor}
                  onClick={() => {
                    if (onGoToRelatedArtist) onGoToRelatedArtist(a.browseId);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {!artist.songs?.length && !allAlbums.length && !relatedArtists.length && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: COLORS.textMuted,
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            No hay contenido disponible para este artista
          </div>
        )}
      </div>
    </div>
  );
}
