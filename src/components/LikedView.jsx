import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS, LAYOUTS, ANIMATIONS } from "../utils/theme";
import LibraryTabs from "./LibraryTabs";
import TrackList from "./TrackList";
import { AlbumGridCard, ArtistGridCard } from "./LibraryCard";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { TransferModal } from "./TransferModal";
import { LibrarySelectActions } from "./LibrarySelectActions";

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
  playlists = [],
  refreshPlaylists,
  toast,
  fetchAlbumTracks,
}) {
  const [tab, setTab] = useState("songs");
  // Hover declarativo del hero: "shuffle" | "play" (null = ninguno).
  const [heroHover, setHeroHover] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // ── Selección múltiple (solo pestaña Canciones, estilo PlaylistView) ──
  const {
    selectMode,
    selected,
    count: selectedCount,
    toggleSelect,
    toggleSelectMode,
    resetSelect,
  } = useMultiSelect();

  // La selección no atraviesa pestañas: se descarta al cambiar.
  useEffect(() => {
    resetSelect();
  }, [tab, resetSelect]);

  // ── Reproducción por pestaña ─────────────────────────────────────
  // Canciones: Reproducir = primera canción, Aleatorio = cola barajada.
  // Álbumes: Reproducir = pistas del PRIMER álbum; Aleatorio = mezcla de
  // TODOS los álbumes (carga las pistas al vuelo, 1 petición por álbum).
  const playAll = (shuffle = false) => {
    if (likedSongs.length === 0) return;
    const list = shuffle ? [...likedSongs].sort(() => Math.random() - 0.5) : likedSongs;
    playSong(list[0], 0, false, list);
  };

  const playFirstAlbum = () => {
    if (likedAlbums.length === 0) return;
    playAlbum?.(likedAlbums[0], false);
  };

  const shuffleAllAlbums = async () => {
    if (likedAlbums.length === 0) return;
    if (!fetchAlbumTracks) {
      // Sin cargador de pistas disponible: barajar al menos el primer álbum
      playAlbum?.(likedAlbums[0], true);
      return;
    }
    const lists = await Promise.all(likedAlbums.map((a) => fetchAlbumTracks(a)));
    const all = lists.flat().filter((t) => t?.videoId);
    if (all.length === 0) {
      toast?.("No se pudieron cargar las canciones", "error");
      return;
    }
    const list = [...all].sort(() => Math.random() - 0.5);
    playSong(list[0], 0, false, list);
  };

  // Deshabilitar según la lista de la pestaña ACTIVA
  const playEmpty = tab === "albums" ? likedAlbums.length === 0 : likedSongs.length === 0;

  const handlePlay = () => {
    if (playEmpty) return;
    if (tab === "albums") playFirstAlbum();
    else playAll(false);
  };

  const handleShuffle = () => {
    if (playEmpty) return;
    if (tab === "albums") shuffleAllAlbums();
    else playAll(true);
  };

  // ── Acciones sobre la selección ──────────────────────────────────
  const handleRemoveSelected = () => {
    if (selected.size === 0) return;
    // Los "me gusta" viven en localStorage: quitarlos es inmediato y reversible
    for (const videoId of selected) toggleLike?.(videoId);
    resetSelect();
  };

  const handleTransferSelected = async (targetPlaylistId) => {
    const songsToMove = likedSongs.filter((s) => selected.has(s.videoId));
    if (songsToMove.length === 0) return;
    await api.addToPlaylist(targetPlaylistId, songsToMove, toast);
    toast?.(
      `${songsToMove.length} ${songsToMove.length === 1 ? "canción" : "canciones"} transferida${
        songsToMove.length !== 1 ? "s" : ""
      }`,
      "success",
    );
    setShowTransferModal(false);
    resetSelect();
    if (refreshPlaylists) await refreshPlaylists();
  };

  const heroButton = (primary = false, hovered = false, disabled = false) => ({
    ...(primary
      ? { background: accentColor, border: "none", ...(hovered ? { filter: "brightness(1.1)" } : {}) }
      : { ...GLASS.btn, ...(hovered ? GLASS.btnHoverSoft : {}) }),
    borderRadius: RADIUS.pill,
    padding: primary ? "9px 20px" : "9px 18px",
    fontSize: "12.5px",
    fontWeight: "700",
    color: primary ? "#fff" : COLORS.textPrimary,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
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

          {/* Botones — solo en Canciones/Álbumes (no en Artistas) */}
          {tab !== "artists" && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "14px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                data-testid="hero-shuffle"
                onClick={handleShuffle}
                disabled={playEmpty}
                style={heroButton(false, heroHover === "shuffle", playEmpty)}
                {...heroHoverProps("shuffle")}
              >
                {Ic.shuffle(16)}
                Aleatorio
              </button>

              <button
                data-testid="hero-play"
                onClick={handlePlay}
                disabled={playEmpty}
                style={heroButton(true, heroHover === "play", playEmpty)}
                {...heroHoverProps("play")}
              >
                {Ic.play(16)}
                Reproducir
              </button>

              {tab === "songs" && (
                <LibrarySelectActions
                  accentColor={accentColor}
                  enabled={likedSongs.length > 0}
                  selectMode={selectMode}
                  count={selectedCount}
                  onToggleSelectMode={toggleSelectMode}
                  onDelete={handleRemoveSelected}
                  onMove={() => setShowTransferModal(true)}
                />
              )}
            </div>
          )}
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
            selectMode={selectMode}
            selected={selected}
            toggleSelect={toggleSelect}
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

      {/* ── Mover selección a playlist ─────────────────── */}
      <TransferModal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Mover a playlist"
        emptyMessage="No hay playlists disponibles"
        playlists={playlists}
        onSelect={handleTransferSelected}
      />
    </div>
  );
}
