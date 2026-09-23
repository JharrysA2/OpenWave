import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, RADIUS, SHADOWS, TRANSITIONS, GLASS, withAlpha } from "../utils/theme";

/**
 * Hoja de opciones generalizada para álbum y artista — misma estética que
 * SongOptionsSheet. El padre define las acciones (Me gusta, Seguir,
 * Descargar álbum, Reproducir, etc.).
 */
export function EntityOptionsSheet({
  open,
  onClose,
  type, // 'album' | 'artist'
  entity,
  liked = false,
  onToggleLike,
  onDownload = null,
  downloadLabel = null,
  onPlay = null,
  onShuffle = null,
  onGoTo = null,
  onAddToPlaylist = null,
  onShare = null,
}) {
  if (!entity) return null;

  const isAlbum = type === "album";
  const title = isAlbum ? entity.title || "Álbum" : entity.name || "Artista";
  const subtitle = isAlbum
    ? [entity.artist, entity.type, entity.year].filter(Boolean).join(" · ") || "Álbum"
    : "Artista";

  const share = () => {
    if (onShare) {
      onShare();
      onClose();
      return;
    }
    const url = entity?.browseId
      ? `https://music.youtube.com/browse/${entity.browseId}`
      : `https://music.youtube.com/search?q=${encodeURIComponent(title)}`;
    try {
      navigator.clipboard?.writeText(url);
    } catch {}
    onClose();
  };

  const buttons = isAlbum
    ? [
        {
          label: "Me gusta",
          icon: Ic.heart(liked, 22),
          color: liked ? COLORS.likeColor : null,
          bg: liked ? withAlpha(COLORS.likeColor, "1a") : null,
          border: liked ? withAlpha(COLORS.likeColor, "40") : null,
          action: () => {
            onToggleLike?.();
            onClose();
          },
        },
        {
          label: downloadLabel || "Descargar álbum",
          icon: Ic.download(22),
          color: downloadLabel && downloadLabel !== "Descargar álbum" ? "var(--neon)" : null,
          bg: downloadLabel && downloadLabel !== "Descargar álbum" ? "var(--neon-18)" : null,
          border: downloadLabel && downloadLabel !== "Descargar álbum" ? "var(--neon)" : null,
          action: () => {
            onDownload?.();
            onClose();
          },
        },
        {
          label: "Reproducir",
          icon: Ic.play(22),
          action: () => {
            onPlay?.(false);
            onClose();
          },
        },
        {
          label: "Aleatorio",
          icon: Ic.shuffle(22),
          action: () => {
            onShuffle?.();
            onClose();
          },
        },
        ...(onAddToPlaylist
          ? [
              {
                label: "Agregar a",
                icon: Ic.list,
                action: () => onAddToPlaylist(),
              },
            ]
          : []),
        ...(onGoTo
          ? [
              {
                label: "Ir al álbum",
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
                  onGoTo();
                  onClose();
                },
              },
            ]
          : []),
        {
          label: "Compartir",
          icon: Ic.share,
          action: share,
        },
      ]
    : [
        {
          label: liked ? "Siguiendo" : "Seguir",
          icon: liked
            ? Ic.heart(true, 22)
            : (
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
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="16" y1="11" x2="22" y2="11" />
                </svg>
              ),
          color: liked ? COLORS.likeColor : null,
          bg: liked ? withAlpha(COLORS.likeColor, "1a") : null,
          border: liked ? withAlpha(COLORS.likeColor, "40") : null,
          action: () => {
            onToggleLike?.();
            onClose();
          },
        },
        ...(onGoTo
          ? [
              {
                label: "Ir al artista",
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
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                ),
                action: () => {
                  onGoTo();
                  onClose();
                },
              },
            ]
          : []),
        {
          label: "Compartir",
          icon: Ic.share,
          action: share,
        },
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
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: isAlbum ? RADIUS.card : RADIUS.full,
              overflow: "hidden",
              flexShrink: 0,
              background: COLORS.surfaceCoverBg,
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
            }}
          >
            <MusicCover
              thumbnails={entity.thumbnails}
              src={entity.thumbnail}
              displaySize={60}
              alt=""
              style={{ width: "54px", height: "54px" }}
            />
          </div>
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
              {title}
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
              {subtitle}
            </div>
          </div>
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
            padding: "12px 14px 22px",
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
      </div>
    </>
  );
}
