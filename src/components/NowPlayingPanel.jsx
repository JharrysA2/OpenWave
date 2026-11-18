import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, GLASS, RADIUS, SPACING, TRANSITIONS, safeAccentText } from "../utils/theme";

/**
 * Panel opcional «Ahora suena» para ventanas anchas.
 *
 * Es contenido, no chrome: superficie plana, sin blur y sin degradados.
 * El player bar conserva su pastilla flotante centrada e independiente.
 */
export function NowPlayingPanel({
  song,
  queue = [],
  queueIndex = -1,
  accentColor = "#a78bfa",
  onPlaySong,
  onClose,
}) {
  const upcoming =
    queueIndex >= 0 ? queue.slice(queueIndex + 1, queueIndex + 7) : queue.slice(0, 6);
  const upcomingStart = queueIndex >= 0 ? queueIndex + 1 : 0;

  return (
    <aside
      className="app-now-playing"
      aria-label="Ahora suena"
      style={{
        width: "320px",
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        padding: "24px 20px 104px",
        background: COLORS.surfaceInset,
        borderLeft: `1px solid ${COLORS.borderSubtle}`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: COLORS.textTertiary,
            textTransform: "uppercase",
            letterSpacing: ".05em",
          }}
        >
          Ahora suena
        </span>
        <button
          onClick={onClose}
          title="Ocultar ahora suena"
          aria-label="Ocultar ahora suena"
          style={{
            ...GLASS.control,
            width: "32px",
            height: "32px",
            borderRadius: RADIUS.default,
            color: COLORS.textSecondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: TRANSITIONS.fast,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = GLASS.controlHover.background;
            e.currentTarget.style.color = COLORS.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = GLASS.control.background;
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
        >
          {Ic.close}
        </button>
      </div>

      {song ? (
        <>
          <div
            style={{
              width: "100%",
              aspectRatio: "1",
              borderRadius: RADIUS.default,
              overflow: "hidden",
              background: COLORS.surfaceCoverBg,
              border: `1px solid ${COLORS.borderSubtle}`,
            }}
          >
            <MusicCover
              thumbnails={song.thumbnails}
              src={song.thumbnail}
              displaySize={280}
              alt={song.title || ""}
              style={{ width: "100%", height: "100%" }}
            />
          </div>

          <div style={{ marginTop: "16px", minWidth: 0 }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: COLORS.textPrimary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {song.title || "Sin reproducción"}
            </div>
            <div
              style={{
                marginTop: "4px",
                fontSize: "14px",
                color: safeAccentText(accentColor),
                fontWeight: "500",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {song.artist || "OpenWave"}
            </div>
          </div>

          <div style={{ marginTop: "24px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: COLORS.textTertiary,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: "8px",
              }}
            >
              A continuación
            </div>
            {upcoming.length === 0 ? (
              <p style={{ margin: 0, color: COLORS.textTertiary, fontSize: "14px" }}>
                No hay más canciones en la cola.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {upcoming.map((track, index) => {
                  const absoluteIndex = upcomingStart + index;
                  return (
                    <button
                      key={track.videoId || `${track.title}-${index}`}
                      onClick={() => onPlaySong?.(track, absoluteIndex, false, queue)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: SPACING.gap.normal,
                        minHeight: "52px",
                        padding: "6px 8px",
                        background: "transparent",
                        border: "none",
                        borderRadius: RADIUS.default,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: FONT,
                        transition: "background .12s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          flexShrink: 0,
                          overflow: "hidden",
                          borderRadius: "8px",
                          background: COLORS.surfaceCoverBg,
                        }}
                      >
                        <MusicCover
                          thumbnails={track.thumbnails}
                          src={track.thumbnail}
                          displaySize={80}
                          alt=""
                          style={{ width: "100%", height: "100%" }}
                        />
                      </div>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            display: "block",
                            color: COLORS.textPrimary,
                            fontSize: "14px",
                            fontWeight: "500",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {track.title || "Sin título"}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: "2px",
                            color: COLORS.textTertiary,
                            fontSize: "12px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {track.artist || ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: "48px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: RADIUS.default,
              background: "rgba(255,255,255,.05)",
              color: COLORS.textTertiary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {Ic.music}
          </div>
          <p
            style={{
              marginTop: "16px",
              fontSize: "14px",
              color: COLORS.textSecondary,
              textAlign: "center",
            }}
          >
            Elige una canción para ver aquí la reproducción y la cola.
          </p>
        </div>
      )}
    </aside>
  );
}
