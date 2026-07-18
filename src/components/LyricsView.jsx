import React, { useState, useEffect, useRef, useCallback } from "react";
import { FONT } from "../constants";
import {
  COLORS,
  RADIUS,
  SPACING,
  SHADOWS,
  TYPOGRAPHY,
  GLASS,
  safeAccentText,
  mutedAccent,
} from "../utils/theme";
import { api } from "../utils/api";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { SkeletonLyrics } from "./SkeletonLoader";
import { fmtTime } from "../utils/formatTime";
import { parseLrc } from "../utils/lrc";
import { useSettings } from "../contexts/useSettings";

// ── dnd-kit: Drag & Drop para reordenar cola ─────────────────────────────
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ═══════════════════════════════════════════════════════════════════════════
//  DragHandleSensor — PointerSensor personalizado que SOLO se activa
//  cuando el target del evento es el drag handle (.sw-drag-handle).
//  Esto evita que dnd-kit secuestre el gesture de swipe-to-delete.
//  ═══════════════════════════════════════════════════════════════════════════
class DragHandleSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown",
      handler: ({ nativeEvent: event }) => {
        // Solo activar si el click fue en el drag handle
        return event?.target?.closest(".sw-drag-handle") != null;
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  SortableQueueItem — Componente individual para drag & drop en la cola
//  ═══════════════════════════════════════════════════════════════════════════
function SortableQueueItem({
  song,
  _index,
  isCurrent,
  isPast,
  isUpcoming,
  isPrecached,
  editMode,
  accentColor,
  onPlaySong,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.videoId,
    disabled: !editMode,
  });

  // ⭐ Estado hover local — NO mutamos el DOM directamente
  //    para no interferir con el transform de dnd-kit.
  const [hovered, setHovered] = useState(false);

  // ⭐ CSS base: el transform SOLO viene de dnd-kit,
  //    nunca lo tocamos con onMouseEnter/onLeave.
  // ⭐ Transform SOLO durante arrastre activo.
  //    Cuando se elimina un item, dnd-kit devuelve transforms para reacomodar
  //    los items restantes (x !== 0), lo que los mueve horizontalmente.
  //    Solo queremos transform durante drag para evitar ese efecto.
  const baseTransform = isDragging ? CSS.Transform.toString(transform) : "none";

  // ⭐ Colores hover en edit mode: los manejamos vía estado, no vía DOM
  const bgColor = isDragging
    ? `${accentColor}30`
    : hovered && editMode
      ? `${accentColor}38`
      : isCurrent
        ? `${accentColor}45`
        : isPast
          ? `${accentColor}12`
          : `${accentColor}18`;

  const bdColor = isCurrent
    ? accentColor
    : hovered && editMode
      ? `${accentColor}66`
      : `${accentColor}25`;

  return (
    <div
      ref={setNodeRef}
      className="queue-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        borderRadius: "12px",
        cursor: editMode ? "grab" : "pointer",
        transition: `${transition || "background .12s, box-shadow .12s"}, transform 200ms ease`,
        transform: baseTransform,
        border: `1px solid ${bdColor}`,
        background: bgColor,
        opacity: isDragging ? 0.5 : isPast ? 0.65 : 1,
        position: "relative",
        boxShadow:
          hovered && editMode
            ? `0 4px 14px ${accentColor}44, 0 0 0 1px ${accentColor}55`
            : editMode
              ? `0 2px 8px ${accentColor}22, 0 0 0 1px ${accentColor}22`
              : "none",
      }}
      onClick={() => {
        if (!editMode) onPlaySong(song);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle (≡) — SOLO en edit mode */}
      {editMode && (
        <div
          className="sw-drag-handle"
          {...attributes}
          {...listeners}
          style={{
            cursor: "grab",
            padding: "6px 6px",
            borderRadius: "6px",
            border: `1px solid ${accentColor}33`,
            background: `${accentColor}15`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            flexShrink: 0,
            userSelect: "none",
            touchAction: "none",
            opacity: hovered ? 1 : 0.5,
            transition: "opacity .12s, background .12s, border-color .12s",
          }}
        >
          {/* 3 barras SVG con puntas redondeadas, más gruesas */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line
              x1="2"
              y1="3"
              x2="12"
              y2="3"
              stroke={safeAccentText(accentColor)}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="2"
              y1="7"
              x2="12"
              y2="7"
              stroke={safeAccentText(accentColor)}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="2"
              y1="11"
              x2="12"
              y2="11"
              stroke={safeAccentText(accentColor)}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {/* Pre-cache indicator */}
      {isPrecached && isUpcoming && (
        <div
          title="Precargada"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 6px #22c55e88",
            flexShrink: 0,
          }}
        />
      )}

      <div
        style={{
          width: "40px",
          height: "40px",
          flexShrink: 0,
          borderRadius: "8px",
          overflow: "hidden",
          background: "rgba(0,0,0,.3)",
        }}
      >
        <MusicCover
          thumbnails={song.thumbnails}
          src={song.thumbnail}
          displaySize={40}
          alt=""
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: "700",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "rgba(255,255,255,.9)",
          }}
        >
          {song.title}
        </div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "rgba(255,255,255,.5)",
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
            fontSize: "10px",
            fontWeight: "700",
            color: "rgba(255,255,255,.35)",
            flexShrink: 0,
          }}
        >
          {fmtTime(song.duration)}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LyricsSettingsModal — Modal de configuración rápida de letras
//  Inspirado en: Spotify (3-dots), Apple Music (inline controls),
//  Musixmatch (gear icon con font size, alignment, sync).
//  ═══════════════════════════════════════════════════════════════════════════
function LyricsSettingsModal({ accentColor, settings, updateSetting, onReload, onClose }) {
  const FONT_SIZES = [
    { key: "small", label: "Pequeño", px: "30px" },
    { key: "medium", label: "Mediano", px: "36px" },
    { key: "large", label: "Grande", px: "44px" },
  ];
  const ALIGN_OPTIONS = [
    { key: "left", label: "Izquierda", icon: "left" },
    { key: "center", label: "Centrado", icon: "center" },
  ];

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: `1px solid ${accentColor}22`,
  };

  const labelStyle = { fontSize: "13px", fontWeight: "700", color: "rgba(255,255,255,.8)" };
  const descStyle = {
    fontSize: "11px",
    fontWeight: "500",
    color: "rgba(255,255,255,.4)",
    marginTop: "2px",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "72px",
        right: "22px",
        zIndex: 100,
        width: "320px",
        borderRadius: "16px",
        ...GLASS.sheet,
        border: `1px solid ${accentColor}44`,
        boxShadow: `0 16px 48px rgba(0,0,0,.6), 0 0 0 1px ${accentColor}22, 0 0 40px ${accentColor}22`,
        padding: "18px 20px",
        animation: "sw-fade-slide-up .2s cubic-bezier(.16,1,.3,1) both",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontSize: "15px",
            fontWeight: "800",
            color: safeAccentText(accentColor),
            letterSpacing: ".3px",
            textTransform: "uppercase",
          }}
        >
          Letras
        </span>
        <button
          onClick={onClose}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: `1px solid ${accentColor}33`,
            background: `${accentColor}15`,
            color: safeAccentText(accentColor),
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${accentColor}30`;
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${accentColor}15`;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          {Ic.close}
        </button>
      </div>

      {/* ── Recargar letras ──────────────────────────────────────────── */}
      <button
        onClick={onReload}
        style={{
          ...rowStyle,
          width: "100%",
          background: "none",
          border: `1px solid ${accentColor}33`,
          borderRadius: "10px",
          padding: "10px 14px",
          marginTop: "12px",
          marginBottom: "14px",
          cursor: "pointer",
          fontFamily: FONT,
          display: "flex",
          gap: "10px",
          transition: "all .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${accentColor}20`;
          e.currentTarget.style.borderColor = accentColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.borderColor = `${accentColor}33`;
        }}
      >
        <div style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.reload}</div>
        <div style={{ textAlign: "left" }}>
          <div style={labelStyle}>Recargar letras</div>
          <div style={descStyle}>Re-buscar desde las fuentes disponibles</div>
        </div>
      </button>

      {/* ── Modo karaoke toggle ──────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Modo karaoke</div>
          <div style={descStyle}>Resaltado palabra por palabra sincronizado</div>
        </div>
        <button
          onClick={() => updateSetting("lyricsAnimate", !settings.lyricsAnimate)}
          style={{
            width: "46px",
            height: "26px",
            borderRadius: "13px",
            border: "none",
            cursor: "pointer",
            background: settings.lyricsAnimate ? accentColor : "rgba(255,255,255,.15)",
            position: "relative",
            transition: "background .2s",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: "3px",
              left: settings.lyricsAnimate ? "24px" : "3px",
              transition: "left .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: "0 1px 3px rgba(0,0,0,.3)",
            }}
          />
        </button>
      </div>

      {/* ── Tamaño de letra ──────────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Tamaño de letra</div>
          <div style={descStyle}>
            {FONT_SIZES.find((s) => s.key === settings.lyricsFontSize)?.px || "36px"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {FONT_SIZES.map((opt) => (
            <button
              key={opt.key}
              onClick={() => updateSetting("lyricsFontSize", opt.key)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: `1px solid ${settings.lyricsFontSize === opt.key ? accentColor : `${accentColor}33`}`,
                background:
                  settings.lyricsFontSize === opt.key ? `${accentColor}30` : "transparent",
                color: settings.lyricsFontSize === opt.key ? accentColor : "rgba(255,255,255,.6)",
                fontWeight: settings.lyricsFontSize === opt.key ? "800" : "600",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: FONT,
                transition: "all .15s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Alineación del texto ─────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Alineación</div>
          <div style={descStyle}>Posición del texto en pantalla</div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {ALIGN_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => updateSetting("lyricsTextPos", opt.key)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: `1px solid ${settings.lyricsTextPos === opt.key ? accentColor : `${accentColor}33`}`,
                background: settings.lyricsTextPos === opt.key ? `${accentColor}30` : "transparent",
                color: settings.lyricsTextPos === opt.key ? accentColor : "rgba(255,255,255,.6)",
                fontWeight: settings.lyricsTextPos === opt.key ? "800" : "600",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: FONT,
                transition: "all .15s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Auto-scroll toggle ───────────────────────────────────────── */}
      <div style={{ ...rowStyle, borderBottom: "none" }}>
        <div>
          <div style={labelStyle}>Auto-scroll</div>
          <div style={descStyle}>Sigue automáticamente la línea activa</div>
        </div>
        <button
          onClick={() =>
            updateSetting("lyricsScrollResume", settings.lyricsScrollResume > 0 ? 0 : 3)
          }
          style={{
            width: "46px",
            height: "26px",
            borderRadius: "13px",
            border: "none",
            cursor: "pointer",
            background:
              (settings.lyricsScrollResume ?? 3) > 0 ? accentColor : "rgba(255,255,255,.15)",
            position: "relative",
            transition: "background .2s",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: "3px",
              left: (settings.lyricsScrollResume ?? 3) > 0 ? "24px" : "3px",
              transition: "left .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: "0 1px 3px rgba(0,0,0,.3)",
            }}
          />
        </button>
      </div>

      {/* ── Animación de giro para el icono reload ────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function LyricsView({
  song,
  open,
  onClose,
  queue,
  queueIndex = -1,
  playSong,
  onSeek,
  progressRef,
  accentColor = "#a78bfa",
  lyricsCacheRef,
  onRemoveFromQueue,
  onMoveInQueue,
  streamCacheRef,
}) {
  const { settings, updateSetting } = useSettings();
  const [lyrics, setLyrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState(null);
  const [currentLine, setCurrentLine] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isSynced, setIsSynced] = useState(false);

  const lyricsContainerRef = useRef(null);
  const [bgLoaded, setBgLoaded] = useState(false); // HD background loaded
  const [bgSrc, setBgSrc] = useState(""); // fuente real del fondo (directa o proxy)
  const lineRefs = useRef({});
  const scrollTimerRef = useRef(null);
  const currentLineRef = useRef(-1);
  // ⭐ Auto-scroll latch: distingue el scroll PROGRAMÁTICO (scrollIntoView)
  //    del scroll MANUAL. Sin esto, el smooth scroll dispara onScroll y el
  //    auto-scroll se auto-cancela (seguimiento en "brincos" cada ~3s).
  const scrollLatchRef = useRef(0); // performance.now() del último scroll programático
  const lastScrolledLineRef = useRef(-1); // última línea centrada por auto-scroll
  const SCROLL_LATCH_MS = 800; // ventana en ms para ignorar el smooth scroll propio
  const [progressSec, setProgressSec] = useState(0);
  // ── Settings modal ──────────────────────────────────────────────────
  const [showLyricsSettings, setShowLyricsSettings] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0); // fuerza re-fetch
  // ⭐ Ref (no dispara re-render): marca que el próximo fetch debe saltarse
  //    el cache. Evita el doble disparo que causaba resetear reloadCounter.
  const skipCacheRef = useRef(false);

  // ── Helper compartido: procesar datos de letras (usado por cache y API) ─
  const processLyricsData = useCallback((data) => {
    if (data?.lyrics && Array.isArray(data.lyrics) && data.lyrics.length > 0) {
      const hasTimeTags = data.lyrics.some((l) => /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(l));
      if (hasTimeTags) {
        const parsed = parseLrc(data.lyrics);
        if (parsed.length > 0) {
          setLyrics(parsed);
          setIsSynced(true);
        } else {
          setLyrics(data.lyrics);
          setIsSynced(false);
        }
      } else {
        setLyrics(data.lyrics);
        setIsSynced(false);
      }
      setSource(data.source || "unknown");
    } else {
      setLyrics([]);
      setIsSynced(false);
    }
  }, []);

  // ── Fetch lyrics when song changes (con pre-cache) ──────────────────────
  //    reloadCounter se incrementa al presionar "Recargar" en el modal
  //    de configuración, forzando un re-fetch incluso si el cache existe.

  useEffect(() => {
    if (!open || !song?.videoId) return;
    setLyrics(null);
    setLoading(true);
    setCurrentLine(-1);
    currentLineRef.current = -1;
    setAutoScroll(true);
    setIsSynced(false);
    setProgressSec(0);
    lineRefs.current = {};
    lastScrolledLineRef.current = -1;
    scrollLatchRef.current = 0;

    const videoId = song.videoId;
    const title = song.title || "";
    const artist = song.artist || "";

    // Verificar cache primero (pre-cargado por usePlayer) — SOLO si no es reload forzado
    const cached = lyricsCacheRef?.current?.[videoId];
    if (cached?.lyrics && !skipCacheRef.current) {
      processLyricsData(cached);
      setLoading(false);
      return; // Usó cache, no necesita fetch
    }

    // No hay cache (o reload forzado), fetch normal
    api
      .get(
        `/lyrics/${videoId}?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
      )
      .then((data) => processLyricsData(data))
      .catch(() => setLyrics([]))
      .finally(() => {
        setLoading(false);
        // ⭐ Reset via REF (no state): no re-dispara el efecto → sin doble fetch
        //    ni re-uso de la cache vieja. El cache vuelve a funcionar en la
        //    próxima canción.
        skipCacheRef.current = false;
      });
  }, [
    open,
    song?.videoId,
    song?.title,
    song?.artist,
    processLyricsData,
    lyricsCacheRef,
    reloadCounter,
  ]);

  // ── Track progress for synced lyrics (cada 400ms) ────────────────────────

  useEffect(() => {
    if (!open || !isSynced) return;
    const interval = setInterval(() => {
      if (progressRef?.current !== undefined) {
        setProgressSec(progressRef.current);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [open, isSynced, progressRef]);

  // ── Auto-scroll to current synced line ─────────────────────────────────────

  useEffect(() => {
    if (!isSynced || !Array.isArray(lyrics) || lyrics.length === 0) return;

    let lo = 0,
      hi = lyrics.length - 1,
      activeIdx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (progressSec >= lyrics[mid].time) {
        activeIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (activeIdx !== currentLineRef.current) {
      currentLineRef.current = activeIdx;
      setCurrentLine(activeIdx);
    }

    if (
      autoScroll &&
      activeIdx >= 0 &&
      lyricsContainerRef.current &&
      activeIdx !== lastScrolledLineRef.current
    ) {
      // ⭐ Solo hacer scroll cuando cambia la línea activa (no cada tick):
      //    evita "saltos" constantes y micro-jitter del smooth scroll.
      lastScrolledLineRef.current = activeIdx;
      scrollLatchRef.current = performance.now();
      const el = lineRefs.current[activeIdx];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [progressSec, lyrics, isSynced, autoScroll]);

  // ── Reset scroll timer when user scrolls manually ──────────────────────────

  const handleManualScroll = useCallback(() => {
    if (!isSynced) return;
    // ⭐ Ignorar scrolls disparados por nuestro propio scrollIntoView
    //    (la animación smooth dispara onScroll de forma continua).
    if (performance.now() - scrollLatchRef.current < SCROLL_LATCH_MS) return;
    setAutoScroll(false);
    clearTimeout(scrollTimerRef.current);
    const delay = (settings.lyricsScrollResume || 3) * 1000;
    scrollTimerRef.current = setTimeout(() => {
      // Al reanudar, re-centrar en la línea activa actual
      lastScrolledLineRef.current = -1;
      setAutoScroll(true);
    }, delay);
  }, [isSynced, settings.lyricsScrollResume]);

  useEffect(() => {
    return () => {
      clearTimeout(scrollTimerRef.current);
      // Cancelar swipe animation si el componente se desmonta durante la animación
      if (swipeCleanupRef.current) {
        swipeCleanupRef.current.cancelled = true;
        if (swipeCleanupRef.current.timer) clearTimeout(swipeCleanupRef.current.timer);
        if (swipeCleanupRef.current.rafId) cancelAnimationFrame(swipeCleanupRef.current.rafId);
      }
      // ⭐ Restaurar selección de texto si el componente se desmonta durante un swipe activo
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    };
  }, []);

  // ── Click on line to seek ─────────────────────────────────────────────────

  const handleLineClick = useCallback(
    (time) => {
      if (!settings.lyricsClickSeek) return;
      if (onSeek && typeof time === "number") {
        onSeek(time);
        setProgressSec(time);
      } else if (song && playSong) {
        playSong(song, time);
      }
    },
    [settings.lyricsClickSeek, onSeek, playSong, song],
  );

  // ── Thumbnail para fondo — usar la más grande disponible para blur HD ────
  const thumbs = Array.isArray(song?.thumbnails) ? song.thumbnails : [];
  const sortedThumbs = thumbs.length
    ? [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))
    : [];
  // bgThumb: la MÁS GRANDE para CSS filter:blur() de alta calidad
  const bgThumb = sortedThumbs.length > 0 ? sortedThumbs[0]?.url : song?.thumbnail || "";

  // ── Pre-cargar la imagen de fondo para evitar latencia ────────────────
  //    Estrategia optimizada: proxy primero (ya pre-cachado en usePlayer),
  //    luego URL directa como fallback. El browser cache hace que sea
  //    instantáneo si la imagen ya fue precargada.
  useEffect(() => {
    setBgLoaded(false);
    setBgSrc("");
    if (!open || !bgThumb) return;
    let cancelled = false;
    const proxyUrl = `${api.base}/thumbnail-proxy?url=${encodeURIComponent(bgThumb)}`;

    // Try proxy first (should be pre-cached from usePlayer)
    const imgProxy = new Image();
    imgProxy.onload = () => {
      if (!cancelled) {
        setBgSrc(proxyUrl);
        setBgLoaded(true);
      }
    };
    imgProxy.onerror = () => {
      if (cancelled) return;
      // Fallback: try direct URL
      const imgDirect = new Image();
      imgDirect.onload = () => {
        if (!cancelled) {
          setBgSrc(bgThumb);
          setBgLoaded(true);
        }
      };
      imgDirect.onerror = () => {
        if (!cancelled) setBgLoaded(true);
      };
      imgDirect.src = bgThumb;
    };
    imgProxy.src = proxyUrl;
    return () => {
      cancelled = true;
    };
  }, [open, bgThumb]);

  // ── Edit Mode: Lock/Unlock toggle para drag & drop + swipe-to-delete ──
  const [editMode, setEditMode] = useState(false);

  // ── dnd-kit sensors (solo pointer para desktop, touch se maneja igual) ─
  const sensors = useSensors(
    useSensor(DragHandleSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  // ── Drag & Drop end handler ────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (active.id !== over.id) {
        const oldIndex = queue.findIndex((s) => s.videoId === active.id);
        const newIndex = queue.findIndex((s) => s.videoId === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          onMoveInQueue?.(oldIndex, newIndex);
        }
      }
    },
    [queue, onMoveInQueue],
  );

  // ── Swipe-to-delete (pointer events) — con React state ──────────────
  //    Usamos React state (swipeData) en vez de DOM mutations para:
  //    1. Evitar conflictos con dnd-kit (ambos usan pointer events)
  //    2. React reconcilia el style inline -> sin overwrites entre sistemas
  //    3. El swipe transform va en .sortable-content (padre de SortableQueueItem)
  //       y dnd-kit transform va en SortableQueueItem (hijo) — no hay conflicto
  const [swipeData, setSwipeData] = useState({ index: -1, delta: 0, exiting: false });
  const swipeCleanupRef = useRef(null); // cleanup de rAF/setTimeout en unmount

  // ⭐ Constantes de swipe: límites MUCHO más ajustados
  const SWIPE_MAX_NO_RESIST = 80; // Hasta aquí sin resistencia
  const SWIPE_MAX_DISPLAY = 140; // Tope asintótico absoluto (nunca se supera)
  const SWIPE_EXIT_THRESHOLD = 70; // Mínimo para considerar "eliminar"

  const handleSwipePointerDown = useCallback(
    (e, index) => {
      if (!editMode) return;
      if (e.target.closest(".sw-drag-handle")) return;

      // ⭐ Prevenir selección de texto durante el swipe
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";

      const row = e.currentTarget;
      const startX = e.clientX;
      row.setPointerCapture(e.pointerId);

      const bg = row.parentElement?.querySelector(".swipe-bg");
      let lastDelta = 0;

      const onMove = (me) => {
        // ⭐ Prevenir selección de texto en las letras durante el swipe
        me.preventDefault();

        const rawDelta = Math.max(0, me.clientX - startX);
        // ⭐ Resistencia asintótica MUCHO más agresiva (rubber-band):
        //    - Hasta SWIPE_MAX_NO_RESIST: sin resistencia
        //    - Después: se acerca a SWIPE_MAX_DISPLAY con exponencial agresiva
        //    El denominador pequeño (30) hace que la resistencia se sienta INMEDIATA
        const delta =
          rawDelta < SWIPE_MAX_NO_RESIST
            ? rawDelta
            : SWIPE_MAX_NO_RESIST +
              (SWIPE_MAX_DISPLAY - SWIPE_MAX_NO_RESIST) *
                (1 - Math.exp(-(rawDelta - SWIPE_MAX_NO_RESIST) / 30));
        lastDelta = delta;
        // Actualizar React state para que reconcilie el style del .sortable-content
        setSwipeData({ index, delta, exiting: false });
        if (bg) {
          bg.style.opacity = Math.min(1, delta / 80);
          bg.style.pointerEvents = delta > 40 ? "auto" : "none";
        }
      };

      const onUp = (ue) => {
        // ⭐ Restaurar selección de texto
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";

        row.releasePointerCapture(ue.pointerId);
        row.removeEventListener("pointermove", onMove);
        row.removeEventListener("pointerup", onUp);

        if (bg) {
          bg.style.transition = "opacity .15s";
          bg.style.opacity = 0;
          bg.style.pointerEvents = "none";
        }

        const isExit = lastDelta > SWIPE_EXIT_THRESHOLD;
        const exitTarget = Math.min(lastDelta + 40, SWIPE_MAX_DISPLAY);
        // ⭐ 3-step transition via React state (no DOM mutations):
        //    1. Activar TRANSITION en el style (pero mantener el mismo transform)
        //    2. Siguiente frame: cambiar el delta (0 para snap, 400 para exit)
        //       CSS transition anima el cambio suavemente
        //    3. Después de la animación: resetear swipeData
        setSwipeData({
          index,
          delta: lastDelta,
          exiting: false,
          snapBack: !isExit,
        });
        const rafId = requestAnimationFrame(() => {
          if (swipeCleanupRef.current?.cancelled) return;
          setSwipeData({
            index,
            delta: isExit ? exitTarget : 0,
            exiting: isExit,
            snapBack: !isExit,
          });
          const delay = isExit ? 380 : 220;
          swipeCleanupRef.current = {
            cancelled: false,
            timer: setTimeout(() => {
              if (swipeCleanupRef.current?.cancelled) return;
              if (isExit) onRemoveFromQueue?.(index);
              // ⭐ Reset completo
              setSwipeData({ index: -1, delta: 0, exiting: false });
            }, delay),
          };
        });
        swipeCleanupRef.current = { cancelled: false, rafId, timer: null };
      };

      row.addEventListener("pointermove", onMove);
      row.addEventListener("pointerup", onUp);
      row.addEventListener("pointercancel", onUp);
    },
    [editMode, onRemoveFromQueue],
  );

  const fontSizeMap = { small: "30px", medium: "36px", large: "44px" };
  const lyricsFontSize = fontSizeMap[settings.lyricsFontSize] || "34px";
  const textAlign = settings.lyricsTextPos === "center" ? "center" : "left";

  // ── Estilo glass compartido para botones superiores ──────────────────
  const btnGlass = {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: `1px solid ${COLORS.borderActive}`,
    background: `linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)`,
    boxShadow: SHADOWS.closeBtn,
    color: COLORS.settingsIcon,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all .2s cubic-bezier(.16,1,.3,1)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  };

  if (!open || !song) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        top: "32px",
        zIndex: 200,
        display: "flex",
        fontFamily: FONT,
        color: COLORS.textPrimary,
        animation: "sw-fade-slide-up .25s cubic-bezier(.16,1,.3,1) both",
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          BACKGROUND: Estilo Apple Music
          Capa 1: Portada con blur EXTREMO (100px) + saturación + brillo
          Capa 2: Gradiente oscuro overlay
          Capa 3: Gradiente de color extraído
          Capa 4: Textura noise
          ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          overflow: "hidden",
          // Base sólida OPACA — nunca transparente, siempre cubre el fondo
          background: `linear-gradient(160deg, color-mix(in srgb, ${accentColor} 50%, #08080f) 0%, #08080f 100%)`,
        }}
      >
        {/* Capa 0: Solid fallback — cubre TODO siempre, no importa si la imagen carga */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 30% 40%, ${accentColor}33 0%, #08080f 70%)`,
            opacity: 1,
          }}
        />

        {/* Capa 1: Fondo con CSS filter blur — se superpone sobre la base */}
        {bgThumb && (
          <div
            style={{
              position: "absolute",
              inset: "-5%",
              backgroundImage: bgLoaded && bgSrc ? `url(${bgSrc})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(40px) saturate(1.3) brightness(0.65)",
              transform: "scale(1.1)",
              opacity: bgLoaded ? 1 : 0,
              transition: "opacity .3s cubic-bezier(.16,1,.3,1)",
              contain: "paint",
            }}
          />
        )}

        {/* Capa 2: Overlay fusionado (oscuro + color) — SIEMPRE visible */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `
              linear-gradient(180deg, rgba(5,5,10,.5) 0%, rgba(5,5,10,.7) 50%, rgba(5,5,10,.9) 100%),
              radial-gradient(ellipse at 30% 40%, ${accentColor}33 0%, transparent 70%)
            `,
          }}
        />
      </div>

      {/* ── Botones superiores: 3-puntitos (config) + Cerrar ───────────── */}
      <div
        style={{
          position: "absolute",
          top: "18px",
          right: "22px",
          zIndex: 10,
          display: "flex",
          gap: "10px",
        }}
      >
        {/* 3-dots — abre modal de configuración de letras */}
        <button
          onClick={() => setShowLyricsSettings(true)}
          title="Configuración de letras"
          style={btnGlass}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${accentColor}55 0%, ${accentColor}22 100%)`;
            e.currentTarget.style.color = COLORS.textPrimary;
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.borderColor = `${accentColor}bb`;
            e.currentTarget.style.boxShadow = `0 0 16px ${accentColor}44, inset 0 1px 0 ${accentColor}33`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)";
            e.currentTarget.style.color = COLORS.settingsIcon;
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.borderColor = COLORS.borderActive;
            e.currentTarget.style.boxShadow = SHADOWS.closeBtn;
          }}
        >
          {Ic.dots}
        </button>
        {/* Cerrar */}
        <button
          onClick={onClose}
          title="Cerrar letras"
          style={btnGlass}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${accentColor}55 0%, ${accentColor}22 100%)`;
            e.currentTarget.style.color = COLORS.textPrimary;
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.borderColor = `${accentColor}bb`;
            e.currentTarget.style.boxShadow = `0 0 16px ${accentColor}44, inset 0 1px 0 ${accentColor}33`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)";
            e.currentTarget.style.color = COLORS.settingsIcon;
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.borderColor = COLORS.borderActive;
            e.currentTarget.style.boxShadow = SHADOWS.closeBtn;
          }}
        >
          {Ic.close}
        </button>
      </div>

      {/* ── Modal de configuración de letras ───────────────────────────── */}
      {showLyricsSettings && (
        <LyricsSettingsModal
          accentColor={accentColor}
          settings={settings}
          updateSetting={updateSetting}
          onReload={() => {
            setReloadCounter((c) => c + 1);
            skipCacheRef.current = true;
            setShowLyricsSettings(false);
          }}
          onClose={() => setShowLyricsSettings(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PANEL IZQUIERDO: Portada grande + Cola + Relacionadas
          ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: "380px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${accentColor}40`,
          padding: "30px 28px 20px",
          gap: "20px",
          overflow: "hidden",
          zIndex: 1,
          background: `linear-gradient(180deg, ${accentColor}30 0%, transparent 100%)`,
        }}
      >
        {/* Album art — CUADRADO completo */}
        <div
          style={{
            width: "100%",
            aspectRatio: "1",
            borderRadius: RADIUS.lyricsCover,
            overflow: "hidden",
            background: COLORS.surfaceCoverBg,
            boxShadow: SHADOWS.lyricsCover,
            flexShrink: 0,
            transition: "box-shadow .5s",
            maxHeight: "340px",
          }}
        >
          <MusicCover
            thumbnails={song.thumbnails}
            src={song.thumbnail}
            displaySize={380}
            alt=""
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Song info */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              ...TYPOGRAPHY.h2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: COLORS.textPrimary,
            }}
          >
            {song.title}
          </div>
          <div
            style={{
              fontSize: "15px",
              color: safeAccentText(accentColor),
              fontWeight: "700",
              marginTop: "4px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {song.artist}
          </div>
        </div>

        {/* Queue — con Lock/Unlock toggle y soporte Drag & Drop */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Header de la cola con botón candado */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <span
              style={{
                fontSize: "16px",
                fontWeight: "800",
                color: `${accentColor}dd`,
                letterSpacing: ".5px",
                textTransform: "uppercase",
              }}
            >
              Cola
            </span>
            <button
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? "Bloquear edición" : "Desbloquear edición"}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: `1px solid ${editMode ? `${mutedAccent(accentColor)}66` : `${mutedAccent(accentColor)}30`}`,
                background: editMode
                  ? `${mutedAccent(accentColor)}30`
                  : `${mutedAccent(accentColor)}10`,
                color: safeAccentText(accentColor),
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                transition: "all .2s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${mutedAccent(accentColor)}30`;
                e.currentTarget.style.color = safeAccentText(accentColor);
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = editMode
                  ? `${mutedAccent(accentColor)}30`
                  : `${mutedAccent(accentColor)}10`;
                e.currentTarget.style.color = safeAccentText(accentColor);
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {editMode ? Ic.unlock(18) : Ic.lock(18)}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0px",
            }}
            className="queue-scroll"
          >
            {/* DndContext + SortableContext para drag & drop */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={queue.map((s) => s.videoId)}
                strategy={verticalListSortingStrategy}
              >
                {queue.map((qSong, i) => {
                  const isCurrent = i === queueIndex;
                  const isPast = i < queueIndex;
                  const isUpcoming = i > queueIndex;
                  const isPrecached = !!streamCacheRef?.current?.[qSong.videoId];

                  return (
                    <div
                      key={qSong.videoId || `q-${i}`}
                      className="swipe-wrapper"
                      style={{
                        position: "relative",
                        overflow: "visible",
                        borderRadius: RADIUS.default,
                        marginBottom: "14px",
                      }}
                    >
                      {/* Fondo que se revela al hacer swipe (Quitar) */}
                      <div
                        className="swipe-bg"
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: `linear-gradient(90deg, transparent 40%, rgba(239,68,68,.88) 70%, rgba(239,68,68,.95))`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          padding: "0 18px",
                          borderRadius: RADIUS.default,
                          opacity: 0,
                          pointerEvents: "none",
                          transition: "opacity .15s",
                        }}
                      >
                        <span
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: "12px",
                            letterSpacing: ".5px",
                          }}
                        >
                          Quitar ✕
                        </span>
                      </div>

                      {/* Contenido arrastrable (sortable) y swipable */}
                      <div
                        className="sortable-content"
                        onPointerDown={(e) => handleSwipePointerDown(e, i)}
                        style={{
                          position: "relative",
                          zIndex: 1,
                          touchAction: editMode ? "pan-y" : "auto",
                          // ⭐ Prevenir selección de texto durante swipe activo
                          userSelect: swipeData.index === i ? "none" : "",
                          WebkitUserSelect: swipeData.index === i ? "none" : "",
                          // ⭐ Swipe transform via React state (no DOM mutation)
                          //    Así React reconcilia sin conflicto con dnd-kit
                          transform:
                            swipeData.index === i && swipeData.exiting
                              ? `translateX(${Math.min(swipeData.delta, SWIPE_MAX_DISPLAY)}px)`
                              : swipeData.index === i
                                ? `translateX(${swipeData.delta}px)`
                                : "",
                          opacity: swipeData.index === i && swipeData.exiting ? "0" : "",
                          transition:
                            swipeData.index === i && (swipeData.exiting || swipeData.snapBack)
                              ? swipeData.exiting
                                ? "transform .35s cubic-bezier(.16,1,.3,1), opacity .3s ease"
                                : "transform .25s cubic-bezier(.16,1,.3,1)"
                              : swipeData.index === i
                                ? "none"
                                : "",
                        }}
                      >
                        <SortableQueueItem
                          song={qSong}
                          index={i}
                          isCurrent={isCurrent}
                          isPast={isPast}
                          isUpcoming={isUpcoming}
                          isPrecached={isPrecached}
                          editMode={editMode}
                          accentColor={accentColor}
                          onPlaySong={playSong}
                        />
                      </div>
                    </div>
                  );
                })}
              </SortableContext>
            </DndContext>

            {queue.length === 0 && (
              <div
                style={{
                  ...TYPOGRAPHY.body,
                  color: COLORS.textMuted,
                  textAlign: "center",
                  paddingTop: "24px",
                }}
              >
                Sin canciones en cola
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PANEL DERECHO: Letras con word-wrap
          ════════════════════════════════════════════════════════════════════ */}
      <div
        ref={lyricsContainerRef}
        data-testid="lyrics-scroll"
        onScroll={handleManualScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: SPACING.lyrics.pad,
          display: "flex",
          justifyContent: textAlign === "center" ? "center" : "flex-start",
          zIndex: 1,
        }}
      >
        <div
          style={{
            maxWidth: "780px",
            width: "100%",
            textAlign,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {loading && <SkeletonLyrics fontSize={lyricsFontSize} accentColor={accentColor} />}

          {!loading && (!lyrics || (Array.isArray(lyrics) && lyrics.length === 0)) && (
            <div
              style={{
                fontSize: "20px",
                color: COLORS.textMuted,
                fontWeight: "700",
                textAlign: "center",
                paddingTop: "120px",
              }}
            >
              <div style={{ marginBottom: "24px", opacity: 0.3, transform: "scale(1.8)" }}>
                {Ic.mic}
              </div>
              Letras no encontradas para esta canción
            </div>
          )}

          {!loading && isSynced && Array.isArray(lyrics) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lyrics.map((line, i) => {
                const isActive = i === currentLine;
                // ⭐ Estado inicial (currentLine === -1, antes del 1er timestamp):
                //    primeras líneas visibles con estilo "cerca" en vez de todo apagado.
                const isNearActive = currentLine >= 0 ? Math.abs(i - currentLine) <= 2 : i <= 2;

                // ── Calcular qué palabra está iluminada ──────────────
                let activeWordIdx = -1;
                if (isActive && lyrics[i]) {
                  const lineStart = line.time;
                  const nextLine = i < lyrics.length - 1 ? lyrics[i + 1] : null;
                  const lineEnd = nextLine ? nextLine.time : lineStart + 5;
                  const lineDuration = Math.max(lineEnd - lineStart, 0.5);
                  const words = line.text.split(/\s+/).filter((w) => w.length > 0);
                  if (words.length > 0 && progressSec >= lineStart) {
                    const progressInLine = Math.min(
                      Math.max((progressSec - lineStart) / lineDuration, 0),
                      1,
                    );
                    // ⭐ Resaltado proporcional a CARACTERES (no uniforme por palabra):
                    //    el karaoke avanza según la longitud real de cada palabra.
                    const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
                    const targetChars = progressInLine * totalChars;
                    let acc = 0;
                    activeWordIdx = words.length - 1;
                    for (let wi = 0; wi < words.length; wi++) {
                      acc += words[wi].length;
                      if (targetChars < acc) {
                        activeWordIdx = wi;
                        break;
                      }
                    }
                  }
                }

                // ⭐ Font sizes sin multiplicación en CSS calc() (compat.)
                const basePx = parseFloat(lyricsFontSize) || 36;

                return (
                  <div
                    key={i}
                    data-testid={`lyric-line-${i}`}
                    ref={(el) => (lineRefs.current[i] = el)}
                    onClick={() => handleLineClick(line.time)}
                    style={{
                      fontSize: isActive
                        ? `${(basePx * 1.15).toFixed(1)}px`
                        : isNearActive
                          ? lyricsFontSize
                          : `${(basePx * 0.85).toFixed(1)}px`,
                      fontWeight: isActive ? "900" : isNearActive ? "700" : "500",
                      lineHeight: "2",
                      transition:
                        "opacity .4s cubic-bezier(.16,1,.3,1), transform .4s cubic-bezier(.16,1,.3,1), font-size .4s cubic-bezier(.16,1,.3,1)",
                      transform: isActive
                        ? "scale(1.06)"
                        : isNearActive
                          ? "scale(1)"
                          : "scale(0.92)",
                      cursor: settings.lyricsClickSeek ? "pointer" : "default",
                      padding: "6px 0",
                      transformOrigin: textAlign === "center" ? "center" : "left",
                      opacity: isActive ? 1 : isNearActive ? 0.8 : 0.55,
                    }}
                  >
                    {/* ── Karaoke palabra por palabra (solo si settings.lyricsAnimate está activo) ── */}
                    {isActive && activeWordIdx >= 0 && settings.lyricsAnimate ? (
                      /* ── Palabra por palabra (karaoke) ─────────── */
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {(() => {
                          let idx = -1;
                          return line.text.split(/(\s+)/).map((part, pi) => {
                            const isSpace = /^\s+$/.test(part);
                            if (!isSpace) idx++;
                            const isLit = !isSpace && idx <= activeWordIdx;
                            return (
                              <span
                                key={pi}
                                style={{
                                  transition: "color .2s ease",
                                  color: isLit ? COLORS.textPrimary : COLORS.textTertiary,
                                  textShadow: isLit ? `0 0 14px ${accentColor}bb` : "none",
                                }}
                              >
                                {part}
                              </span>
                            );
                          });
                        })()}
                      </span>
                    ) : (
                      <span
                        style={{
                          color: isActive
                            ? "#ffffff"
                            : isNearActive
                              ? "rgba(255,255,255,.75)"
                              : "rgba(255,255,255,.45)",
                          textShadow: isActive ? `0 0 18px ${accentColor}88` : "none",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {line.text || "\u00A0"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !isSynced && Array.isArray(lyrics) && lyrics.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {lyrics.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: lyricsFontSize,
                    fontWeight: "600",
                    color: COLORS.settingsIcon,
                    lineHeight: "1.8",
                    padding: "4px 0",
                  }}
                >
                  {typeof line === "string" ? line : line.text || line}
                </div>
              ))}
            </div>
          )}

          {source && !loading && (
            <div
              style={{
                marginTop: "50px",
                fontSize: "13px",
                color: `${accentColor}aa`,
                fontWeight: "600",
                textAlign: "center",
                letterSpacing: ".5px",
              }}
            >
              Letras vía {source}
            </div>
          )}
        </div>
      </div>

      {/* ── Animation keyframes + hover styles ────────────────────────── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
