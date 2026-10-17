import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import {
  getLyricsOverride,
  setLyricsOverride,
  clearLyricsOverride,
} from "../utils/lyricsOverrides";
import { getStoredLyrics, storeLyrics, clearStoredLyrics } from "../utils/lyricsCache";
import {
  VIDEO_PREP,
  VIDEO_PREP_INITIAL,
  altoPantalla,
  isVideoReady,
  normalizePrepareFrame,
  normalizeStatus,
  planVideoSync,
  videoFileUrl,
} from "../utils/lyricsVideo";
import { preblurToDataUrl } from "../utils/imageBlur";
import { codeFromReason } from "../utils/errorCodes";
import { StatusState } from "./StatusState";
import { useSettings } from "../contexts/useSettings";
import { useOverlayLayer, useOverlayActive } from "../hooks/useOverlayLayer";
import { useLiveRender } from "../hooks/useLiveRender";
import { useEscClose } from "../hooks/useEscape";
import { usePerformance } from "../contexts/PerformanceContext";

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

  // Sin borde de contorno: la jerarquía la da el material del player bar
  // (brillo superior interior + sombra suave). La pista actual lleva el glow
  // del acento en la sombra, nunca un aro de 1px.
  const rowShadow = isDragging
    ? `inset 0 1px 0 rgba(255,255,255,.08), 0 8px 20px rgba(0,0,0,.4)`
    : isCurrent
      ? `inset 0 1px 0 rgba(255,255,255,.08), 0 4px 16px ${accentColor}33`
      : hovered
        ? "inset 0 1px 0 rgba(255,255,255,.08), 0 6px 18px rgba(0,0,0,.35)"
        : "inset 0 1px 0 rgba(255,255,255,.06), 0 3px 10px rgba(0,0,0,.22)";

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
        background: bgColor,
        opacity: isDragging ? 0.5 : isPast ? 0.65 : 1,
        position: "relative",
        boxShadow: rowShadow,
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
            // Sin contorno: el asa se marca con el tinte del acento.
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
            transition: "opacity .12s, background .12s",
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
//  FloatingModal — Base compartida para modales flotantes centrados.
//  Liquid glass + backdrop overlay + cierre con click afuera o ESC.
// ═══════════════════════════════════════════════════════════════════════════
function FloatingModal({ title, icon, accentColor, onClose, children, width = "480px" }) {
  // Overlay a pantalla completa: pausa las animaciones infinitas de detrás
  // (ver useOverlayLayer y html.overlay-open en index.html).
  useOverlayLayer(true);
  // ESC cierra este modal, y SOLO si es la capa de encima (la pila de
  // useEscape resuelve si hay algo aún más arriba).
  useEscClose(true, onClose);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Sin velo oscuro y sin animar la opacidad: mientras el scrim está
        // por debajo de opacidad 1 es la backdrop root de la tarjeta y ésta
        // muestrea vacío — el blur(40px) no se ve hasta que algo invalida la
        // muestra (p. ej. un cambio de foco). El scrim solo gestiona el clic.
        background: "transparent",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width,
          maxHeight: "calc(100vh - 80px)",
          borderRadius: "20px",
          ...GLASS.sheet,
          // Sin contorno (el cristal de hoja trae un borde blanco de 1px): la
          // jerarquía la dan el cristal (blur(40px)) y la sombra, con el mismo
          // brillo interior que el material del player bar.
          border: "none",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.12), 0 24px 80px rgba(0,0,0,.7), 0 0 60px ${accentColor}18`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "sw-modal-in .3s cubic-bezier(.16,1,.3,1) both",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rim light shine */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "40%",
            background: "linear-gradient(180deg, rgba(255,255,255,.06) 0%, transparent 100%)",
            borderRadius: "20px 20px 0 0",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px 14px",
            // Sin sombra separadora entre cabecera y contenido: la jerarquía
            // la da el propio material.
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{icon}</span>
            <span
              style={{
                fontSize: "16px",
                fontWeight: "800",
                color: safeAccentText(accentColor),
                letterSpacing: ".3px",
              }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              // Sin contorno: mismo cristal que los botones del player bar.
              ...BAR_BTN_GLASS,
              color: safeAccentText(accentColor),
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background .15s, transform .15s",
              fontSize: "14px",
              fontWeight: "700",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = GLASS.btnHoverSoft.background;
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = GLASS.btn.background;
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {Ic.close}
          </button>
        </div>
        {/* Content */}
        <div
          style={{
            padding: "18px 22px 22px",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            position: "relative",
            zIndex: 1,
            scrollbarWidth: "thin",
            scrollbarColor: `${accentColor}33 transparent`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Material de botón del player bar (referencia de estilo) ───────────────
// Los botones de la barra usan el cristal de `GLASS.btn` —degradado, brillo
// interior y sombra— con el contorno anulado (`BAR_BTN` + `border: "none"`
// en PlayerBar). Los botones y filas de la pantalla de letras (hoja de
// configuración y sus modales) replican ese material, sin ningún contorno.
const BAR_BTN_GLASS = {
  background: GLASS.btn.background,
  border: "none",
  boxShadow: SHADOWS.closeBtn,
};

// ═══════════════════════════════════════════════════════════════════════════
//  SearchLyricsModal — Modal flotante para buscar letras por título/artista.
// ═══════════════════════════════════════════════════════════════════════════
function SearchLyricsModal({
  accentColor,
  song,
  settings,
  onSearch,
  onApplyResult,
  searchResults,
  searchLoading,
  onClose,
}) {
  const [title, setTitle] = useState(song?.title || "");
  const [artist, setArtist] = useState(song?.artist || "");

  const selectedSources = settings?.lyricsSources || ["lrclib", "ytmusic"];
  const fallbackEnabled = settings?.lyricsFallback !== false;
  const hasSources = selectedSources.length > 0;

  React.useEffect(() => {
    setTitle(song?.title || "");
    setArtist(song?.artist || "");
  }, [song?.title, song?.artist]);

  const inputSt = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    // Sin contorno: mismo material que el resto de botones —cristal, brillo
    // interior y sombra del player bar—; al enfocarlo se realza el cristal en
    // vez de encenderse un aro de acento.
    border: "none",
    background: GLASS.btn.background,
    boxShadow: SHADOWS.closeBtn,
    color: "rgba(255,255,255,.9)",
    fontSize: "14px",
    fontFamily: FONT,
    outline: "none",
    boxSizing: "border-box",
    transition: "background .2s",
  };

  return (
    <FloatingModal
      title="Buscar letras"
      icon={Ic.search}
      accentColor={accentColor}
      onClose={onClose}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la canción"
        style={inputSt}
        onFocus={(e) => {
          e.target.style.background = GLASS.btnHoverSoft.background;
        }}
        onBlur={(e) => {
          e.target.style.background = GLASS.btn.background;
        }}
      />
      <input
        type="text"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        placeholder="Artista"
        style={{ ...inputSt, marginTop: "10px" }}
        onFocus={(e) => {
          e.target.style.background = GLASS.btnHoverSoft.background;
        }}
        onBlur={(e) => {
          e.target.style.background = GLASS.btn.background;
        }}
      />
      <button
        onClick={() => {
          const sources = fallbackEnabled
            ? selectedSources.join(",")
            : selectedSources[0] || "lrclib";
          onSearch(title, artist, sources);
        }}
        disabled={searchLoading || (!title && !artist) || !hasSources}
        style={{
          width: "100%",
          padding: "12px",
          marginTop: "14px",
          borderRadius: "12px",
          // Material del player bar: cristal, brillo interior y sombra, SIN
          // contorno y sin el halo glow del acento que se veía raro.
          border: "none",
          background: hasSources ? GLASS.btn.background : "rgba(255,255,255,.04)",
          color: hasSources ? safeAccentText(accentColor) : "rgba(255,255,255,.35)",
          fontWeight: "800",
          fontSize: "14px",
          fontFamily: FONT,
          cursor: hasSources ? "pointer" : "not-allowed",
          opacity: searchLoading || (!title && !artist) ? 0.5 : 1,
          transition: "background .15s, opacity .15s",
          boxShadow: hasSources ? SHADOWS.closeBtn : "none",
        }}
        onMouseEnter={
          hasSources
            ? (e) => {
                e.currentTarget.style.background = GLASS.btnHoverSoft.background;
              }
            : undefined
        }
        onMouseLeave={
          hasSources
            ? (e) => {
                e.currentTarget.style.background = GLASS.btn.background;
              }
            : undefined
        }
      >
        {searchLoading ? "Buscando..." : !hasSources ? "Sin fuentes configuradas" : "Buscar"}
      </button>
      {!hasSources && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(234,179,8,.1)",
            border: "1px solid rgba(234,179,8,.25)",
            fontSize: "12px",
            color: "rgba(234,179,8,.9)",
            textAlign: "center",
            lineHeight: "1.4",
          }}
        >
          Activa al menos una fuente en <strong>Fuente de letras</strong> para poder buscar.
        </div>
      )}
      {searchResults && searchResults.length > 0 && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {searchResults.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onApplyResult(r);
                onClose();
              }}
              style={{
                // Material del player bar: cristal, brillo interior y sombra,
                // sin contorno (el aro de acento sobraba aquí).
                background: GLASS.btn.background,
                border: "none",
                borderRadius: "12px",
                padding: "12px 14px",
                cursor: "pointer",
                textAlign: "left",
                color: "rgba(255,255,255,.7)",
                fontSize: "13px",
                fontFamily: FONT,
                transition: "background .15s, transform .15s",
                // Sin backdrop-filter: cada resultado creaba su propia capa
                // blur apilada sobre la de la hoja (N blurs encadenados que se
                // re-ejecutaban con cada repintado de detrás).
                boxShadow: SHADOWS.closeBtn,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = GLASS.btnHoverSoft.background;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = GLASS.btn.background;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  fontWeight: "700",
                  color: "rgba(255,255,255,.9)",
                  marginBottom: "4px",
                  fontSize: "14px",
                }}
              >
                {r.title || "Sin título"}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,.5)", marginBottom: "6px" }}>
                {r.artist || "Desconocido"}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "700",
                    color: safeAccentText(accentColor),
                    background: `${accentColor}20`,
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  {r.source}
                </span>
                {r.synced && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "700",
                      color: "#4ade80",
                      background: "rgba(74,222,128,.15)",
                      padding: "2px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    Sincronizado
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {searchResults && searchResults.length === 0 && !searchLoading && (
        <div
          style={{
            marginTop: "16px",
            fontSize: "13px",
            color: "rgba(255,255,255,.35)",
            textAlign: "center",
            padding: "20px",
          }}
        >
          Sin resultados — intenta con otro nombre
        </div>
      )}
    </FloatingModal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SourceModal — Modal flotante para elegir fuente de letras con fallback.
// ═══════════════════════════════════════════════════════════════════════════
function SourceModal({ accentColor, settings, updateSetting, onClose }) {
  const SOURCES = [
    { key: "lrclib", label: "LRCLib", desc: "Sincronizado (LRC)", badge: "Sync" },
    { key: "ytmusic", label: "YTMusic", desc: "Texto plano", badge: null },
    { key: "genius", label: "Genius", desc: "Texto plano + URL", badge: null },
  ];

  const [selected, setSelected] = useState(settings.lyricsSources || ["lrclib", "ytmusic"]);
  const [fallback, setFallback] = useState(settings.lyricsFallback !== false);

  const toggleSource = (key) => {
    const next = selected.includes(key) ? selected.filter((s) => s !== key) : [...selected, key];
    setSelected(next);
    updateSetting("lyricsSources", next);
  };

  const toggleFallback = () => {
    const next = !fallback;
    setFallback(next);
    updateSetting("lyricsFallback", next);
  };

  return (
    <FloatingModal
      title="Fuente de letras"
      icon={Ic.music}
      accentColor={accentColor}
      onClose={onClose}
      width="400px"
    >
      <p
        style={{
          fontSize: "12px",
          color: "rgba(255,255,255,.45)",
          margin: "0 0 16px",
          lineHeight: "1.5",
        }}
      >
        Selecciona cuáles fuentes usar para buscar letras sincronizadas. El orden importa si el
        fallback está activado.
      </p>
      {SOURCES.map((s) => (
        <label
          key={s.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px",
            marginBottom: "8px",
            cursor: "pointer",
            borderRadius: "12px",
            // Sin contorno: material del player bar en las no seleccionadas
            // y tinte de acento en las activas.
            border: "none",
            background: selected.includes(s.key)
              ? `linear-gradient(135deg, ${accentColor}2e 0%, ${accentColor}10 100%)`
              : GLASS.btn.background,
            boxShadow: SHADOWS.closeBtn,
            transition: "background .2s",
          }}
        >
          <input
            type="checkbox"
            checked={selected.includes(s.key)}
            onChange={() => toggleSource(s.key)}
            style={{ display: "none" }}
          />
          <div
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "6px",
              border: `2px solid ${selected.includes(s.key) ? accentColor : "rgba(255,255,255,.2)"}`,
              background: selected.includes(s.key) ? accentColor : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background .15s, border-color .15s",
              flexShrink: 0,
            }}
          >
            {selected.includes(s.key) && (
              <span style={{ color: "var(--neon-fg)", fontSize: "12px", fontWeight: "900" }}>
                ✓
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "rgba(255,255,255,.9)" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,.4)", marginTop: "1px" }}>
              {s.desc}
            </div>
          </div>
          {s.badge && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "#4ade80",
                background: "rgba(74,222,128,.12)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              {s.badge}
            </span>
          )}
        </label>
      ))}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 14px",
          marginTop: "12px",
          borderRadius: "12px",
          border: "none",
          background: GLASS.btn.background,
          boxShadow: SHADOWS.closeBtn,
        }}
      >
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "rgba(255,255,255,.85)" }}>
            Fallback automático
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,.4)", marginTop: "2px" }}>
            Si una fuente falla, usa la siguiente en la lista
          </div>
        </div>
        <button
          onClick={toggleFallback}
          style={{
            width: "44px",
            height: "24px",
            borderRadius: "12px",
            border: "none",
            cursor: "pointer",
            background: fallback ? accentColor : "rgba(255,255,255,.15)",
            position: "relative",
            transition: "background .2s",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              // Pista encendida = acento: knob con fg derivado (nunca blanco fijo)
              background: fallback ? "var(--neon-fg)" : "#fff",
              position: "absolute",
              top: "3px",
              left: fallback ? "24px" : "3px",
              transition: "left .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: "0 1px 3px rgba(0,0,0,.3)",
            }}
          />
        </button>
      </div>
    </FloatingModal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  EditLyricsModal — Modal flotante para editar letras manualmente.
// ═══════════════════════════════════════════════════════════════════════════
function EditLyricsModal({ accentColor, lyrics, onEditLyrics, onClose }) {
  const [text, setText] = useState(() => {
    if (!Array.isArray(lyrics)) return "";
    return lyrics
      .map((l) => {
        if (typeof l === "object" && l.time !== undefined) {
          const m = Math.floor(l.time / 60);
          const s = (l.time % 60).toFixed(2).padStart(5, "0");
          return `[${m}:${s}]${l.text}`;
        }
        return typeof l === "string" ? l : l.text || "";
      })
      .join("\n");
  });

  const handleSave = () => {
    const lines = text.split("\n").filter((l) => l.trim());
    onEditLyrics(lines);
    onClose();
  };

  return (
    <FloatingModal
      title="Editar letras"
      icon={Ic.edit}
      accentColor={accentColor}
      onClose={onClose}
      width="540px"
    >
      <p
        style={{
          fontSize: "12px",
          color: "rgba(255,255,255,.45)",
          margin: "0 0 12px",
          lineHeight: "1.5",
        }}
      >
        Edita las letras directamente. Formato LRC soportado:{" "}
        <code
          style={{
            color: safeAccentText(accentColor),
            background: `${accentColor}15`,
            padding: "1px 5px",
            borderRadius: "4px",
            fontSize: "11px",
          }}
        >
          [mm:ss.xx]Texto
        </code>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{
          width: "100%",
          minHeight: "300px",
          // Sin contorno: mismo material que los botones (cristal, brillo
          // interior y sombra del player bar); el foco realza el cristal.
          background: GLASS.btn.background,
          border: "none",
          boxShadow: SHADOWS.closeBtn,
          borderRadius: "12px",
          padding: "14px",
          color: "rgba(255,255,255,.9)",
          fontSize: "13px",
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: "1.8",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          transition: "background .2s",
        }}
        onFocus={(e) => {
          e.target.style.background = GLASS.btnHoverSoft.background;
        }}
        onBlur={(e) => {
          e.target.style.background = GLASS.btn.background;
        }}
        placeholder="[00:12.00] Primera línea&#10;[00:16.50] Segunda línea"
      />
      <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "12px",
            // Material del player bar (cristal + brillo interior + sombra),
            // sin contorno y sin halo glow.
            ...BAR_BTN_GLASS,
            color: safeAccentText(accentColor),
            fontWeight: "800",
            fontSize: "14px",
            fontFamily: FONT,
            cursor: "pointer",
            transition: "background .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = GLASS.btnHoverSoft.background;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = GLASS.btn.background;
          }}
        >
          Guardar cambios
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "12px",
            ...BAR_BTN_GLASS,
            color: "rgba(255,255,255,.6)",
            fontWeight: "600",
            fontSize: "14px",
            fontFamily: FONT,
            cursor: "pointer",
            transition: "background .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = GLASS.btnHoverSoft.background;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = GLASS.btn.background;
          }}
        >
          Cancelar
        </button>
      </div>
    </FloatingModal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LyricsSettingsModal — Modal de configuración de letras
//  Secciones: búsqueda, fuente, edición, recarga, ajustes visuales.
//  ═══════════════════════════════════════════════════════════════════════════
function LyricsSettingsModal({
  accentColor,
  settings,
  updateSetting,
  onReload,
  song,
  source,
  lyrics,
  onSearch,
  onApplyResult,
  onEditLyrics,
  searchResults,
  searchLoading,
  onOpenSearch,
  onOpenSource,
  onOpenEdit,
}) {
  const FONT_SIZES = [
    { key: "small", label: "Pequeño", px: "30px" },
    { key: "medium", label: "Mediano", px: "36px" },
    { key: "large", label: "Grande", px: "44px" },
  ];
  const ALIGN_OPTIONS = [
    { key: "left", label: "Izq" },
    { key: "center", label: "Centro" },
  ];

  const [expandedSection, setExpandedSection] = useState(null);

  // Filas-botón de la hoja con el material del player bar (BAR_BTN_GLASS):
  // cristal, brillo interior y sombra, SIN contorno. Antes llevaban solo la
  // sombra suelta de SHADOWS.sepRow, que sin material se veía rara. El hover
  // solo realza el cristal.
  const rowCard = {
    borderRadius: "12px",
    ...BAR_BTN_GLASS,
    transition: "background .15s",
  };
  const rowCardIn = (e) => {
    e.currentTarget.style.background = GLASS.btnHoverSoft.background;
  };
  const rowCardOut = (e) => {
    e.currentTarget.style.background = GLASS.btn.background;
  };

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    marginBottom: "6px",
    ...rowCard,
  };

  const labelStyle = { fontSize: "12px", fontWeight: "700", color: "rgba(255,255,255,.8)" };
  const descStyle = {
    fontSize: "10px",
    fontWeight: "500",
    color: "rgba(255,255,255,.35)",
    marginTop: "1px",
  };

  const toggleStyle = (on) => ({
    width: "38px",
    height: "22px",
    borderRadius: "11px",
    border: "none",
    cursor: "pointer",
    background: on ? accentColor : "rgba(255,255,255,.15)",
    position: "relative",
    transition: "background .2s",
    flexShrink: 0,
  });

  const toggleKnob = (on) => ({
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    // Pista encendida = acento: knob con fg derivado (nunca blanco fijo)
    background: on ? "var(--neon-fg)" : "#fff",
    position: "absolute",
    top: "3px",
    left: on ? "20px" : "3px",
    transition: "left .2s cubic-bezier(.16,1,.3,1)",
    boxShadow: "0 1px 3px rgba(0,0,0,.3)",
  });

  const sectionBtnStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 12px",
    marginBottom: "6px",
    cursor: "pointer",
    userSelect: "none",
    ...rowCard,
  };

  // Chips de las opciones (tamaño, alineación): el mismo material que el
  // resto de botones —sin contorno— y el estado activo por relleno del acento
  // (texto con el fg derivado, nunca blanco fijo).
  const chipStyle = (on) => ({
    padding: "4px 9px",
    borderRadius: "6px",
    border: "none",
    background: on ? accentColor : BAR_BTN_GLASS.background,
    color: on ? "var(--neon-fg)" : "rgba(255,255,255,.5)",
    fontWeight: on ? "800" : "600",
    fontSize: "10px",
    cursor: "pointer",
    fontFamily: FONT,
    boxShadow: BAR_BTN_GLASS.boxShadow,
    transition: "background .15s, color .15s",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "72px",
        right: "22px",
        zIndex: 100,
        width: "320px",
        maxHeight: "calc(100vh - 100px)",
        borderRadius: "16px",
        ...GLASS.sheet,
        // Sin base opaca: el contraste lo da el propio cristal (blur(40px))
        // sobre el karaoke, como en los modales — con la capa oscura encima
        // el desenfoque no se veía. Sin contorno tampoco (el cristal de hoja
        // trae un borde blanco de 1px): la jerarquía la dan el material y la
        // sombra (nada de aros, como en el player bar).
        background: "linear-gradient(135deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%)",
        border: "none",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.12), 0 16px 48px rgba(0,0,0,.6), 0 0 40px ${accentColor}22`,
        padding: "14px 16px",
        animation: "sw-fade-slide-up .2s cubic-bezier(.16,1,.3,1) both",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "4px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: "800",
            color: safeAccentText(accentColor),
            letterSpacing: ".3px",
            textTransform: "uppercase",
          }}
        >
          Letras
        </span>
        {source && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: "600",
              color: `${accentColor}aa`,
              background: `${accentColor}15`,
              padding: "2px 7px",
              borderRadius: "5px",
              border: `1px solid ${accentColor}22`,
              textTransform: "uppercase",
            }}
          >
            {source}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div
        style={{
          overflowY: "auto",
          overflowX: "hidden",
          flex: 1,
          minHeight: 0,
          scrollbarWidth: "thin",
          scrollbarColor: `${accentColor}33 transparent`,
        }}
      >
        {/* ── Buscar letras ────────────────────────────────────── */}
        <div
          onClick={onOpenSearch}
          style={sectionBtnStyle}
          onMouseEnter={rowCardIn}
          onMouseLeave={rowCardOut}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.search}</span>
            <span style={labelStyle}>Buscar letras</span>
          </div>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)" }}>▶</span>
        </div>

        {/* ── Fuente de letras ─────────────────────────────────── */}
        <div
          onClick={onOpenSource}
          style={sectionBtnStyle}
          onMouseEnter={rowCardIn}
          onMouseLeave={rowCardOut}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.music}</span>
            <span style={labelStyle}>Fuente de letras</span>
          </div>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)" }}>▶</span>
        </div>

        {/* ── Editar letras ────────────────────────────────────── */}
        <div
          onClick={onOpenEdit}
          style={sectionBtnStyle}
          onMouseEnter={rowCardIn}
          onMouseLeave={rowCardOut}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.edit}</span>
            <span style={labelStyle}>Editar letras</span>
          </div>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)" }}>▶</span>
        </div>

        {/* ── Recargar ─────────────────────────────────────────── */}
        <div
          onClick={onReload}
          style={{ ...sectionBtnStyle, justifyContent: "flex-start", gap: "8px" }}
          onMouseEnter={rowCardIn}
          onMouseLeave={rowCardOut}
        >
          <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.reload}</span>
          <div>
            <div style={labelStyle}>Recargar letras</div>
            <div style={descStyle}>Re-buscar desde fuentes seleccionadas</div>
          </div>
        </div>

        {/* ── Apariencia ───────────────────────────────────────── */}
        <div
          onClick={() => setExpandedSection(expandedSection === "visual" ? null : "visual")}
          style={sectionBtnStyle}
          onMouseEnter={rowCardIn}
          onMouseLeave={rowCardOut}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.gear}</span>
            <span style={labelStyle}>Apariencia</span>
          </div>
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,.3)",
              transition: "transform .2s",
              transform: expandedSection === "visual" ? "rotate(180deg)" : "rotate(0)",
            }}
          >
            ▾
          </span>
        </div>
        {expandedSection === "visual" && (
          <div style={{ padding: "4px 0 4px" }}>
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Karaoke</div>
                <div style={descStyle}>Resaltado palabra por palabra</div>
              </div>
              <button
                onClick={() => updateSetting("lyricsAnimate", !settings.lyricsAnimate)}
                style={toggleStyle(settings.lyricsAnimate)}
              >
                <div style={toggleKnob(settings.lyricsAnimate)} />
              </button>
            </div>
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Girar fondo</div>
                <div style={descStyle}>Rotación lenta de la foto difuminada</div>
              </div>
              <button
                onClick={() => updateSetting("lyricsRotateBg", !settings.lyricsRotateBg)}
                style={toggleStyle(settings.lyricsRotateBg)}
              >
                <div style={toggleKnob(settings.lyricsRotateBg)} />
              </button>
            </div>
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Vídeo de fondo</div>
                <div style={descStyle}>Videoclip oficial en vez de la portada</div>
              </div>
              <button
                onClick={() => updateSetting("lyricsVideoBg", !settings.lyricsVideoBg)}
                style={toggleStyle(settings.lyricsVideoBg)}
              >
                <div style={toggleKnob(settings.lyricsVideoBg)} />
              </button>
            </div>
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Tamaño</div>
                <div style={descStyle}>
                  {FONT_SIZES.find((s) => s.key === settings.lyricsFontSize)?.px || "36px"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {FONT_SIZES.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateSetting("lyricsFontSize", opt.key)}
                    style={chipStyle(settings.lyricsFontSize === opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={rowStyle}>
              <div style={labelStyle}>Alineación</div>
              <div style={{ display: "flex", gap: "4px" }}>
                {ALIGN_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateSetting("lyricsTextPos", opt.key)}
                    style={chipStyle(settings.lyricsTextPos === opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...rowStyle, boxShadow: "none" }}>
              <div>
                <div style={labelStyle}>Auto-scroll</div>
                <div style={descStyle}>Seguir la línea activa</div>
              </div>
              <button
                onClick={() =>
                  updateSetting("lyricsScrollResume", settings.lyricsScrollResume > 0 ? 0 : 3)
                }
                style={toggleStyle((settings.lyricsScrollResume ?? 3) > 0)}
              >
                <div style={toggleKnob((settings.lyricsScrollResume ?? 3) > 0)} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  KaraokeWords — Iluminación palabra por palabra con glow sutil.
//  NO usa transform: scale() (causa overlap). Solo color + text-shadow.
// ═══════════════════════════════════════════════════════════════════════════
const KaraokeWords = React.memo(
  function KaraokeWords({ text, activeWordIdx, accentColor }) {
    let idx = -1;
    return text.split(/(\s+)/).map((part, pi) => {
      const isSpace = /^\s+$/.test(part);
      if (!isSpace) idx++;
      const isLit = !isSpace && idx <= activeWordIdx;
      const isActiveWord = !isSpace && idx === activeWordIdx;
      return (
        <span
          key={pi}
          style={{
            // Transición SOLO de color y peso (medido 03/10, sonda J): el
            // fade de color costó ~0 pts (19,9% vs 20,0% de control pareado
            // al mismo punto de la canción) y devuelve la suavidad palabra
            // a palabra («palabra a palabra no es suave»). SIN transición de
            // text-shadow: interpolar el blur re-rasterizaba el glow en cada
            // frame de la transición (doble radio −10,7 pts en la pareja K;
            // el radio de32px, −4 pts por sí solo en PD/PE).
            transition:
              "color .5s cubic-bezier(.25,.1,.25,1), font-weight .4s cubic-bezier(.25,.1,.25,1)",
            color: isLit ? "#ffffff" : COLORS.textTertiary,
            fontWeight: isActiveWord ? "900" : isLit ? "700" : "500",
            // Glow de un solo radio: el 32px aportaba poco halo y costaba
            // ~4 pts por sí solo (pareja PD/PE: 32,3% → 28,3%). El 16px
            // conserva el «glow sutil» del diseño.
            textShadow: isLit ? `0 0 16px ${accentColor}88` : "none",
          }}
        >
          {part}
        </span>
      );
    });
  },
  (prev, next) =>
    prev.text === next.text &&
    prev.activeWordIdx === next.activeWordIdx &&
    prev.accentColor === next.accentColor,
);

// ═══════════════════════════════════════════════════════════════════════════
//  LyricLine — Línea sincronizada memoizada.
//  Recibe props PRIMITIVAS + handlers estables, así React la salta cuando no
//  cambia. El reloj rAF solo re-renderiza cuando cambia la línea activa o su
//  palabra; el resto de la lista no se toca.
//  ═══════════════════════════════════════════════════════════════════════════
const LyricLine = React.memo(function LyricLine({
  index,
  text,
  time,
  isActive,
  isNearActive,
  lineDistance,
  activeWordIdx,
  lyricsFontSize,
  accentColor,
  animate,
  clickSeek,
  onLineClick,
  lineRefs,
  align,
}) {
  const basePx = parseFloat(lyricsFontSize) || 36;

  // ── Lente cilíndrico ligero: font-size + escala + opacidad (sin 3D compositing) ──
  //    Font-size: jerarquía de tamaño (afecta layout, sin overlap).
  //    scaleX/scaleY: los extremos se comprimen → curvatura tipo tubo.
  //    opacity: las lejanas se atenúan como profundidad de campo.
  const sizeFactor = isActive ? 1.3 : Math.max(0.78, 1 - 0.04 * lineDistance * lineDistance);
  const lineFontPx = basePx * sizeFactor;
  const scaleX = isActive ? 1 : Math.max(0.6, 1 - 0.05 * lineDistance);
  const scaleY = isActive ? 1 : Math.max(0.85, 1 - 0.015 * lineDistance);

  // ── Ventana de render: NO usar content-visibility ──────────────────────
  //    Probado y descartado con A/B empírico (misma canción, 5 aperturas
  //    con y sin la propiedad, monitor 2 Hz): `content-visibility: auto` en
  //    las líneas no activas PEORA el escenario real del karaoke — el
  //    scroll suave activa/desactiva líneas continuamente y cada activación
  //    corrige el tamaño estimado (contain-intrinsic-size) → layout extra +
  //    repintado. Medido: GPU 18.4% → 10.2%, layout 3139 → 2520 ms y un
  //    longtask de 60 ms de más. El montaje completo de las líneas es barato
  //    (medido: sin longtask en la apertura); el jank venía del pre-difuminado
  //    (resuelto con convertToBlob fuera del hilo principal).
  return (
    <div
      data-testid={`lyric-line-${index}`}
      ref={(el) => {
        lineRefs.current[index] = el;
      }}
      onClick={() => onLineClick(time)}
      style={{
        position: "relative",
        fontSize: `${lineFontPx.toFixed(1)}px`,
        fontWeight: isActive ? "900" : isNearActive ? "700" : "500",
        lineHeight: isActive ? "1.5" : "1.7",
        transition:
          "opacity .6s cubic-bezier(.25,.1,.25,1), font-size .65s cubic-bezier(.25,.1,.25,1), transform .65s cubic-bezier(.25,.1,.25,1)",
        transform: `scaleX(${scaleX}) scaleY(${scaleY})`,
        transformOrigin: align === "center" ? "center top" : "left top",
        cursor: clickSeek ? "pointer" : "default",
        padding: `${isActive ? 8 : 3}px 0`,
        opacity: isActive ? 1 : Math.max(0.15, 1 - 0.18 * lineDistance),
      }}
    >
      {/* ── Karaoke palabra por palabra (si lyricsAnimate está activo) ──── */}
      {isActive && activeWordIdx >= 0 && animate ? (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <KaraokeWords text={text} activeWordIdx={activeWordIdx} accentColor={accentColor} />
        </span>
      ) : (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            transition: "color .35s ease",
            color: isActive ? "#ffffff" : "rgba(255,255,255,.45)",
            textShadow: isActive ? `0 0 12px ${accentColor}66` : "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text || "\u00A0"}
        </span>
      )}
    </div>
  );
});

export function LyricsView({
  song,
  open,
  isPlaying = false,
  onClose,
  queue,
  queueIndex = -1,
  setQueueIndex = () => {},
  playSong,
  onSeek,
  progressRef,
  audioRef,
  accentColor = "#a78bfa",
  lyricsCacheRef,
  onRemoveFromQueue,
  onMoveInQueue,
  streamCacheRef,
}) {
  const { settings, updateSetting } = useSettings();
  const { visible, solidOn, sleeping, idle } = usePerformance();
  const [lyrics, setLyrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState(null);
  const [currentLine, setCurrentLine] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isSynced, setIsSynced] = useState(false);

  const lyricsContainerRef = useRef(null);
  const [bgLoaded, setBgLoaded] = useState(false); // HD background loaded
  const [bgSrc, setBgSrc] = useState(""); // fuente real del fondo (directa o proxy)
  const [bgBlurUrl, setBgBlurUrl] = useState(""); // fondo pre-difuminado en canvas (1x por canción)
  const lineRefs = useRef({});
  const scrollTimerRef = useRef(null);
  const currentLineRef = useRef(-1);
  // ⭐ Auto-scroll latch: distingue el scroll PROGRAMÁTICO (scrollIntoView)
  //    del scroll MANUAL. Sin esto, el smooth scroll dispara onScroll y el
  //    auto-scroll se auto-cancela (seguimiento en "brincos" cada ~3s).
  const scrollLatchRef = useRef(0); // performance.now() del último scroll programático
  const lastScrolledLineRef = useRef(-1); // última línea centrada por auto-scroll
  const SCROLL_LATCH_MS = 800; // ventana en ms para ignorar el smooth scroll propio
  // ── Estado del reloj rAF (frame-preciso) ──────────────────────────────
  //    `wordIdx` lo escribe el reloj SOLO al cruzar de palabra; los mirrors
  //    en ref evitan setState redundantes en cada frame.
  const [wordIdx, setWordIdx] = useState(-1);
  const wordIdxRef = useRef(-1); // último wordIdx escrito (mirror)
  const wordLineRef = useRef(-1); // línea a la que pertenece wordListRef
  const wordListRef = useRef(null); // palabras de esa línea (se recortan solo al cambiar)
  // ── Settings modal ──────────────────────────────────────────────────
  const [showLyricsSettings, setShowLyricsSettings] = useState(false);
  // ESC = «atrás» en la pantalla de letras: primero el popover de
  // configuración, después la propia pantalla. La pila de useEscClose
  // decide cuál está encima (y los modales internos, aún más).
  useEscClose(true, onClose);
  useEscClose(showLyricsSettings, () => setShowLyricsSettings(false));
  const [reloadCounter, setReloadCounter] = useState(0); // fuerza re-fetch
  // Código reportable del último fallo al traer la letra: sin esto, un error
  // de red se mostraba como "Letras no encontradas" (falso negativo).
  const [lyricsError, setLyricsError] = useState(null);
  // ⭐ Ref (no dispara re-render): marca que el próximo fetch debe saltarse
  //    el cache. Evita el doble disparo que causaba resetear reloadCounter.
  const skipCacheRef = useRef(false);

  // Recargar la letra desde cero (botón del estado de error y del modal).
  const reloadLyrics = useCallback(() => {
    clearLyricsOverride(song?.videoId);
    clearStoredLyrics(song?.videoId);
    setReloadCounter((c) => c + 1);
    skipCacheRef.current = true;
  }, [song?.videoId]);

  // ── Vídeo de fondo (ajuste «Vídeo de fondo» en ⋮ → Apariencia) ──────────
  //    Al abrir la pantalla de letras, si el ajuste está encendido se
  //    pregunta al backend si el vídeo está preparado y, si no, se prepara en
  //    segundo plano siguiendo su progreso. Mientras no esté (o si la canción
  //    no tiene videoclip) el fondo sigue siendo la portada.
  const [videoState, setVideoState] = useState(VIDEO_PREP_INITIAL);
  const videoRef = useRef(null);
  const prepareEsRef = useRef(null);
  // Token por apertura/canción: invalida los callbacks del vídeo anterior.
  const videoReqRef = useRef(0);
  const videoBg = !!settings.lyricsVideoBg;
  // «Sin videoclip» es un estado terminal sin progreso: se avisa unos
  // segundos y el aviso se retira solo (no hay nada que reintentar).
  const [avisoSinVideo, setAvisoSinVideo] = useState(false);

  // Píldora compartida de los avisos del vídeo (progreso, sin clip y error).
  const avisoVideoStyle = {
    position: "absolute",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "7px 14px",
    borderRadius: RADIUS.pill,
    border: `1px solid ${COLORS.borderActive}`,
    background: "rgba(10,10,16,.62)",
    backdropFilter: "blur(12px)",
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.caption,
    fontWeight: 700,
  };

  // Pedir la preparación (descarga + mux) y seguir su progreso por SSE.
  const prepareVideo = useCallback(
    (token) => {
      const videoId = song?.videoId;
      if (!videoId) return;
      const vigente = () => videoReqRef.current === token;
      setVideoState({ status: VIDEO_PREP.PREPARING, progress: 0, error: null });
      api
        .post(`/video/prepare/${videoId}?max_alto=${altoPantalla()}`)
        .then(() => {
          if (!vigente()) return;
          let es;
          try {
            es = new EventSource(`${api.base}/video/progress/${videoId}`);
          } catch {
            setVideoState({ status: VIDEO_PREP.ERROR, progress: 0, error: "sse" });
            return;
          }
          prepareEsRef.current = es;
          es.onmessage = (e) => {
            if (!vigente()) {
              es.close();
              return;
            }
            let data;
            try {
              data = JSON.parse(e.data);
            } catch {
              return; // frame no-JSON: seguir esperando el progreso
            }
            const next = normalizePrepareFrame(data);
            setVideoState(next);
            if (next.status !== VIDEO_PREP.PREPARING) es.close();
          };
          es.onerror = () => {
            es.close();
            if (vigente()) {
              setVideoState({ status: VIDEO_PREP.ERROR, progress: 0, error: "sse" });
            }
          };
        })
        .catch(() => {
          if (vigente()) {
            setVideoState({ status: VIDEO_PREP.ERROR, progress: 0, error: "request" });
          }
        });
    },
    [song?.videoId],
  );

  // El aviso «sin videoclip» se muestra al entrar y se va solo: el fondo
  // sigue siendo la portada y no hay nada que reintentar.
  useEffect(() => {
    if (!videoBg || videoState.status !== VIDEO_PREP.NO_VIDEO) {
      setAvisoSinVideo(false);
      return undefined;
    }
    setAvisoSinVideo(true);
    const t = setTimeout(() => setAvisoSinVideo(false), 5000);
    return () => clearTimeout(t);
  }, [videoBg, videoState.status]);

  // Reintento tras un error (descarga fallida, SSE caído o vídeo ilegible).
  const reintentarVideo = useCallback(() => {
    prepareVideo(videoReqRef.current);
  }, [prepareVideo]);

  useEffect(() => {
    const token = ++videoReqRef.current;
    prepareEsRef.current?.close();
    prepareEsRef.current = null;
    if (!open || !videoBg || !song?.videoId) {
      setVideoState(VIDEO_PREP_INITIAL);
      return;
    }
    setVideoState(VIDEO_PREP_INITIAL);
    api
      .get(`/video/status/${song.videoId}?max_alto=${altoPantalla()}`)
      .then((data) => {
        if (videoReqRef.current !== token) return;
        const next = normalizeStatus(data);
        setVideoState(next);
        // Sin preparar: se lanza solo (el ajuste ya está encendido).
        if (next.status === VIDEO_PREP.IDLE) prepareVideo(token);
      })
      .catch(() => {
        // Backend caído: se comporta como «sin preparar», se queda la portada.
        if (videoReqRef.current === token) {
          setVideoState({ ...VIDEO_PREP_INITIAL, status: VIDEO_PREP.IDLE });
        }
      });
  }, [open, videoBg, song?.videoId, prepareVideo]);

  // Al desmontar: cerrar el SSE y descartar los callbacks pendientes.
  useEffect(
    () => () => {
      videoReqRef.current += 1;
      prepareEsRef.current?.close();
    },
    [],
  );

  // `true` mientras un overlay a pantalla completa tapa las letras: el vídeo
  // se pausa (deja de decodificar) y el karaoke se detiene mientras tanto.
  const overlayOpen = useOverlayActive();

  // El `<audio>` de la app es el transporte y el reloj de referencia; el vídeo
  // lo sigue y va SIEMPRE mudo (el sonido es el de la app, nunca los dos).
  useEffect(() => {
    if (!open || !isVideoReady(videoState) || idle) return undefined;
    let rafId = 0;
    const tick = () => {
      const video = videoRef.current;
      const audio = audioRef?.current;
      if (!video) return;
      rafId = requestAnimationFrame(tick);
      // Con la ventana oculta o un modal encima el vídeo no se ve: se pausa
      // y se deja de planificar (ahorro de decodificación); al volver, el
      // mismo plan lo reanuda y re-sincroniza con el audio.
      const oculto = !visible || overlayOpen;
      const plan = oculto
        ? { play: false, seekTo: null }
        : planVideoSync({
            audioTime: audio?.currentTime,
            videoTime: video.currentTime,
            audioPaused: audio ? audio.paused : true,
            videoEnded: video.ended,
            videoDuration: video.duration,
            desfase: videoState.desfase ?? 0,
          });
      if (plan.play) {
        if (video.paused) {
          // jsdom no implementa play(): devuelve undefined. La guarda evita
          // romper el bucle; en el WebView real devuelve una promesa.
          const p = video.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      } else if (!video.paused) {
        video.pause();
      }
      if (plan.seekTo !== null) video.currentTime = plan.seekTo;
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [open, videoState, audioRef, visible, overlayOpen, idle]);

  // ── Búsqueda de letras ──────────────────────────────────────────────────
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [openSearchModal, setOpenSearchModal] = useState(false);
  const [openSourceModal, setOpenSourceModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);

  const handleSearchLyrics = useCallback((title, artist, sources) => {
    setSearchLoading(true);
    setSearchResults(null);
    api
      .get(
        `/lyrics/search?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&sources=${encodeURIComponent(sources)}`,
      )
      .then((data) => setSearchResults(data?.results || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, []);

  const handleApplySearchResult = useCallback(
    (result) => {
      if (result?.text) {
        const lines = result.text.split("\n").filter((l) => l.trim());
        // ⭐ Persistir la elección en localStorage: el overlay se DESMONTA al
        //    cerrar letras, así que sin esto la letra buscada se perdía y al
        //    reabrir volvía la original (cache/API).
        setLyricsOverride(song?.videoId, { lines, source: result.source || "unknown" });
        const hasTimeTags = lines.some((l) => /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(l));
        if (hasTimeTags) {
          const parsed = parseLrc(lines);
          if (parsed.length > 0) {
            setLyrics(parsed);
            setIsSynced(true);
          } else {
            setLyrics(lines);
            setIsSynced(false);
          }
        } else {
          setLyrics(lines);
          setIsSynced(false);
        }
        setSource(result.source || "unknown");
        setSearchResults(null);
      }
    },
    [song?.videoId],
  );

  const handleEditLyrics = useCallback(
    (lines) => {
      if (lines && lines.length > 0) {
        // Igual que la búsqueda: la edición también vive en localStorage,
        // si no se perdía al cerrar la pantalla de letras.
        setLyricsOverride(song?.videoId, { lines, source: "editado" });
        const hasTimeTags = lines.some((l) => /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(l));
        if (hasTimeTags) {
          const parsed = parseLrc(lines);
          if (parsed.length > 0) {
            setLyrics(parsed);
            setIsSynced(true);
          } else {
            setLyrics(lines);
            setIsSynced(false);
          }
        } else {
          setLyrics(lines);
          setIsSynced(false);
        }
        setSource("editado");
      }
    },
    [song?.videoId],
  );

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
    setLyricsError(null);
    setLoading(true);
    setCurrentLine(-1);
    currentLineRef.current = -1;
    setAutoScroll(true);
    setIsSynced(false);
    setWordIdx(-1);
    wordIdxRef.current = -1;
    wordLineRef.current = -1;
    wordListRef.current = null;
    lineRefs.current = {};
    lastScrolledLineRef.current = -1;
    scrollLatchRef.current = 0;

    // ⭐ La vista se REINICIA al cambiar de canción: el contenedor es el
    //    mismo (sin key) y mantiene el scrollTop de la anterior, así que la
    //    nueva letra arrancaba a media altura o abajo en vez del inicio.
    if (lyricsContainerRef.current) {
      lyricsContainerRef.current.scrollTop = 0;
    }

    const videoId = song.videoId;
    const title = song.title || "";
    const artist = song.artist || "";

    // ⭐ Letra elegida por el usuario (Buscar/Editar letras) — persistida en
    //    localStorage por videoId, sobrevive al desmontar el overlay. Solo la
    //    salta una recarga forzada ("Recargar letras" la limpia aparte).
    if (!skipCacheRef.current) {
      const override = getLyricsOverride(videoId);
      if (override) {
        processLyricsData({ lyrics: override.lines, source: override.source });
        setLoading(false);
        return;
      }
    }

    // Verificar cache primero (pre-cargado por usePlayer) — SOLO si no es reload forzado
    const cached = lyricsCacheRef?.current?.[videoId];
    if (cached?.lyrics && !skipCacheRef.current) {
      processLyricsData(cached);
      setLoading(false);
      return; // Usó cache, no necesita fetch
    }

    // Persistida en localStorage (sobrevive a recargas/reinicios): sin ella,
    // abrir la app sin internet dejaba la pantalla de letras vacía aunque
    // la canción se hubiera escuchado antes con conexión.
    if (!skipCacheRef.current) {
      const stored = getStoredLyrics(videoId);
      if (stored) {
        if (lyricsCacheRef?.current) lyricsCacheRef.current[videoId] = stored;
        processLyricsData(stored);
        setLoading(false);
        return;
      }
    }

    // No hay cache (o reload forzado), fetch normal
    api
      .get(
        `/lyrics/${videoId}?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
      )
      .then((data) => {
        // ⭐ Reflejar en el cache lo que se mostró: sin esto, "Recargar letras"
        //    dejaba la pantalla con la letra fresca pero al reabrir volvía la
        //    vieja que seguía cacheada.
        if (Array.isArray(data?.lyrics) && data.lyrics.length > 0) {
          if (lyricsCacheRef?.current) lyricsCacheRef.current[videoId] = data;
          // …y persistirla: la próxima apertura sin internet la sirve ya.
          storeLyrics(videoId, data);
        }
        processLyricsData(data);
      })
      .catch((err) => {
        // Fallo real (red/servidor): se marca con su código para que no se
        // confunda con "la canción no tiene letra".
        setLyricsError(err?.code || codeFromReason(err?.message));
        setLyrics([]);
      })
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

  // `overlayOpen` está declarado arriba, junto al sincronizador del vídeo:
  // el reloj de karaoke de abajo se detiene mientras haya un overlay.

  // ── Reloj de letras por rAF (frame-preciso) ───────────────────────────
  //    Antes: setInterval(400ms) sobre progressRef (que solo se actualiza
  //    con `timeupdate`, ~250ms) → hasta ~0.65s de retraso real: palabras y
  //    cambios de línea llegaban tarde ("el karaoke va lento"). Ahora: rAF
  //    muestreando `audio.currentTime` directamente (el mismo reloj que
  //    usan los renderizadores de karaoke serios; progressRef queda como
  //    fallback p.ej. en tests). setState SOLO cuando cambia la línea o la
  //    palabra → menos re-renders que el tick forzado de antes (~150/canción
  //    a cualquier hora) y encadenado exacto en el frame. En frames muertos
  //    solo corre matemática (sin render de React); el navegador pausa rAF
  //    al ocultar la ventana y `visible` lo frena si la ventana pierde el
  //    foco — al volver, el primer frame recalcula donde va la canción.

  useEffect(() => {
    // Con un overlay a pantalla completa montado (modal "Buscar letras",
    // Ajustes…) las letras quedan DETRÁS del scrim: los setState de línea y
    // palabra solo repintan un fondo invisible y re-ejecutan los
    // backdrop-filter de detrás en cada frame. El bucle se detiene entero y,
    // al cerrar el overlay, este efecto se re-programa, resetea wordLineRef y
    // el primer tick recalcula desde audio.currentTime (mismo patrón que
    // `visible` al ocultar la ventana).
    if (!open || !isSynced || !visible || overlayOpen || idle) return;
    if (!Array.isArray(lyrics) || lyrics.length === 0) return;
    wordLineRef.current = -1; // las letras pueden haber cambiado (reload)
    let rafId = 0;

    const readTime = () => {
      const t = audioRef?.current?.currentTime;
      if (typeof t === "number" && !Number.isNaN(t)) return t;
      return typeof progressRef?.current === "number" ? progressRef.current : 0;
    };

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const t = readTime();
      if (typeof t !== "number" || Number.isNaN(t)) return;

      // ── Línea activa: búsqueda binaria (~8 comparaciones por frame) ──
      let lo = 0,
        hi = lyrics.length - 1,
        idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (t >= lyrics[mid].time) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (idx !== currentLineRef.current) {
        currentLineRef.current = idx;
        setCurrentLine(idx);
      }

      // ── Palabra activa (cambia ~1-6 veces por segundo) ──
      let w = -1;
      if (idx >= 0) {
        if (wordLineRef.current !== idx) {
          wordLineRef.current = idx;
          wordListRef.current = lyrics[idx].text.split(/\s+/).filter((x) => x.length > 0);
        }
        const words = wordListRef.current;
        if (words.length > 0) {
          const lineStart = lyrics[idx].time;
          const lineEnd = idx < lyrics.length - 1 ? lyrics[idx + 1].time : lineStart + 5;
          const lineDuration = Math.max(lineEnd - lineStart, 0.5);
          const progressInLine = Math.min(Math.max((t - lineStart) / lineDuration, 0), 1);
          // ⭐ Resaltado proporcional a CARACTERES (no uniforme por palabra):
          //    el karaoke avanza según la longitud real de cada palabra.
          const totalChars = words.reduce((s, x) => s + x.length, 0) || 1;
          const targetChars = progressInLine * totalChars;
          let acc = 0;
          w = words.length - 1;
          for (let wi = 0; wi < words.length; wi++) {
            acc += words[wi].length;
            if (targetChars < acc) {
              w = wi;
              break;
            }
          }
        }
      }
      if (w !== wordIdxRef.current) {
        wordIdxRef.current = w;
        setWordIdx(w);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [open, isSynced, visible, overlayOpen, idle, lyrics, progressRef, audioRef]);

  // ── Auto-scroll to current synced line ─────────────────────────────────────

  useEffect(() => {
    if (!isSynced || !Array.isArray(lyrics) || lyrics.length === 0) return;
    if (!autoScroll || currentLine < 0 || !lyricsContainerRef.current) return;
    if (currentLine === lastScrolledLineRef.current) return;

    // ⭐ Solo hacer scroll cuando cambia la línea activa (no cada frame):
    //    evita "saltos" constantes y micro-jitter del smooth scroll.
    lastScrolledLineRef.current = currentLine;
    const el = lineRefs.current[currentLine];
    if (!el) return;

    // Banda central 30–70%: mientras la línea activa siga dentro, NO hay
    // scroll. Medido 03/10 (sonda K, pareado al mismo punto de la canción):
    // el glide en cada cambio de línea aportaba ~9 pts a cada pico (sin
    // scroll 24–34 vs control 33–44) — el reposicionado continuo era puro
    // repintado. Al salir de la banda, glide suave al centro (se conserva
    // el look centrado). Sin rectángulos medibles (jsdom, altura 0) →
    // centrar siempre, como antes.
    const cont = lyricsContainerRef.current;
    const r = el.getBoundingClientRect();
    const c = cont.getBoundingClientRect();
    if (c.height > 0) {
      const top = r.top - c.top;
      const bottom = r.bottom - c.top;
      if (top >= c.height * 0.3 && bottom <= c.height * 0.7) return;
    }
    scrollLatchRef.current = performance.now();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentLine, lyrics, isSynced, autoScroll]);

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
      // ⭐ Pintado optimista: el reloj rAF lee audio.currentTime en el
      //    siguiente frame (o progressRef si el audio aún no existe).
      if (progressRef && typeof time === "number") progressRef.current = time;
      if (onSeek && typeof time === "number") {
        onSeek(time);
      } else if (song && playSong) {
        playSong(song, time);
      }
    },
    [settings.lyricsClickSeek, onSeek, playSong, song, progressRef],
  );

  // ── Thumbnail para fondo — usar la más grande disponible para blur HD ────
  //    Referencia cruda como dep: estable mientras la canción no cambie (un
  //    `? : []` aquí recrearía el array en cada render y anularía el memo).
  const thumbs = song?.thumbnails;
  // useMemo: LyricsView re-renderiza con cada cambio de línea/palabra del
  // karaoke — el sort no debe repetirse en esas pasadas.
  const sortedThumbs = useMemo(() => {
    const list = Array.isArray(thumbs) ? thumbs : [];
    return list.length ? [...list].sort((a, b) => (b.width || 0) - (a.width || 0)) : [];
  }, [thumbs]);
  // Identidad estable para dnd-kit: solo cambia al reordenar la cola, no en
  // cada re-render del karaoke.
  const queueIds = useMemo(() => queue.map((s) => s.videoId), [queue]);
  // bgThumb: la MÁS GRANDE — es la fuente del pre-difuminado en canvas
  const bgThumb = sortedThumbs.length > 0 ? sortedThumbs[0]?.url : song?.thumbnail || "";
  // Fuente de la capa: pre-difuminado del canvas o, si falló (CORS), la
  // imagen grande con el filtro CSS de siempre (fallback con coste de GPU)
  const bgLayerSrc = bgBlurUrl || bgSrc;

  // ── Pre-cargar la imagen de fondo para evitar latencia ────────────────
  //    Estrategia optimizada: proxy primero (ya pre-cachado en usePlayer),
  //    luego URL directa como fallback. El browser cache hace que sea
  //    instantáneo si la imagen ya fue precargada.
  //    El proxy manda Access-Control-Allow-Origin: * → con crossOrigin el
  //    canvas queda limpio y se pre-difumina UNA VEZ por canción; la capa
  //    CSS se queda sin `filter` (medido: la cadena en CSS costaba ~1.8%
  //    GPU en Letras re-ejecutándose en cada repintado).
  useEffect(() => {
    setBgLoaded(false);
    setBgSrc("");
    setBgBlurUrl("");
    if (!open || !bgThumb) return;
    let cancelled = false;
    const proxyUrl = `${api.base}/thumbnail-proxy?url=${encodeURIComponent(bgThumb)}`;

    const succeed = (url, img) => {
      if (cancelled) return;
      setBgSrc(url);
      setBgLoaded(true);
      // El pre-difuminado en canvas (drawImage con filtros + toDataURL sobre
      // 960-1440 px) cuesta 30-100 ms sincronos: dentro del onload caia en el
      // episodio de apertura de Letras y dominaba el jank medido (picos de
      // 77-101 ms de longtask al abrir). Se difiere al primer idle para que el
      // primer paint de la vista pase limpio; mientras tanto la capa usa el
      // fallback de filtro CSS (ya se ve difuminado) → el swap es invisible.
      const run = async () => {
        if (cancelled) return;
        // preblurToDataUrl es async: dibuja en OffscreenCanvas y codifica con
        // convertToBlob FUERA del hilo principal (la codificación es el 99%
        // del coste: medido 147 ms síncronos a 1280² → hueco máximo de 18 ms
        // con convertToBlob → sin longtask en la apertura de Letras).
        const blurred = await preblurToDataUrl(img);
        if (!cancelled && blurred) setBgBlurUrl(blurred);
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 1500 });
      } else {
        setTimeout(run, 120); // jsdom/tests: sin requestIdleCallback
      }
    };
    const fail = () => {
      if (!cancelled) setBgLoaded(true);
    };

    // Try proxy first (should be pre-cached from usePlayer)
    const imgProxy = new Image();
    imgProxy.crossOrigin = "anonymous";
    imgProxy.onload = () => succeed(proxyUrl, imgProxy);
    imgProxy.onerror = () => {
      if (cancelled) return;
      // Fallback: try direct URL (sin crossOrigin: si el canvas queda
      // contaminado, succeed() deja bgBlurUrl vacío y manda el filtro CSS)
      const imgDirect = new Image();
      imgDirect.onload = () => succeed(bgThumb, imgDirect);
      imgDirect.onerror = fail;
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

  // El vídeo ocupa la capa 1 (en vez de la portada) cuando está listo.
  const videoActivo = !solidOn && !sleeping && isVideoReady(videoState);

  // Contenido EN VIVO: con el videoclip reproduciéndose o el karaoke
  // avanzando la pantalla sí se mueve, así que la app no entra en reposo
  // (app-idle) mientras eso ocurra. Con la canción en pausa la pantalla queda
  // quieta y el reposo entra igual que en cualquier otra vista — al volver,
  // el primer frame del karaoke y el sincronizador del vídeo releen
  // `audio.currentTime`.
  useLiveRender(open && isPlaying && !sleeping && (videoActivo || isSynced));

  // Cristal local (portada + cola, y botones de arriba) SOLO mientras el vídeo
  // es el fondo. Es lo que pide el ajuste «Vídeo de fondo»: con el clip
  // moviéndose detrás, esas piezas necesitan su propia hoja de cristal. Con la
  // portada difuminada de fondo NO hay cristal local y todo vuelve al aspecto
  // de siempre (el cristal cubre todo el fondo). Ver `videoActivo`.
  const videoGlass = videoActivo;

  // ── Estilo glass compartido para botones superiores ──────────────────
  // Sin contorno (igual que los botones del player bar): el material —
  // gradiente, brillo interior y sombra — da la jerarquía; el aro de 1px
  // sobraba sobre el vídeo y la portada.
  const btnGlass = {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "none",
    background: `linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)`,
    boxShadow: SHADOWS.closeBtn,
    color: COLORS.settingsIcon,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition:
      "background .2s cubic-bezier(.16,1,.3,1), color .2s cubic-bezier(.16,1,.3,1), " +
      "transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s cubic-bezier(.16,1,.3,1)",
    // Sin vídeo de fondo NO lleva backdrop-filter: el botón flota sobre la
    // portada difuminada, que es estática — medición GPU, dentro del 1.80% de
    // blur que costaban los backdrop. Con el vídeo de fondo sí hay movimiento
    // real que difuminar: el botón pasa a ser una hoja de cristal del sistema
    // (GLASS.close usa blur(6px)). En modo Rendimiento lo apaga
    // `perf-blur-off`/`perf-solid` por el selector [style*="backdrop-filter"].
    ...(videoGlass && {
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
    }),
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

        {/* Capa 1: Fondo pre-difuminado en canvas (sin filter en CSS) */}
        {/* app-sleep (≥15 s con la ventana oculta): se DESMONTA la capa →
            la textura 150vmax se libera (era el mayor consumidor de GPU:
            abrir Letras +341MB / cerrar −191MB medidos). Al volver a verse
            se remonta con la misma src → repaint inmediato, sin recarga. */}
        {/* Capa 1: el vídeo de fondo cuando está listo; si no (o si la canción
            no tiene videoclip) la portada difuminada de siempre. */}
        {!solidOn && !sleeping && videoActivo && (
          <video
            ref={videoRef}
            data-testid="lyrics-video"
            src={videoFileUrl(api.base, song?.videoId)}
            muted
            playsInline
            autoPlay
            preload="auto"
            // Si el vídeo no se puede reproducir se avisa (con reintento) en
            // vez de quedarse mudo en «sin preparar».
            onError={() =>
              setVideoState({ ...VIDEO_PREP_INITIAL, status: VIDEO_PREP.ERROR, error: "file" })
            }
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              contain: "paint",
            }}
          />
        )}

        {!solidOn && bgThumb && !sleeping && !videoActivo && (
          <div
            data-testid="lyrics-bg"
            style={{
              position: "absolute",
              // «Girar el fondo» (lyricsRotateBg): capa cuadrada centrada
              // con lado = diagonal del viewport — el lado mínimo que
              // cubre el rectángulo en TODOS los ángulos es √(w²+h²)
              // (basta la esquina más lejana: max |x·cosθ+y·senθ| = r);
              // ×1.02 de margen por redondeo. Sin la opción: 110% + scale.
              ...(settings.lyricsRotateBg
                ? {
                    // hypot() (CSS Values 4, Chrome 111+) calcula la
                    // diagonal en vivo con el resize. Antes era 150vmax
                    // (2880² a 1920×1079) = −39% de píxeles por paso:
                    // 720@diagonal 38,9% vs 720@150vmax 44,1% vs el
                    // 360@150vmax 40,4% que se envió la mañana del
                    // 03/10 (sistema 82–87%, mismas condiciones).
                    width: "calc(hypot(100vw, 100vh) * 1.02)",
                    height: "calc(hypot(100vw, 100vh) * 1.02)",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    animation: "sw-bg-spin 90s linear infinite",
                    // steps(720, jump-none): 0,5° cada 125 ms — 8 pasos/s;
                    // jump-none cierra en 360°=0° → bucle seamless. La
                    // rotación continua costaba +14–37 pts de GPU; el
                    // steps(360) (1°/250 ms) ahorraba ~9 pts PERO se
                    // VEÍA en pausas («se mira que avanza en pausas»,
                    // 03/10) → se revierte a 720, aceptado visualmente
                    // desde la mañana. La capa diagonal devuelve esos
                    // ~5 pts sin tocar la suavidad.
                    animationTimingFunction: "steps(720, jump-none)",
                  }
                : { inset: "-5%", transform: "scale(1.1)" }),
              backgroundImage: bgLoaded && bgLayerSrc ? `url(${bgLayerSrc})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
              // Filtro CSS solo como fallback si el pre-difuminado falló
              // (canvas contaminado por CORS, o proxy de miniaturas bloqueado
              // por el CSP: `img-src` no permitía 127.0.0.1:8765 hasta
              // 2026-10-03 — la app instalada mandaba SIEMPRE este filtro;
              // en el A/B pareado el filtro a 4 pasos/s no movió la aguja,
              // pero el flujo diseñado es la cadena aplicada una vez en
              // canvas, con textura pre-difuminada más ligera). En el flujo
              // normal la capa pinta sin `filter`.
              filter:
                bgLoaded && bgSrc && !bgBlurUrl
                  ? "blur(12px) saturate(1.2) brightness(0.7)"
                  : undefined,
              opacity: bgLoaded ? 1 : 0,
              transition: "opacity .3s cubic-bezier(.16,1,.3,1)",
              contain: "paint",
            }}
          />
        )}

        {/* Capa 2: Overlay fusionado (oscuro + color) — SIEMPRE visible.
            Con el vídeo de fondo el velo es más suave: si no, el vídeo no se
            vería (la portada, al ser una textura fija, aguanta más oscuridad). */}
        <div
          data-testid="lyrics-dim"
          style={{
            position: "absolute",
            inset: 0,
            // Solo capas de degradado (velo + tinte de acento): `backgroundImage`
            // es equivalente y sí conserva la lista completa de capas.
            backgroundImage: `
              linear-gradient(180deg, ${
                // Un punto más bajo que antes (.28/.44/.66): la letra gana
                // contraste sobre el movimiento del clip.
                videoActivo
                  ? "rgba(5,5,10,.36) 0%, rgba(5,5,10,.55) 50%, rgba(5,5,10,.78) 100%"
                  : "rgba(5,5,10,.5) 0%, rgba(5,5,10,.7) 50%, rgba(5,5,10,.9) 100%"
              }),
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
        {/* 3-dots — abre/cierra modal de configuración de letras */}
        <button
          onClick={() => setShowLyricsSettings((v) => !v)}
          title="Configuración de letras"
          style={btnGlass}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${accentColor}55 0%, ${accentColor}22 100%)`;
            e.currentTarget.style.color = COLORS.textPrimary;
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)";
            e.currentTarget.style.color = COLORS.settingsIcon;
            e.currentTarget.style.transform = "scale(1)";
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
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)";
            e.currentTarget.style.color = COLORS.settingsIcon;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          {Ic.close}
        </button>
      </div>

      {/* ── Avisos de la preparación del vídeo de fondo: progreso, «sin
              videoclip» y error con reintento. Sin ellos, los estados
              finales dejaban la portada sin explicación y el aviso de
              progreso parecía desaparecer de la nada. ──────────────────── */}
      {videoBg && videoState.status === VIDEO_PREP.PREPARING && (
        <div data-testid="lyrics-video-progress" style={avisoVideoStyle}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: accentColor,
            }}
          />
          Preparando el vídeo… {Math.round(videoState.progress)}%
        </div>
      )}

      {videoBg && videoState.status === VIDEO_PREP.NO_VIDEO && avisoSinVideo && (
        <div data-testid="lyrics-video-sin-clip" style={avisoVideoStyle}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: accentColor,
            }}
          />
          Esta canción no tiene videoclip
        </div>
      )}

      {videoBg && videoState.status === VIDEO_PREP.ERROR && (
        <div data-testid="lyrics-video-error" style={avisoVideoStyle}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: accentColor,
            }}
          />
          No se pudo preparar el vídeo
          <button
            type="button"
            data-testid="lyrics-video-retry"
            onClick={reintentarVideo}
            style={{
              ...TYPOGRAPHY.caption,
              fontWeight: 700,
              color: accentColor,
              background: "transparent",
              border: `1px solid ${COLORS.borderActive}`,
              borderRadius: RADIUS.pill,
              padding: "2px 10px",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── Modal de configuración de letras ───────────────────────────── */}
      {showLyricsSettings && (
        <LyricsSettingsModal
          accentColor={accentColor}
          settings={settings}
          updateSetting={updateSetting}
          onReload={() => {
            // Recargar = volver a la fuente automática: descarta la letra
            // elegida/buscada por el usuario para esta canción.
            reloadLyrics();
            setShowLyricsSettings(false);
          }}
          song={song}
          source={source}
          lyrics={lyrics}
          onSearch={handleSearchLyrics}
          onApplyResult={handleApplySearchResult}
          onEditLyrics={handleEditLyrics}
          searchResults={searchResults}
          searchLoading={searchLoading}
          onOpenSearch={() => setOpenSearchModal(true)}
          onOpenSource={() => setOpenSourceModal(true)}
          onOpenEdit={() => setOpenEditModal(true)}
        />
      )}

      {openSearchModal && (
        <SearchLyricsModal
          accentColor={accentColor}
          song={song}
          settings={settings}
          onSearch={handleSearchLyrics}
          onApplyResult={handleApplySearchResult}
          searchResults={searchResults}
          searchLoading={searchLoading}
          onClose={() => setOpenSearchModal(false)}
        />
      )}
      {openSourceModal && (
        <SourceModal
          accentColor={accentColor}
          settings={settings}
          updateSetting={updateSetting}
          onClose={() => setOpenSourceModal(false)}
        />
      )}
      {openEditModal && (
        <EditLyricsModal
          accentColor={accentColor}
          lyrics={lyrics}
          onEditLyrics={handleEditLyrics}
          onClose={() => setOpenEditModal(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PANEL IZQUIERDO: Portada grande + Cola + Relacionadas
          ════════════════════════════════════════════════════════════════════ */}
      <div
        data-testid="lyrics-panel"
        style={{
          width: "380px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          padding: "30px 28px 20px",
          gap: "20px",
          overflow: "hidden",
          zIndex: 1,
          // Sin línea separadora: la jerarquía la da el material, como en el
          // player bar (border none + inset highlight + sombra).
          // Con el vídeo de fondo la portada y la cola van sobre una hoja de
          // cristal (Liquid Glass): el clip se mueve detrás y, sin
          // difuminarlo, la portada y la lista no se leerían. Sin vídeo no hay
          // blur (el fondo estático no lo necesita), pero sí el mismo material
          // —tinte de acento, brillo superior y sombra— sobre la portada
          // difuminada que cubre todo el fondo.
          // Con vídeo, blur de 12px (no 20px): es el pase caro de la pantalla
          // de letras porque se re-ejecuta en cada frame del clip, y a 12px,
          // con el velo encima y un poco más de tinte (.15/.07), la lectura
          // es la misma —el foco lo pone el material, no el radio.
          ...(videoGlass
            ? {
                background:
                  "linear-gradient(135deg, rgba(255,255,255,.15) 0%, rgba(255,255,255,.07) 100%)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.15), 0 24px 80px rgba(0,0,0,.5)",
              }
            : {
                background: `linear-gradient(180deg, ${accentColor}30 0%, transparent 100%)`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 18px 50px rgba(0,0,0,.35)",
              }),
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
                // Material del player bar, sin contorno: el candado bloqueado
                // es cristal y desbloqueado (editMode) tinte del acento.
                ...BAR_BTN_GLASS,
                background: editMode ? `${mutedAccent(accentColor)}30` : BAR_BTN_GLASS.background,
                color: safeAccentText(accentColor),
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                transition:
                  "background .2s cubic-bezier(.16,1,.3,1), color .2s cubic-bezier(.16,1,.3,1), " +
                  "transform .2s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${mutedAccent(accentColor)}30`;
                e.currentTarget.style.color = safeAccentText(accentColor);
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = editMode
                  ? `${mutedAccent(accentColor)}30`
                  : BAR_BTN_GLASS.background;
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
              <SortableContext items={queueIds} strategy={verticalListSortingStrategy}>
                {queue.map((qSong, i) => {
                  const isCurrent = i === queueIndex;
                  const isPast = i < queueIndex;
                  const isUpcoming = i > queueIndex;
                  // Las claves del cache llevan la calidad (id|calidad):
                  // basta con una entrada cacheada para este video.
                  const sc = streamCacheRef?.current;
                  const isPrecached = !!(
                    sc &&
                    Object.keys(sc).some(
                      (k) => k === qSong.videoId || k.startsWith(`${qSong.videoId}|`),
                    )
                  );

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
                          onPlaySong={(s) => {
                            // Clic en la COLA: saltar al índice de la pista
                            // dentro de la cola viva y marcar fromQueue para
                            // que playSong NO reconstruya la radio (la cola
                            // del panel es la cola que ya está montada).
                            const i = queue.findIndex((x) => x?.videoId === s?.videoId);
                            if (i >= 0) setQueueIndex(i);
                            playSong(s, 0, true);
                          }}
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
          // ⭐ Las letras sincronizadas no deben poder seleccionarse: al
          //    mantener el clic y arrastrar salía el subrayado azul.
          userSelect: "none",
        }}
      >
        <div
          style={{
            // ⭐ Izquierda: el texto aprovecha más rango a la derecha.
            //    Centrado: mantiene su ancho actual (hasta 960px).
            maxWidth: textAlign === "center" ? "min(100%, 960px)" : "min(100%, 1200px)",
            width: "100%",
            textAlign,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {loading && <SkeletonLyrics fontSize={lyricsFontSize} accentColor={accentColor} />}

          {/* Fallo al traer la letra: estado de error con CÓDIGO + Recargar
              (separate de "Letras no encontradas": eso es ausencia real). */}
          {!loading && lyricsError && (
            <StatusState
              compact
              code={lyricsError}
              onRetry={reloadLyrics}
              accentColor={accentColor}
            />
          )}

          {!loading &&
            !lyricsError &&
            (!lyrics || (Array.isArray(lyrics) && lyrics.length === 0)) && (
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
                  {Ic.mic(22)}
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

                // ── Distancia al activo (para efecto lente / profundidad) ──
                //    Clamp en 10: TODAS las fórmulas de estilo de LyricLine
                //    (sizeFactor, scaleX, scaleY, opacity) saturan en d≥10,
                //    así que el valor es pixel-idéntico más allá de ahí y el
                //    memo puede saltarse las líneas lejanas en cada salto de
                //    línea (sin clamp, N props cambiaban y se re-renderizaba
                //    la lista entera 1-6×/s durante la reproducción).
                const rawDistance =
                  currentLine >= 0 ? Math.abs(i - currentLine) : Math.max(0, 2 - i);
                const lineDistance = Math.min(rawDistance, 10);

                // ── Palabra iluminada: la escribe el reloj rAF; solo la
                //    línea activa la recibe (el resto, -1 = apagado) ──
                const activeWordIdx = isActive ? wordIdx : -1;

                // ⭐ LyricLine memoizada: con props primitivas y handlers
                //    estables, en cada frame SOLO cambia la línea activa.
                return (
                  <LyricLine
                    key={i}
                    index={i}
                    text={line.text}
                    time={line.time}
                    isActive={isActive}
                    isNearActive={isNearActive}
                    lineDistance={lineDistance}
                    activeWordIdx={activeWordIdx}
                    lyricsFontSize={lyricsFontSize}
                    accentColor={accentColor}
                    animate={settings.lyricsAnimate}
                    clickSeek={settings.lyricsClickSeek}
                    onLineClick={handleLineClick}
                    lineRefs={lineRefs}
                    align={textAlign}
                  />
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

      {/* ── Keyframes (sw-modal-in / sw-bg-spin) → index.html ─────────────
          ANTES vivían aquí en un elemento style de React. La CSP de Tauri
          añade un nonce aleatorio por carga a `style-src` (y con nonce se
          anula 'unsafe-inline'), así que un style runtime quedaba BLOQUEADO
          con `sheet: null`: sw-bg-spin nunca se parseaba y «el fondo de
          Letras no giraba» aunque el toggle estuviera activo. Las keyframes
          están en el bloque de estilos de index.html, que sí recibe el nonce
          al servirse. Regresión vigilada por LyricsView.test.jsx. */}
    </div>
  );
}
