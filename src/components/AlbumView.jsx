import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { api } from "../utils/api";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { fmtTime } from "../utils/formatTime";
import { useMultiSelect } from "../hooks/useMultiSelect";
import { TransferModal } from "./TransferModal";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  GLASS,
  withAlpha,
  ANIMATIONS,
  safeAccentText,
} from "../utils/theme";
import { SkeletonAlbumView } from "./SkeletonLoader";

export default function AlbumView({
  browseId,
  accentColor,
  currentSong,
  playSong,
  toggleLike,
  liked,
  openOptions,
  onGoToArtist,
  onBack,
  toast,
  playlists,
  refreshPlaylists,
  isAlbumLiked,
  toggleAlbumLike,
  openEntityOptions,
  downloadAlbum,
}) {
  const [album, setAlbum] = useState(null);

  // Hover declarativo de los botones de acción: los estilos se recalculan en
  // render (nunca quedan "pegados") y respetan el estado (♥/Seleccionar).
  const [hoverKey, setHoverKey] = useState(null);
  const hov = (key) => ({
    onMouseEnter: () => setHoverKey(key),
    onMouseLeave: () => setHoverKey((k) => (k === key ? null : k)),
  });

  // ── Entidad "álbum" para Me gusta / hoja de opciones ───────────────
  const albumEntity = album
    ? {
        browseId,
        title: album.title || "",
        artist: album.artist || "",
        type: album.type || "",
        year: album.year || "",
        artistBrowseId: album.artistBrowseId || "",
        thumbnail: album.thumbnail || "",
        thumbnails: album.thumbnails || [],
      }
    : null;

  const albumLiked = !!isAlbumLiked?.(browseId);

  const handleAlbumLike = () => {
    if (!albumEntity) return;
    const added = toggleAlbumLike?.(albumEntity);
    toast?.(added ? "Añadido a Me gusta" : "Quitado de Me gusta", added ? "success" : "info");
  };
  const [loading, setLoading] = useState(true);

  // ── Multi-select mode ──
  const {
    selectMode,
    selected,
    count: selectedCount,
    toggleSelect,
    toggleSelectMode,
    resetSelect,
  } = useMultiSelect();

  // ── Transfer modal ──
  const [showTransferModal, setShowTransferModal] = useState(false);

  useEffect(() => {
    if (!browseId) return;
    setLoading(true);
    setAlbum(null);
    resetSelect();
    api
      .get(`/album/${encodeURIComponent(browseId)}`)
      .then((d) => {
        setAlbum(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [browseId, resetSelect]);

  // ── Transfer selected to another playlist ──
  const handleTransferSelected = async (targetPlaylistId) => {
    if (selected.size === 0 || !album?.tracks) return;
    const songsToTransfer = album.tracks.filter((t) => selected.has(t.videoId));
    await api.addToPlaylist(targetPlaylistId, songsToTransfer, toast);
    toast(
      `${songsToTransfer.length} ${songsToTransfer.length === 1 ? "canción" : "canciones"} transferida${songsToTransfer.length !== 1 ? "s" : ""}`,
      "success",
    );
    setShowTransferModal(false);
    resetSelect();
    if (refreshPlaylists) await refreshPlaylists();
  };

  // ── Remove selected from album (visual only, since it's not a playlist) ──
  const handleRemoveSelected = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    resetSelect();
    toast(
      `${count} ${count === 1 ? "canción" : "canciones"} eliminada${count !== 1 ? "s" : ""} de la selección`,
      "success",
    );
  };

  if (loading) {
    return <SkeletonAlbumView />;
  }

  if (!album) {
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
          No se pudo cargar el álbum
        </div>
        <button
          onClick={onBack}
          style={{
            padding: "8px 18px",
            borderRadius: RADIUS.pill,
            border: "none",
            background: accentColor,
            // Acento de fondo → primer plano dinámico (nunca negro fijo)
            color: "var(--neon-fg)",
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
      {/* ── Hero: Banner con cover blur de fondo + cover overlappeando ── */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "260px",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Cover como fondo del banner — más grande y dramático */}
        {album.thumbnail && (
          <img
            src={album.thumbnail}
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
            background: `linear-gradient(180deg, rgba(0,0,0,.3) 0%, rgba(0,0,0,.1) 40%, rgba(0,0,0,.85) 100%)`,
          }}
        />
        {/* Gradiente de acento sutil */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 30% 20%, ${withAlpha(accentColor, "20")} 0%, transparent 60%)`,
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
            ...(hoverKey === "back"
              ? {
                  background: GLASS.btnHoverSoft.background,
                  border: GLASS.btnHoverSoft.border,
                  transform: "scale(1.05)",
                }
              : {}),
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .15s cubic-bezier(.16,1,.3,1)",
          }}
          {...hov("back")}
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

      {/* ── Cover overlappea entre banner y contenido — más dramático ── */}
      <div
        style={{
          position: "relative",
          padding: "0 22px",
          marginTop: "-85px",
          zIndex: 1,
          display: "flex",
          gap: "20px",
          alignItems: "flex-end",
        }}
      >
        {/* Cover grande con sombra profunda y borde de acento */}
        <div
          style={{
            width: "165px",
            height: "165px",
            borderRadius: RADIUS.card,
            overflow: "hidden",
            flexShrink: 0,
            boxShadow: `0 12px 40px rgba(0,0,0,.7), 0 0 0 1px ${withAlpha(accentColor, "20")}`,
          }}
        >
          <MusicCover
            thumbnails={album.thumbnails}
            src={album.thumbnail}
            displaySize={200}
            alt={album.title}
            style={{ width: "165px", height: "165px" }}
          />
        </div>
        {/* Info al lado del cover */}
        <div style={{ flex: 1, minWidth: 0, paddingBottom: "10px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: COLORS.textTertiary,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            {album.type || "ÁLBUM"}
          </div>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: "800",
              color: "#fff",
              letterSpacing: "-.5px",
              marginBottom: "6px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {album.title}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {album.artist && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onGoToArtist) {
                    onGoToArtist(
                      album.artistBrowseId ? { browseId: album.artistBrowseId } : album.artist,
                    );
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: safeAccentText(accentColor),
                  fontWeight: "700",
                  fontSize: "14px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "0",
                  transition: "opacity .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {album.artist}
              </button>
            )}
            {album.year && (
              <span style={{ fontSize: "13px", fontWeight: "600", color: COLORS.textTertiary }}>
                · {album.year}
              </span>
            )}
            {album.tracks?.length > 0 && (
              <span style={{ fontSize: "13px", fontWeight: "600", color: COLORS.textTertiary }}>
                · {album.tracks.length} canciones
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Action buttons row ─────────────────────────── */}
      {album.tracks?.length > 0 && (
        <div
          style={{
            padding: "18px 22px 10px",
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Play all */}
          <button
            onClick={() => {
              const first = album.tracks[0];
              if (first) playSong(first, 0, false, album.tracks);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "11px 28px",
              borderRadius: RADIUS.pill,
              border: "none",
              background: accentColor,
              // Acento de fondo → primer plano dinámico (nunca negro fijo)
              color: "var(--neon-fg)",
              fontWeight: "700",
              fontSize: "14px",
              fontFamily: FONT,
              cursor: "pointer",
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: `0 4px 20px ${withAlpha(accentColor, "55")}, 0 0 0 1px ${withAlpha(accentColor, "20")}`,
              ...(hoverKey === "play"
                ? {
                    transform: "scale(1.04)",
                    boxShadow: `0 6px 28px ${withAlpha(accentColor, "66")}, 0 0 0 1px ${withAlpha(accentColor, "30")}`,
                  }
                : {}),
            }}
            {...hov("play")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Reproducir
          </button>

          {/* Me gusta (album) */}
          <button
            onClick={handleAlbumLike}
            title="Me gusta"
            style={{
              ...GLASS.btn,
              ...(albumLiked
                ? {
                    background: withAlpha(COLORS.likeColor, hoverKey === "like" ? "20" : "14"),
                    border: `1px solid ${withAlpha(COLORS.likeColor, "40")}`,
                  }
                : hoverKey === "like"
                  ? GLASS.btnHoverSoft
                  : {}),
              borderRadius: RADIUS.pill,
              padding: "9px 16px",
              fontSize: "12.5px",
              fontWeight: "700",
              fontFamily: FONT,
              cursor: "pointer",
              color: albumLiked
                ? COLORS.likeColor
                : hoverKey === "like"
                  ? COLORS.textPrimary
                  : "rgba(255,255,255,.6)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: TRANSITIONS.fast,
            }}
            {...hov("like")}
          >
            {Ic.heart(albumLiked, 16)}
            {albumLiked ? "Guardado" : "Me gusta"}
          </button>

          {/* Descargar álbum completo */}
          <button
            onClick={() => albumEntity && downloadAlbum?.(albumEntity)}
            title="Descargar álbum completo"
            style={{
              ...GLASS.btn,
              ...(hoverKey === "download" ? GLASS.btnHoverSoft : {}),
              borderRadius: RADIUS.pill,
              padding: "9px 16px",
              fontSize: "12.5px",
              fontWeight: "700",
              fontFamily: FONT,
              cursor: "pointer",
              color: hoverKey === "download" ? COLORS.textPrimary : "rgba(255,255,255,.6)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: TRANSITIONS.fast,
            }}
            {...hov("download")}
          >
            {Ic.download(16)}
            Descargar
          </button>

          {/* Opciones del álbum (⋮) */}
          <button
            onClick={() => albumEntity && openEntityOptions?.("album", albumEntity)}
            title="Más opciones del álbum"
            style={{
              ...GLASS.btn,
              ...(hoverKey === "opts" ? GLASS.btnHoverSoft : {}),
              borderRadius: RADIUS.full,
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: hoverKey === "opts" ? COLORS.textPrimary : "rgba(255,255,255,.6)",
              padding: 0,
            }}
            {...hov("opts")}
          >
            {Ic.dots}
          </button>

          {/* Select mode toggle */}
          <button
            onClick={toggleSelectMode}
            style={{
              ...GLASS.btn,
              ...(selectMode ? { border: `1px solid ${accentColor}55` } : {}),
              ...(hoverKey === "select" && !selectMode ? GLASS.btnHoverSoft : {}),
              borderRadius: RADIUS.pill,
              padding: "9px 16px",
              fontSize: "12.5px",
              fontWeight: "700",
              fontFamily: FONT,
              color: selectMode
                ? accentColor
                : hoverKey === "select"
                  ? COLORS.textPrimary
                  : "rgba(255,255,255,.5)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: TRANSITIONS.fast,
            }}
            {...hov("select")}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            {selectMode ? `Seleccionar (${selectedCount})` : "Seleccionar"}
          </button>

          {/* Delete selected */}
          {selectMode && selected.size > 0 && (
            <button
              onClick={handleRemoveSelected}
              style={{
                ...GLASS.btn,
                ...(hoverKey === "delete"
                  ? { background: "rgba(239,68,68,.2)", border: "1px solid rgba(239,68,68,.4)" }
                  : { background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)" }),
                borderRadius: RADIUS.pill,
                padding: "9px 16px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: "#ef4444",
                fontFamily: FONT,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              {...hov("delete")}
            >
              {Ic.trash}
              Eliminar ({selectedCount})
            </button>
          )}

          {/* Transfer selected */}
          {selectMode && selected.size > 0 && (
            <button
              onClick={() => setShowTransferModal(true)}
              style={{
                ...GLASS.btn,
                ...(hoverKey === "transfer"
                  ? { background: "rgba(255,255,255,.1)", border: `1px solid ${accentColor}55` }
                  : { background: "rgba(255,255,255,.06)", border: `1px solid ${accentColor}33` }),
                borderRadius: RADIUS.pill,
                padding: "9px 16px",
                fontSize: "12.5px",
                fontWeight: "700",
                color: accentColor,
                fontFamily: FONT,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: TRANSITIONS.fast,
              }}
              {...hov("transfer")}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Transferir ({selectedCount})
            </button>
          )}
        </div>
      )}

      {/* ── Track list — más refinado con separadores sutiles ─────────── */}
      <div style={{ padding: "0 18px 100px" }}>
        {(!album.tracks || album.tracks.length === 0) && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: COLORS.textMuted,
              fontSize: "13px",
              fontWeight: "500",
            }}
          >
            No hay canciones disponibles
          </div>
        )}
        {album.tracks?.map((track, i) => {
          const isActive = currentSong?.videoId === track.videoId;
          const isSelected = selected.has(track.videoId);

          return (
            <div
              key={track.videoId || i}
              onClick={() => {
                if (selectMode) {
                  toggleSelect(track.videoId);
                } else {
                  playSong(track, 0, false, album.tracks);
                }
              }}
              style={{
                ...ANIMATIONS.fadeSlideUp(120 + i * 25),
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: RADIUS.default,
                cursor: selectMode ? "pointer" : "pointer",
                background: isSelected
                  ? `rgba(255,255,255,.08)`
                  : isActive
                    ? `linear-gradient(90deg, ${withAlpha(accentColor, "12")}, transparent)`
                    : "transparent",
                transition: "all .15s cubic-bezier(.16,1,.3,1)",
                borderBottom:
                  i < album.tracks.length - 1 ? "1px solid rgba(255,255,255,.03)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isSelected) e.currentTarget.style.background = COLORS.surfaceNav;
              }}
              onMouseLeave={(e) => {
                if (!isActive && !isSelected) e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Select checkbox or track number */}
              {selectMode ? (
                <div
                  style={{
                    minWidth: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    border: `2px solid ${isSelected ? accentColor : "rgba(255,255,255,.2)"}`,
                    background: isSelected ? accentColor : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all .15s",
                  }}
                >
                  {isSelected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              ) : (
                <span
                  style={{
                    minWidth: "24px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: isActive ? safeAccentText(accentColor) : COLORS.textDimmest,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {isActive ? (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill={safeAccentText(accentColor)}
                      style={{ verticalAlign: "middle" }}
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    track.trackNumber || i + 1
                  )}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13.5px",
                    fontWeight: "600",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isActive ? safeAccentText(accentColor) : COLORS.textPlayerTitle,
                    lineHeight: 1.3,
                  }}
                >
                  {track.title}
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
                  {track.artist || album.artist}
                </div>
              </div>
              {!selectMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(track.videoId);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: liked?.has(track.videoId) ? COLORS.likeColor : COLORS.iconDimmer,
                    display: "flex",
                    padding: "4px",
                    transition: "all .15s cubic-bezier(.16,1,.3,1)",
                  }}
                >
                  {Ic.heart(liked?.has(track.videoId), 15)}
                </button>
              )}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: COLORS.textMuted,
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTime(track.duration)}
              </span>
              {!selectMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptions(track);
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
              )}
            </div>
          );
        })}
      </div>

      {/* ── Transfer Modal ─────────────────────────── */}
      <TransferModal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Transferir a playlist"
        emptyMessage="No hay playlists disponibles. Crea una primero."
        playlists={playlists}
        onSelect={handleTransferSelected}
      />
    </div>
  );
}
