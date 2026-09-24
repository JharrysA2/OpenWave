import React, { useState, useMemo } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { ConfirmModal } from "./ConfirmModal";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS, LAYOUTS, withAlpha, ANIMATIONS } from "../utils/theme";
import LibraryTabs from "./LibraryTabs";
import TrackList from "./TrackList";
import { AlbumGridCard } from "./LibraryCard";
import { useLibraryGroups } from "../hooks/useLibraryGroups";

const EMPTY_STYLE = {
  padding: "60px 20px",
  textAlign: "center",
  color: "rgba(255,255,255,.3)",
  fontSize: "14px",
  fontWeight: "600",
};

const SUCCESS = COLORS.successColor || "#22c55e";

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function DownloadsView({
  downloads,
  currentSong,
  accentColor,
  playSong,
  openOptions,
  onDownloadsCleared,
  toast,
  openEntityOptions,
  goToAlbum,
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [tab, setTab] = useState("songs");
  // Hover declarativo del hero: "shuffle" | "play" | "clear" (null = ninguno).
  const [heroHover, setHeroHover] = useState(null);

  // Canciones normalizadas (mismo shape que cualquier lista de la app)
  const songs = useMemo(
    () =>
      (downloads || []).map((d) => ({
        videoId: d.videoId || d.video_id,
        title: d.title,
        artist: d.artist,
        thumbnail: d.thumbnail,
        thumbnails: d.thumbnails,
        duration: d.duration,
        album: d.albumTitle || d.album || "",
        albumType: d.albumType || "",
        albumBrowseId: d.albumBrowseId || "",
        artistBrowseId: d.artistBrowseId || "",
        size: d.size || 0,
        downloaded: true,
      })),
    [downloads],
  );

  const { albums } = useLibraryGroups(songs);

  const handleClearDownloads = async () => {
    await api.deleteDownloads(toast);
    setShowConfirmModal(false);
    if (onDownloadsCleared) onDownloadsCleared();
  };

  const playAll = (shuffle = false) => {
    if (songs.length === 0) return;
    const list = shuffle ? [...songs].sort(() => Math.random() - 0.5) : songs;
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
    cursor: songs.length === 0 ? "not-allowed" : "pointer",
    opacity: songs.length === 0 ? 0.4 : 1,
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
        <div
          style={{
            width: "160px",
            height: "160px",
            borderRadius: RADIUS.card,
            overflow: "hidden",
            flexShrink: 0,
            background: `linear-gradient(135deg, ${SUCCESS}55, ${SUCCESS}11)`,
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
            stroke={SUCCESS}
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
            {songs.length} {songs.length === 1 ? "canción" : "canciones"} descargada
            {songs.length !== 1 ? "s" : ""} · {albums.length} álbum
            {albums.length !== 1 ? "es" : ""}
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
              disabled={songs.length === 0}
              style={heroButton(false, heroHover === "shuffle")}
              {...heroHoverProps("shuffle")}
            >
              {Ic.shuffle(16)}
              Aleatorio
            </button>

            <button
              onClick={() => playAll(false)}
              disabled={songs.length === 0}
              style={heroButton(true, heroHover === "play")}
              {...heroHoverProps("play")}
            >
              {Ic.play(16)}
              Reproducir
            </button>

            <button
              onClick={() => songs.length > 0 && setShowConfirmModal(true)}
              disabled={songs.length === 0}
              style={{
                ...heroButton(false, false),
                ...(heroHover === "clear"
                  ? {
                      background: "rgba(239,68,68,.14)",
                      border: "1px solid rgba(239,68,68,.35)",
                      color: "#ef4444",
                    }
                  : { color: "rgba(255,255,255,.4)" }),
              }}
              {...heroHoverProps("clear")}
            >
              {Ic.trash}
              Eliminar todo
            </button>
          </div>
        </div>
      </div>

      {/* ── Pestañas: Canciones / Álbumes ────────── */}
      <LibraryTabs
        accentColor={accentColor}
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "songs", label: "Canciones", count: songs.length },
          { key: "albums", label: "Álbumes", count: albums.length },
        ]}
      />

      {/* ── Contenido por pestaña ────────────────── */}
      {tab === "songs" &&
        (songs.length === 0 ? (
          <div style={EMPTY_STYLE}>Descarga canciones para escucharlas sin conexión</div>
        ) : (
          <TrackList
            songs={songs}
            currentSong={currentSong}
            accentColor={accentColor}
            onPlay={(song) => playSong(song, 0, false, songs)}
            openOptions={openOptions}
            badgeFor={(song) => (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexShrink: 0,
                  marginRight: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "9px",
                    color: SUCCESS,
                    fontWeight: "800",
                    background: withAlpha(SUCCESS, "1a"),
                    borderRadius: RADIUS.pill,
                    padding: "2px 8px",
                    letterSpacing: ".2px",
                  }}
                >
                  OFFLINE
                </span>
                {song.size > 0 && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "rgba(255,255,255,.35)",
                      fontWeight: "700",
                    }}
                  >
                    {fmtSize(song.size)}
                  </span>
                )}
              </span>
            )}
          />
        ))}

      {tab === "albums" &&
        (albums.length === 0 ? (
          <div style={EMPTY_STYLE}>
            Los álbumes de tus descargas aparecerán aquí
          </div>
        ) : (
          <div style={LAYOUTS.cardGrid}>
            {albums.map((group, i) => {
              const entity = {
                browseId: group.browseId,
                title: group.title,
                artist: group.artist,
                type: group.type || "Álbum",
                thumbnail: group.thumbnail,
                thumbnails: group.thumbnails,
              };
              return (
                <AlbumGridCard
                  key={group.key}
                  album={entity}
                  accentColor={accentColor}
                  subtitle={`${group.count} ${group.count === 1 ? "canción" : "canciones"}${
                    group.size > 0 ? ` · ${fmtSize(group.size)}` : ""
                  }`}
                  animationDelay={i * 40}
                  onClick={group.browseId ? () => goToAlbum?.(group.browseId) : undefined}
                  onPlay={() => playSong(group.songs[0], 0, false, group.songs)}
                  onOptions={() => openEntityOptions?.("album", entity, group.songs)}
                />
              );
            })}
          </div>
        ))}

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
