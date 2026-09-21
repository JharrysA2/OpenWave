import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { usePerformance } from "../contexts/PerformanceContext";
import { fmtTime } from "../utils/formatTime";
import {
  COLORS,
  RADIUS,
  SPACING,
  SHADOWS,
  TRANSITIONS,
  GLASS,
  withAlpha,
  safeAccentText,
} from "../utils/theme";

/* Botones del player — mismo material que GLASS.btn pero SIN backdrop-filter:
   el propio bar ya difumina el fondo (GLASS.player), así que un blur por botón
   no aporta nada visible y añade 6 regiones que se re-rasterizan en cada hover
   (y con --disable-gpu todas se pagan en CPU). */
const BAR_BTN = {
  ...GLASS.btn,
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

// ── VolSlider: slider de volumen vertical — barra gruesa, thumb solo en hover ─

function VolSlider({ visible, volPos, volume, onVolume, accentColor, onMouseEnter, onMouseLeave }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const TRACK_H = 130;
  const THUMB_R = 8;

  const thumbPos = volume * TRACK_H;

  const calcVolume = useCallback(
    (clientY) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const y = clientY - rect.top;
      const pct = 1 - Math.max(0, Math.min(1, y / TRACK_H));
      onVolume(pct);
    },
    [onVolume],
  );

  const handleMouseDown = useCallback(
    (e) => {
      setDragging(true);
      calcVolume(e.clientY);
    },
    [calcVolume],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => calcVolume(e.clientY);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, calcVolume]);

  const showThumb = hovering || dragging;

  return (
    <div
      onMouseEnter={(e) => {
        setHovering(true);
        onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setHovering(false);
        onMouseLeave(e);
      }}
      style={{
        position: "fixed",
        bottom: `${volPos.bottom + 6}px`,
        left: `${volPos.left}px`,
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(8px)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "all" : "none",
        transition:
          "opacity .18s cubic-bezier(.16,1,.3,1), transform .18s cubic-bezier(.16,1,.3,1)",
        ...GLASS.popup,
        borderRadius: "16px",
        zIndex: 1000000,
        padding: "10px 8px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "5px",
        width: "42px",
        fontFamily: FONT,
      }}
    >
      {/* Percent label — con la fuente del proyecto */}
      <span
        style={{
          fontFamily: FONT,
          fontSize: "11px",
          fontWeight: "700",
          color: safeAccentText(accentColor),
          fontVariantNumeric: "tabular-nums",
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        {Math.round(volume * 100)}
      </span>

      {/* Barra vertical GRUESA (10px) */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{
          width: "10px",
          height: `${TRACK_H}px`,
          borderRadius: "5px",
          background: "rgba(255,255,255,.08)",
          position: "relative",
          cursor: "pointer",
          margin: "6px 0",
          overflow: "visible",
        }}
      >
        {/* Filled portion — desde abajo hasta thumbPos */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${Math.max(thumbPos, 3)}px`,
            borderRadius: "5px",
            background: `linear-gradient(to top, ${accentColor}, ${accentColor}bb)`,
            boxShadow: `0 0 8px ${accentColor}88, 0 0 16px ${accentColor}44`,
            transition: dragging ? "none" : "height .08s ease",
            pointerEvents: "none",
          }}
        />

        {/* Thumb — visible SOLO en hover o dragging */}
        <div
          style={{
            position: "absolute",
            bottom: `${thumbPos - THUMB_R}px`,
            left: "50%",
            width: `${THUMB_R * 2}px`,
            height: `${THUMB_R * 2}px`,
            borderRadius: "50%",
            background: accentColor,
            border: "2px solid rgba(255,255,255,.4)",
            boxShadow: `0 0 10px ${accentColor}cc, 0 2px 4px rgba(0,0,0,.5)`,
            cursor: "grab",
            pointerEvents: "none",
            opacity: showThumb ? 1 : 0,
            transform: showThumb ? "translateX(-50%) scale(1)" : "translateX(-50%) scale(0.5)",
            transition: "opacity .12s ease, transform .12s ease, bottom .08s ease",
            zIndex: 1,
          }}
        />
      </div>

      {/* Mini icono mute */}
      <div style={{ opacity: 0.4, lineHeight: 0, marginTop: "2px" }}>
        {volume > 0 ? Ic.vol(11) : Ic.volMute(11)}
      </div>
    </div>
  );
}

export const PlayerBar = memo(function PlayerBar({
  song,
  isPlaying,
  streamLoading,
  duration,
  volume,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onPlayModeToggle,
  accentColor,
  onLyrics,
  lyricsOpen,
  onOpenOptions,
  shuffleActive,
  repeatMode,
  crossfadeDuration,
  onCrossfadeDuration,
  progressRef,
}) {
  const progressBarRef = useRef(null);
  const progressFillRef = useRef(null);
  const progressThumbRef = useRef(null);
  const progressTimeRef = useRef(null);
  const { visible } = usePerformance();
  // Último valor/duración ya pintados en el DOM → evita escrituras repetidas
  const paintedProgressRef = useRef(null);
  const paintedDurationRef = useRef(null);
  const [showVolSlider, setShowVolSlider] = useState(false);
  const volHoverTimerRef = useRef(null);
  const [cfOpen, setCfOpen] = useState(false);
  const [cfHover, setCfHover] = useState(false);
  const cfTimerRef = useRef(null);
  const volBtnRef = useRef(null);
  const cfBtnRef = useRef(null);
  const [cfPos, setCfPos] = useState({ bottom: 0, left: 0 });
  const [volPos, setVolPos] = useState({ bottom: 0, left: 0 });

  // ── Progreso en tiempo real SIN setInterval ni re-renders ────────────
  //    `progressRef` (que escribe usePlayer) es la fuente de verdad. Antes
  //    un setInterval de 200ms hacía setState 5 veces por segundo y
  //    re-renderizaba toda la barra. Ahora escribimos directo al DOM:
  //      • rAF mientras suena música (se detiene al pausar)
  //      • un sync puntual al montar, al cambiar canción/duración/estado
  //        y al hacer seek (pintado optimista).
  const paintProgress = useCallback(
    (overrideSeconds) => {
      const raw = overrideSeconds ?? progressRef?.current ?? 0;

      // Solo repintamos si cambió el valor (granularidad de 0.1s) o la
      // duración (el % depende de ella; al llegar el metadata hay que repintar).
      const sameValue =
        paintedProgressRef.current !== null && Math.abs(raw - paintedProgressRef.current) < 0.1;
      if (sameValue && paintedDurationRef.current === duration) return;

      paintedProgressRef.current = raw;
      paintedDurationRef.current = duration;

      const pct = duration > 0 ? Math.min(100, Math.max(0, (raw / duration) * 100)) : 0;

      if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
      if (progressThumbRef.current) progressThumbRef.current.style.right = `${100 - pct}%`;
      if (progressTimeRef.current) {
        const label = fmtTime(raw || 0);
        if (progressTimeRef.current.textContent !== label) {
          progressTimeRef.current.textContent = label;
        }
      }
    },
    [duration, progressRef],
  );

  // Loop: 1s interval while playing (was rAF ~60fps, GPU-heavy).
  // Se pausa cuando la ventana no es visible — no aporta nada leer el reloj
  // si nadie mira la barra, y la música sigue sonando.
  useEffect(() => {
    if (!isPlaying || !visible) return undefined;

    const interval = setInterval(() => paintProgress(), 1000);

    return () => clearInterval(interval);
  }, [isPlaying, visible, paintProgress]);

  // Sync puntual: montaje y cada cambio de canción/duración/estado
  useEffect(() => {
    paintProgress();
  }, [paintProgress, isPlaying, song?.videoId, visible]);

  const openCf = () => {
    clearTimeout(cfTimerRef.current);
    if (cfBtnRef.current) {
      const r = cfBtnRef.current.getBoundingClientRect();
      setCfPos({ bottom: window.innerHeight - r.top + 8, left: r.left + r.width / 2 });
    }
    setCfOpen(true);
  };
  const closeCf = () => {
    cfTimerRef.current = setTimeout(() => setCfOpen(false), 300);
  };

  // ── Hover volume: abrir con temporizador, cerrar con retardo ─────────
  const openVol = () => {
    clearTimeout(volHoverTimerRef.current);
    if (volBtnRef.current) {
      const r = volBtnRef.current.getBoundingClientRect();
      setVolPos({ bottom: window.innerHeight - r.top + 8, left: r.left + r.width / 2 });
    }
    setShowVolSlider(true);
  };
  const scheduleCloseVol = () => {
    clearTimeout(volHoverTimerRef.current);
    volHoverTimerRef.current = setTimeout(() => setShowVolSlider(false), 400);
  };
  const cancelCloseVol = () => {
    clearTimeout(volHoverTimerRef.current);
  };

  useEffect(() => {
    return () => clearTimeout(volHoverTimerRef.current);
  }, []);

  const totalDisplay =
    // ⭐ V3: durante un crossfade, la duración ya podría ser la de la siguiente
    //    canción — mostrar la que se pintó por última vez en la barra hasta que
    //    el swap esté completo (evita que el rótulo cambie en medio del fade).
    paintedDurationRef.current != null ? fmtTime(paintedDurationRef.current) : fmtTime(duration);

  const handleProgressClick = (e) => {
    if (!progressBarRef.current || !duration || !onSeek) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * duration;
    onSeek(time);
    // Pintado optimista: la barra responde al instante incluso en pausa
    paintProgress(time);
  };

  return (
    <div
      className="player-bar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "8px 20px 10px",
        margin: "0 auto 12px",
        maxWidth: "680px",
        borderRadius: "20px",
        ...GLASS.player,
        position: "relative",
        zIndex: 100,
        fontFamily: FONT,
        transition:
          "transform .35s cubic-bezier(.16,1,.3,1), background .3s, box-shadow .3s, border .3s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px) scale(1.005)";
        e.currentTarget.style.background =
          "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.05) 100%)";
        e.currentTarget.style.boxShadow =
          "inset 0 1px 0 rgba(255,255,255,.18), " +
          "inset 0 -1px 0 rgba(255,255,255,.06), " +
          "0 12px 40px rgba(0,0,0,.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.background =
          "linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.03) 100%)";
        e.currentTarget.style.boxShadow = GLASS.player.boxShadow;
      }}
    >
      {/* Main row: Three-column layout */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* ── Left: Cover + Info — tamaño fijo ──────────── */}
        <div
          style={{
            width: "200px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            minWidth: 0,
          }}
        >
          {/* Cover con sombra sutil */}
          <div
            style={{
              width: SPACING.cover.player,
              height: SPACING.cover.player,
              borderRadius: RADIUS.cover,
              overflow: "hidden",
              flexShrink: 0,
              background: COLORS.surfaceCoverBg,
              boxShadow: "0 2px 8px rgba(0,0,0,.3)",
            }}
          >
            <MusicCover
              priority
              thumbnails={song?.thumbnails}
              src={song?.thumbnail}
              displaySize={68}
              alt=""
              style={{ width: SPACING.cover.player, height: SPACING.cover.player }}
            />
          </div>

          {/* Info — con mejor jerarquía */}
          <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onOpenOptions}>
            <div
              style={{
                fontSize: "13.5px",
                fontWeight: "700",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: COLORS.textPlayerTitle,
                lineHeight: 1.3,
              }}
            >
              {song?.title || "SoundWave"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: COLORS.textTertiary,
                fontWeight: "500",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: "1px",
              }}
            >
              {song?.artist || "\u00A0"}
            </div>
          </div>
        </div>

        {/* ── Center: Controls only ──── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Controls row — glass circles (no border), play is square */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Glass button style: all buttons same size, glass bg, no border */}
            {[
              {
                onClick: () => onPlayModeToggle("shuffle"),
                color: shuffleActive ? safeAccentText(accentColor) : COLORS.iconDim,
                icon: Ic.shuffle(18),
                title: "Shuffle",
              },
              { onClick: onPrev, color: COLORS.iconActive, icon: Ic.prev(18), title: "Anterior" },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={btn.onClick}
                title={btn.title}
                style={{
                  width: "36px",
                  height: "36px",
                  ...BAR_BTN,
                  border: "none",
                  color: btn.color,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: RADIUS.full,
                  transition: "all .15s cubic-bezier(.16,1,.3,1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = GLASS.btnHover.background;
                  e.currentTarget.style.color = accentColor;
                  e.currentTarget.style.transform = "scale(1.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = GLASS.btn.background;
                  e.currentTarget.style.color = btn.color;
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {btn.icon}
              </button>
            ))}
            {/* Play button — SQUARE, glass, glow */}
            <button
              onClick={onPlayPause}
              disabled={streamLoading}
              style={{
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: streamLoading ? "default" : "pointer",
                color: COLORS.black,
                borderRadius: "10px",
                transition: "transform .15s cubic-bezier(.16,1,.3,1), box-shadow .15s",
                ...GLASS.playBtn(accentColor),
              }}
              onMouseDown={(e) => {
                if (!streamLoading) {
                  // Apple: instant feedback on pointer-down, not release
                  e.currentTarget.style.transform = "scale(0.93)";
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseEnter={(e) => {
                if (!streamLoading) {
                  e.currentTarget.style.transform = "scale(1.08)";
                  e.currentTarget.style.boxShadow = `0 0 24px ${accentColor}ee, 0 0 48px ${accentColor}66`;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = SHADOWS.playBtn(accentColor);
              }}
            >
              {streamLoading ? (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" strokeDasharray="20 12">
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 12 12"
                      to="360 12 12"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              ) : isPlaying ? (
                Ic.pause(24)
              ) : (
                Ic.play(24)
              )}
            </button>
            {[
              { onClick: onNext, color: COLORS.iconActive, icon: Ic.next(18), title: "Siguiente" },
              {
                onClick: () => onPlayModeToggle("repeat"),
                color: repeatMode !== "off" ? safeAccentText(accentColor) : COLORS.iconDim,
                icon: repeatMode === "one" ? Ic.repeatOne(18) : Ic.repeat(18),
                title:
                  repeatMode === "off"
                    ? "Repetir desactivado"
                    : repeatMode === "one"
                      ? "Repetir una vez"
                      : "Repetir todo",
              },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={btn.onClick}
                title={btn.title}
                style={{
                  width: "36px",
                  height: "36px",
                  ...BAR_BTN,
                  border: "none",
                  color: btn.color,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: RADIUS.full,
                  transition: "all .15s cubic-bezier(.16,1,.3,1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = GLASS.btnHover.background;
                  e.currentTarget.style.color = accentColor;
                  e.currentTarget.style.transform = "scale(1.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = GLASS.btn.background;
                  e.currentTarget.style.color = btn.color;
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Volume + Crossfade + Dots + Lyrics ────────────────────────────── */}
        <div
          style={{
            width: "200px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          {/* Volume */}
          <div
            style={{ position: "relative" }}
            onMouseEnter={openVol}
            onMouseLeave={scheduleCloseVol}
          >
            <button
              ref={volBtnRef}
              style={{
                width: "36px",
                height: "36px",
                ...BAR_BTN,
                border: "none",
                color: volume > 0 ? COLORS.iconActive : COLORS.iconDimmer,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADIUS.full,
                transition: "all .15s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = GLASS.btnHover.background;
                e.currentTarget.style.color = accentColor;
                e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = GLASS.btn.background;
                e.currentTarget.style.color = volume > 0 ? COLORS.iconActive : COLORS.iconDimmer;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {volume > 0 ? Ic.vol(18) : Ic.volMute(18)}
            </button>
            {/* Popup vertical — SIEMPRE montado, animación fade+slide-up */}
            {createPortal(
              <VolSlider
                visible={showVolSlider}
                volPos={volPos}
                volume={volume}
                onVolume={onVolume}
                accentColor={accentColor}
                onMouseEnter={cancelCloseVol}
                onMouseLeave={scheduleCloseVol}
              />,
              document.body,
            )}
          </div>

          {/* Crossfade */}
          <div
            style={{ position: "relative" }}
            onMouseEnter={() => setCfHover(true)}
            onMouseLeave={() => setCfHover(false)}
          >
            <button
              ref={cfBtnRef}
              onClick={() => onCrossfadeDuration(crossfadeDuration > 0 ? 0 : 5)}
              style={{
                width: "36px",
                height: "36px",
                ...BAR_BTN,
                border: "none",
                color: crossfadeDuration > 0 ? safeAccentText(accentColor) : COLORS.iconDim,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADIUS.full,
                transition: "all .15s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = GLASS.btnHover.background;
                e.currentTarget.style.color = accentColor;
                e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = GLASS.btn.background;
                e.currentTarget.style.color =
                  crossfadeDuration > 0 ? safeAccentText(accentColor) : COLORS.iconDim;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {cfHover ? (
                <span style={{ fontSize: "10px", fontWeight: "800" }}>
                  {crossfadeDuration > 0 ? `${crossfadeDuration}s` : "Off"}
                </span>
              ) : (
                Ic.crossfade(20)
              )}
            </button>
            {createPortal(
              <div
                onMouseEnter={openCf}
                onMouseLeave={closeCf}
                style={{
                  position: "fixed",
                  bottom: `${cfPos.bottom}px`,
                  left: `${cfPos.left}px`,
                  transform: cfOpen ? "translateX(-50%) scale(1)" : "translateX(-50%) scale(0.85)",
                  opacity: cfOpen ? 1 : 0,
                  pointerEvents: cfOpen ? "all" : "none",
                  transition: TRANSITIONS.popup,
                  ...GLASS.popup,
                  borderRadius: RADIUS.card,
                  zIndex: 9999,
                  padding: "16px 16px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACING.gap.normal,
                  width: "200px",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      color: COLORS.iconActive,
                      letterSpacing: ".6px",
                      textTransform: "uppercase",
                    }}
                  >
                    Crossfade
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "800",
                      color: crossfadeDuration > 0 ? accentColor : COLORS.textMuted,
                    }}
                  >
                    {crossfadeDuration > 0 ? `${crossfadeDuration}s` : "Off"}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  value={crossfadeDuration}
                  onChange={(e) => onCrossfadeDuration(Number(e.target.value))}
                  style={{ width: "100%", cursor: "pointer", accentColor }}
                />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      color: COLORS.textMuted,
                      fontWeight: "600",
                    }}
                  >
                    Off
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      color: COLORS.textMuted,
                      fontWeight: "600",
                    }}
                  >
                    12s
                  </span>
                </div>
              </div>,
              document.body,
            )}
          </div>

          {/* Three dots — abre SongOptionsSheet */}
          {song && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenOptions();
              }}
              style={{
                width: "36px",
                height: "36px",
                ...BAR_BTN,
                border: "none",
                cursor: "pointer",
                color: COLORS.iconActive,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADIUS.full,
                flexShrink: 0,
                transition: "all .15s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = GLASS.btnHover.background;
                e.currentTarget.style.color = accentColor;
                e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = GLASS.btn.background;
                e.currentTarget.style.color = COLORS.iconActive;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {Ic.dots}
            </button>
          )}

          {/* Lyrics */}
          <button
            onClick={() => song && onLyrics()}
            title="Letras"
            style={{
              width: "36px",
              height: "36px",
              ...BAR_BTN,
              border: "none",
              cursor: song ? "pointer" : "default",
              color: lyricsOpen ? accentColor : song ? "rgba(255,255,255,.45)" : COLORS.textDimmest,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: RADIUS.full,
              transition: "all .15s cubic-bezier(.16,1,.3,1)",
            }}
            onMouseEnter={(e) => {
              if (song) {
                e.currentTarget.style.background = GLASS.btnHover.background;
                e.currentTarget.style.color = accentColor;
                e.currentTarget.style.transform = "scale(1.08)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = GLASS.btn.background;
              e.currentTarget.style.color = lyricsOpen
                ? accentColor
                : song
                  ? "rgba(255,255,255,.45)"
                  : COLORS.textDimmest;
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {Ic.mic(18)}
          </button>
        </div>
      </div>

      {/* ── Full-width Progress bar row — debajo de todo ──── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
        <span
          ref={progressTimeRef}
          data-testid="progress-time"
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: COLORS.progressTime,
            minWidth: "32px",
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: ".2px",
          }}
        />
        <div
          ref={progressBarRef}
          onClick={handleProgressClick}
          style={{
            flex: 1,
            height: "26px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "5px",
              borderRadius: "3px",
              background: COLORS.progressTrack,
              position: "relative",
              overflow: "visible",
              transition: "height .15s cubic-bezier(.16,1,.3,1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.height = "7px";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.height = "5px";
            }}
          >
            {/* Filled portion — el ancho lo escribe paintProgress (imperativo) */}
            <div
              ref={progressFillRef}
              data-testid="progress-fill"
              style={{
                height: "100%",
                borderRadius: "3px",
                width: "0%",
                background: `linear-gradient(90deg, ${accentColor}, ${withAlpha(accentColor, "cc")})`,
                transition: "width .15s linear",
                position: "relative",
                boxShadow: `0 0 10px ${accentColor}66`,
              }}
            />
            {/* Thumb — aparece en hover con escala suave */}
            <div
              ref={progressThumbRef}
              data-testid="progress-thumb"
              style={{
                position: "absolute",
                right: "100%",
                top: "50%",
                transform: "translate(50%, -50%) scale(0.8)",
                width: "14px",
                height: "14px",
                borderRadius: RADIUS.full,
                background: COLORS.white,
                boxShadow: `0 0 8px ${accentColor}aa, 0 2px 6px rgba(0,0,0,.4)`,
                transition:
                  "right .15s linear, transform .15s cubic-bezier(.16,1,.3,1), opacity .15s",
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: COLORS.progressTime,
            minWidth: "32px",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: ".2px",
          }}
        >
          {totalDisplay}
        </span>
      </div>
    </div>
  );
});
