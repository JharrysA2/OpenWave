import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { api } from "../utils/api";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, RADIUS, SPACING, SHADOWS, TRANSITIONS, GLASS, withAlpha } from "../utils/theme";

export function SongOptionsSheet({
  song,
  open,
  onClose,
  onDownload,
  onDownloadStart,
  onPlayNext,
  liked,
  onLike,
  toast,
  onGoToAlbum,
  onGoToArtist,
  onOpenPlaylistPicker,
  onRadio,
  onDeleteSong,
}) {
  const [dlPct, setDlPct] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (!open) {
      setDlPct(null);
      setShowDetails(false);
      setDetails(null);
    }
  }, [open]);

  const fetchDetails = async () => {
    if (details) {
      setShowDetails((v) => !v);
      return;
    }
    setShowDetails(true);
    try {
      const d = await api.get(`/song/details/${song.videoId}`);
      setDetails(d);
    } catch {
      setDetails({});
    }
  };

  const handleDownload = async () => {
    if (!song || song.downloaded || dlPct !== null) return;
    setDlPct(0);
    if (onDownloadStart) onDownloadStart(song);
    await api.post(`/download/${song.videoId}`, {
      title: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail,
      duration: song.duration,
    });
    const es = new EventSource(`${api.base}/download/progress/${song.videoId}`);
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      setDlPct(d.progress || 0);
      if (d.downloaded || d.status === "done") {
        setDlPct(null);
        es.close();
        toast("Descarga completa", "success");
        if (onDownload) onDownload();
        onClose();
      }
      if (d.status === "error") {
        setDlPct(null);
        es.close();
        toast("Error en la descarga", "error");
      }
    };
  };

  if (!song) return null;

  const buttons = [
    {
      label: song.downloaded
        ? "Eliminar descarga"
        : dlPct !== null
          ? `${Math.round(dlPct)}%`
          : "Descargar",
      icon: Ic.download(22),
      color: song.downloaded ? COLORS.successColor : dlPct !== null ? "var(--neon)" : null,
      bg: song.downloaded
        ? withAlpha(COLORS.successColor, "1f")
        : dlPct !== null
          ? "var(--neon-18)"
          : null,
      border: song.downloaded
        ? withAlpha(COLORS.successColor, "40")
        : dlPct !== null
          ? "var(--neon)"
          : null,
      action: song.downloaded
        ? async () => {
            await api.del(`/downloads/${song.videoId}`);
            if (onDownload) onDownload();
            toast("Descarga eliminada", "info");
            onClose();
          }
        : handleDownload,
    },
    {
      label: "Me gusta",
      icon: Ic.heart(liked, 22),
      color: liked ? COLORS.likeColor : null,
      bg: liked ? withAlpha(COLORS.likeColor, "1a") : null,
      border: liked ? withAlpha(COLORS.likeColor, "40") : null,
      action: () => {
        onLike(song.videoId, song);
        onClose();
      },
    },
    {
      label: "Agregar a cola",
      icon: Ic.queue,
      action: () => {
        onPlayNext(song);
        toast("Agregada a la cola", "success");
        onClose();
      },
    },
    {
      label: "Agregar a",
      icon: Ic.list,
      action: () => {
        if (onOpenPlaylistPicker) onOpenPlaylistPicker(song);
      },
    },
    {
      label: "Modo radio",
      icon: Ic.radio,
      action: () => {
        if (onRadio) {
          onRadio(song);
        } else {
          toast("Iniciando radio...", "info");
        }
        onClose();
      },
    },
    {
      label: "Compartir",
      icon: Ic.share,
      action: () => {
        try {
          navigator.clipboard?.writeText(`https://music.youtube.com/watch?v=${song.videoId}`);
          toast("Enlace copiado", "success");
        } catch {
          toast("No se pudo copiar el enlace", "error");
        }
        onClose();
      },
    },
    {
      label: song.album
        ? song.album.length > 16
          ? `${song.album.slice(0, 14)}…`
          : song.album
        : "Álbum",
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
        </svg>
      ),
      action: () => {
        onGoToAlbum && onGoToAlbum(song);
        onClose();
      },
    },
    {
      label:
        song.artist && song.artist !== "Desconocido"
          ? song.artist.length > 16
            ? `${song.artist.slice(0, 14)}…`
            : song.artist
          : "Artista",
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ),
      action: () => {
        onGoToArtist && onGoToArtist(song);
        onClose();
      },
    },
    {
      label: "Detalles",
      icon: Ic.info,
      action: fetchDetails,
    },
    ...(onDeleteSong
      ? [
          {
            label: "Eliminar de biblioteca",
            icon: (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
            ),
            color: COLORS.errorText,
            bg: withAlpha(COLORS.errorText, "14"),
            border: withAlpha(COLORS.errorText, "33"),
            action: () => {
              onDeleteSong(song.videoId || song.video_id);
              onClose();
            },
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.7)",
          zIndex: 1000000,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transition: "opacity .22s ease",
        }}
      />
      {/* Sheet container */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: `translateX(-50%) translateY(${open ? "0" : "100%"})`,
          width: "100%",
          maxWidth: "580px",
          ...GLASS.sheet,
          borderRadius: "24px 24px 0 0",
          borderBottom: "none",
          zIndex: 1000001,
          transition: `transform .25s ${TRANSITIONS.spring}`,
          fontFamily: FONT,
        }}
      >
        {/* Handle bar */}
        <div
          style={{
            width: "40px",
            height: "4px",
            background: "rgba(255,255,255,.15)",
            borderRadius: "4px",
            margin: "14px auto 0",
          }}
        />
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "16px 20px 14px",
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          {/* Cover */}
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: RADIUS.card,
              overflow: "hidden",
              flexShrink: 0,
              background: COLORS.surfaceCoverBg,
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
            }}
          >
            <MusicCover
              thumbnails={song.thumbnails}
              src={song.thumbnail}
              displaySize={60}
              alt=""
              style={{ width: "54px", height: "54px" }}
            />
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "15px",
                fontWeight: "800",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                letterSpacing: "-.2px",
              }}
            >
              {song.title}
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,.45)",
                marginTop: "3px",
                fontWeight: "600",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {song.artist}
            </div>
          </div>
          {/* OFFLINE badge */}
          {song.downloaded && (
            <span
              style={{
                fontSize: "11px",
                color: COLORS.successColor,
                fontWeight: "800",
                background: withAlpha(COLORS.successColor, "1a"),
                borderRadius: RADIUS.pill,
                padding: "3px 10px",
                flexShrink: 0,
                letterSpacing: ".3px",
              }}
            >
              OFFLINE
            </span>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%)",
              border: "1px solid rgba(255,255,255,.14)",
              borderRadius: RADIUS.full,
              width: "34px",
              height: "34px",
              cursor: "pointer",
              color: COLORS.winCtrlDefault,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: SHADOWS.settingsClose,
              transition: TRANSITIONS.normal,
            }}
          >
            {Ic.close}
          </button>
        </div>
        {/* Action buttons grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: "4px",
            padding: "12px 14px",
          }}
        >
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "18px 8px 16px",
                borderRadius: "16px",
                border: "none",
                cursor: "pointer",
                background: "transparent",
                color: btn.color || COLORS.textPlayerTitle,
                fontFamily: FONT,
                fontSize: "12.5px",
                fontWeight: "700",
                textAlign: "center",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceCardHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: RADIUS.full,
                  background: btn.bg || COLORS.surfaceNav,
                  border: `1.5px solid ${btn.border || "rgba(255,255,255,.08)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: btn.color || "rgba(255,255,255,.55)",
                }}
              >
                {btn.icon}
              </div>
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
        {/* Details section */}
        {showDetails && (
          <div
            style={{
              borderTop: `1px solid ${COLORS.borderSubtle}`,
              padding: "16px 22px 22px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: COLORS.progressTime,
                fontWeight: "800",
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                marginBottom: "14px",
              }}
            >
              Detalles
            </div>
            {!details ? (
              <div
                style={{
                  color: COLORS.iconDimmer,
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                Cargando...
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACING.gap.normal,
                }}
              >
                {[
                  ["Título", details.title || song.title],
                  ["Artista", details.artist || song.artist],
                  details.album && ["Álbum", details.album],
                  details.year && ["Año", details.year],
                  details.plays && ["Reproducciones", details.plays],
                  details.views && ["Vistas", details.views],
                  details.likes && ["Me gusta", details.likes],
                  details.genre && ["Género", details.genre],
                  song.duration > 0 && [
                    "Duración",
                    `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, "0")}`,
                  ],
                  ["Video ID", song.videoId],
                ]
                  .filter(Boolean)
                  .map(
                    ([label, value]) =>
                      value && (
                        <div
                          key={label}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "16px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: "700",
                              color: COLORS.progressTime,
                              flexShrink: 0,
                              paddingTop: "1px",
                            }}
                          >
                            {label}
                          </span>
                          <span
                            style={{
                              fontSize: "12.5px",
                              fontWeight: "700",
                              color: "rgba(255,255,255,.82)",
                              textAlign: "right",
                              wordBreak: "break-all",
                            }}
                          >
                            {value}
                          </span>
                        </div>
                      ),
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
