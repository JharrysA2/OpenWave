import React, { useState } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS, LAYOUTS, ANIMATIONS } from "../utils/theme";
import LibraryTabs from "./LibraryTabs";
import TrackList from "./TrackList";
import { AlbumGridCard, ArtistGridCard } from "./LibraryCard";

const EMPTY_STYLE = {
  padding: "60px 20px",
  textAlign: "center",
  color: "rgba(255,255,255,.3)",
  fontSize: "14px",
  fontWeight: "600",
};

export default function LikedView({
  likedSongs,
  currentSong,
  accentColor,
  playSong,
  toggleLike,
  openOptions,
  liked = null,
  likedAlbums = [],
  followedArtists = [],
  openEntityOptions,
  playAlbum,
  goToAlbum,
  goToArtist,
}) {
  const [tab, setTab] = useState("songs");
  // Hover declarativo del hero: "shuffle" | "play" (null = ninguno).
  const [heroHover, setHeroHover] = useState(null);

  const playAll = (shuffle = false) => {
    if (likedSongs.length === 0) return;
    const list = shuffle ? [...likedSongs].sort(() => Math.random() - 0.5) : likedSongs;
    playSong(list[0], 0, false, list);
  };

  const heroButton = (primary = false, hovered = false) => ({
    ...(primary
      ? { background: accentColor, border: "none", ...(hovered ? { filter: "brightness(1.1)" } : {}) }
      : { ...GLASS.btn, ...(hovered ? GLASS.btnHoverSoft : {}) }),
    borderRadius: RADIUS.pill,
    padding: primary ? "9px 20px" : "9px 18px",
    fontSize: "12.5px",
    fontWeight: "700",
    color: primary ? "#fff" : COLORS.textPrimary,
    cursor: likedSongs.length === 0 ? "not-allowed" : "pointer",
    opacity: likedSongs.length === 0 ? 0.4 : 1,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: TRANSITIONS.fast,
  });

  const heroHoverProps = (key) => ({
    onMouseEnter: () => setHeroHover(key),
    onMouseLeave: () => setHeroHover((k) => (k === key ? null : k)),
  });

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
            Me gusta
          </h1>
          <div
            data-testid="library-summary"
            style={{
              fontSize: "13px",
              color: COLORS.textTertiary,
              fontWeight: "600",
              marginTop: "4px",
            }}
          >
            {likedSongs.length} {likedSongs.length === 1 ? "canción" : "canciones"} ·{" "}
            {likedAlbums.length} álbum{likedAlbums.length !== 1 ? "es" : ""} ·{" "}
            {followedArtists.length} artista{followedArtists.length !== 1 ? "s" : ""}
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
              style={heroButton(false, heroHover === "shuffle")}
              {...heroHoverProps("shuffle")}
            >
              {Ic.shuffle(16)}
              Aleatorio
            </button>

            <button
              onClick={() => playAll(false)}
              disabled={likedSongs.length === 0}
              style={heroButton(true, heroHover === "play")}
              {...heroHoverProps("play")}
            >
              {Ic.play(16)}
              Reproducir
            </button>
          </div>
        </div>
      </div>

      {/* ── Pestañas: Canciones / Álbumes / Artistas ────────── */}
      <LibraryTabs
        accentColor={accentColor}
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "songs", label: "Canciones", count: likedSongs.length },
          { key: "albums", label: "Álbumes", count: likedAlbums.length },
          { key: "artists", label: "Artistas", count: followedArtists.length },
        ]}
      />

      {/* ── Contenido por pestaña ────────────────── */}
      {tab === "songs" &&
        (likedSongs.length === 0 ? (
          <div style={EMPTY_STYLE}>Dale me gusta a canciones para verlas aquí</div>
        ) : (
          <TrackList
            songs={likedSongs}
            currentSong={currentSong}
            accentColor={accentColor}
            onPlay={(song) => playSong(song, 0, false, likedSongs)}
            openOptions={openOptions}
            liked={liked}
            onToggleLike={toggleLike}
          />
        ))}

      {tab === "albums" &&
        (likedAlbums.length === 0 ? (
          <div style={EMPTY_STYLE}>
            Dale me gusta a álbumes con el botón ♥ de su menú ⋮ para verlos aquí
          </div>
        ) : (
          <div style={LAYOUTS.cardGrid}>
            {likedAlbums.map((album, i) => (
              <AlbumGridCard
                key={album.browseId || i}
                album={album}
                accentColor={accentColor}
                subtitle={[album.artist, album.type].filter(Boolean).join(" · ")}
                animationDelay={i * 40}
                onClick={() => goToAlbum?.(album.browseId)}
                onPlay={() => playAlbum?.(album, false)}
                onOptions={() => openEntityOptions?.("album", album)}
              />
            ))}
          </div>
        ))}

      {tab === "artists" &&
        (followedArtists.length === 0 ? (
          <div style={EMPTY_STYLE}>
            Sigue artistas desde su página con el botón "Seguir" para verlos aquí
          </div>
        ) : (
          <div style={LAYOUTS.cardGrid}>
            {followedArtists.map((artist, i) => (
              <ArtistGridCard
                key={artist.browseId || artist.name || i}
                artist={artist}
                subtitle="Artista"
                animationDelay={i * 40}
                onClick={() => goToArtist?.(artist.browseId || artist.name)}
                onOptions={() => openEntityOptions?.("artist", artist)}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
