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
import { preblurToDataUrl } from "../utils/imageBlur";
import { useSettings } from "../contexts/useSettings";
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
//  FloatingModal — Base compartida para modales flotantes centrados.
//  Liquid glass + backdrop overlay + cierre con click afuera o ESC.
// ═══════════════════════════════════════════════════════════════════════════
function FloatingModal({ title, icon, accentColor, onClose, children, width = "480px" }) {
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "sw-fade-in .2s ease both",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width,
          maxHeight: "calc(100vh - 80px)",
          borderRadius: "20px",
          ...GLASS.sheet,
          border: `1px solid ${accentColor}44`,
          boxShadow: `0 24px 80px rgba(0,0,0,.7), 0 0 0 1px ${accentColor}22, 0 0 60px ${accentColor}18`,
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
            borderBottom: `1px solid ${accentColor}18`,
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
              border: `1px solid ${accentColor}33`,
              background: `${accentColor}12`,
              color: safeAccentText(accentColor),
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s",
              fontSize: "14px",
              fontWeight: "700",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${accentColor}30`;
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${accentColor}12`;
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
    border: `1px solid ${accentColor}33`,
    background: "rgba(0,0,0,.25)",
    color: "rgba(255,255,255,.9)",
    fontSize: "14px",
    fontFamily: FONT,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color .2s",
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
          e.target.style.borderColor = accentColor;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = `${accentColor}33`;
        }}
      />
      <input
        type="text"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        placeholder="Artista"
        style={{ ...inputSt, marginTop: "10px" }}
        onFocus={(e) => {
          e.target.style.borderColor = accentColor;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = `${accentColor}33`;
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
          border: "none",
          background: hasSources
            ? `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 80%, white))`
            : "rgba(255,255,255,.1)",
          // Degradado del acento → primer plano dinámico (nunca blanco fijo)
          color: hasSources ? "var(--neon-fg)" : "rgba(255,255,255,.35)",
          fontWeight: "800",
          fontSize: "14px",
          fontFamily: FONT,
          cursor: hasSources ? "pointer" : "not-allowed",
          opacity: searchLoading || (!title && !artist) ? 0.5 : 1,
          transition: "all .15s",
          boxShadow: hasSources ? `0 0 16px ${accentColor}44` : "none",
        }}
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
                background: `linear-gradient(135deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 100%)`,
                border: `1px solid ${accentColor}22`,
                borderRadius: "12px",
                padding: "12px 14px",
                cursor: "pointer",
                textAlign: "left",
                color: "rgba(255,255,255,.7)",
                fontSize: "13px",
                fontFamily: FONT,
                transition: "all .15s",
                backdropFilter: "blur(10px)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.05) 100%)`;
                e.currentTarget.style.borderColor = accentColor;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 100%)`;
                e.currentTarget.style.borderColor = `${accentColor}22`;
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
            border: `1px solid ${selected.includes(s.key) ? `${accentColor}55` : "rgba(255,255,255,.08)"}`,
            background: selected.includes(s.key)
              ? `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`
              : "rgba(255,255,255,.03)",
            transition: "all .2s",
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
              transition: "all .15s",
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
          border: "1px solid rgba(255,255,255,.08)",
          background: "rgba(255,255,255,.03)",
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
          background: "rgba(0,0,0,.3)",
          border: `1px solid ${accentColor}33`,
          borderRadius: "12px",
          padding: "14px",
          color: "rgba(255,255,255,.9)",
          fontSize: "13px",
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: "1.8",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color .2s",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = accentColor;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = `${accentColor}33`;
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
            border: "none",
            background: `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 80%, white))`,
            // Degradado del acento → primer plano dinámico (nunca blanco fijo)
            color: "var(--neon-fg)",
            fontWeight: "800",
            fontSize: "14px",
            fontFamily: FONT,
            cursor: "pointer",
            boxShadow: `0 0 16px ${accentColor}44`,
            transition: "transform .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
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
            border: `1px solid ${accentColor}33`,
            background: "rgba(255,255,255,.06)",
            color: "rgba(255,255,255,.6)",
            fontWeight: "600",
            fontSize: "14px",
            fontFamily: FONT,
            cursor: "pointer",
            transition: "all .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,.06)";
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

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: `1px solid ${accentColor}15`,
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
    padding: "9px 0",
    cursor: "pointer",
    userSelect: "none",
    borderBottom: `1px solid ${accentColor}15`,
  };

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
        border: `1px solid ${accentColor}44`,
        boxShadow: `0 16px 48px rgba(0,0,0,.6), 0 0 0 1px ${accentColor}22, 0 0 40px ${accentColor}22`,
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
        <div onClick={onOpenSearch} style={sectionBtnStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.search}</span>
            <span style={labelStyle}>Buscar letras</span>
          </div>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)" }}>▶</span>
        </div>

        {/* ── Fuente de letras ─────────────────────────────────── */}
        <div onClick={onOpenSource} style={sectionBtnStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.music}</span>
            <span style={labelStyle}>Fuente de letras</span>
          </div>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)" }}>▶</span>
        </div>

        {/* ── Editar letras ────────────────────────────────────── */}
        <div onClick={onOpenEdit} style={sectionBtnStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: safeAccentText(accentColor), display: "flex" }}>{Ic.edit}</span>
            <span style={labelStyle}>Editar letras</span>
          </div>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)" }}>▶</span>
        </div>

        {/* ── Recargar ─────────────────────────────────────────── */}
        <div
          onClick={onReload}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 0",
            cursor: "pointer",
            borderBottom: `1px solid ${accentColor}15`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
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
                    style={{
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: `1px solid ${settings.lyricsFontSize === opt.key ? accentColor : `${accentColor}22`}`,
                      background:
                        settings.lyricsFontSize === opt.key ? `${accentColor}25` : "transparent",
                      color:
                        settings.lyricsFontSize === opt.key ? accentColor : "rgba(255,255,255,.5)",
                      fontWeight: settings.lyricsFontSize === opt.key ? "800" : "600",
                      fontSize: "10px",
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
            <div style={rowStyle}>
              <div style={labelStyle}>Alineación</div>
              <div style={{ display: "flex", gap: "4px" }}>
                {ALIGN_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateSetting("lyricsTextPos", opt.key)}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: `1px solid ${settings.lyricsTextPos === opt.key ? accentColor : `${accentColor}22`}`,
                      background:
                        settings.lyricsTextPos === opt.key ? `${accentColor}25` : "transparent",
                      color:
                        settings.lyricsTextPos === opt.key ? accentColor : "rgba(255,255,255,.5)",
                      fontWeight: settings.lyricsTextPos === opt.key ? "800" : "600",
                      fontSize: "10px",
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
            <div style={{ ...rowStyle, borderBottom: "none" }}>
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
            transition:
              "color .5s cubic-bezier(.25,.1,.25,1), text-shadow .5s cubic-bezier(.25,.1,.25,1), font-weight .4s cubic-bezier(.25,.1,.25,1)",
            color: isLit ? "#ffffff" : COLORS.textTertiary,
            fontWeight: isActiveWord ? "900" : isLit ? "700" : "500",
            textShadow: isLit ? `0 0 16px ${accentColor}88, 0 0 32px ${accentColor}44` : "none",
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
//  cambia. En cada tick de progreso (400ms) solo se re-renderiza la línea
//  activa; el resto de la lista no se toca.
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
  const { visible, solidOn } = usePerformance();
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
  const [progressSec, setProgressSec] = useState(0);
  // ── Settings modal ──────────────────────────────────────────────────
  const [showLyricsSettings, setShowLyricsSettings] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0); // fuerza re-fetch
  // ⭐ Ref (no dispara re-render): marca que el próximo fetch debe saltarse
  //    el cache. Evita el doble disparo que causaba resetear reloadCounter.
  const skipCacheRef = useRef(false);

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

  const handleApplySearchResult = useCallback((result) => {
    if (result?.text) {
      const lines = result.text.split("\n").filter((l) => l.trim());
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
  }, []);

  const handleEditLyrics = useCallback((lines) => {
    if (lines && lines.length > 0) {
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
  }, []);

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

  // ── Track progress for synced lyrics (cada 400ms) ─────────────────────
  //    Cadencia fina: con 1s el karaoke encadenaba palabras en bloques de
  //    un segundo y el cambio de línea arrastraba ≤1.25s de retraso visible
  //    ("las letras van lentas"). La fuente progressRef está en sincronía
  //    (lo comprueba el reloj de la barra); el problema era la cadencia de
  //    este tick. Coste: solo re-renderiza la línea activa (LyricLine memo).

  useEffect(() => {
    if (!open || !isSynced || !visible) return;
    const interval = setInterval(() => {
      if (progressRef?.current !== undefined) {
        setProgressSec(progressRef.current);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [open, isSynced, visible, progressRef]);

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
      setBgBlurUrl(preblurToDataUrl(img) || "");
      setBgSrc(url);
      setBgLoaded(true);
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
    // Sin backdrop-filter: el botón flota sobre el fondo de letras (estático)
    // — medición GPU, dentro del 1.80% de blur que costaban los backdrop.
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
        {!solidOn && bgThumb && (
          <div
            data-testid="lyrics-bg"
            style={{
              position: "absolute",
              inset: "-5%",
              backgroundImage: bgLoaded && bgLayerSrc ? `url(${bgLayerSrc})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
              // Filtro CSS solo como fallback si el pre-difuminado falló
              // (canvas contaminado por CORS): en el flujo normal la cadena
              // blur+saturate+brightness va aplicada una vez en canvas y esta
              // capa pinta sin `filter` (medido: ~1.8% GPU en Letras).
              filter:
                bgLoaded && bgSrc && !bgBlurUrl
                  ? "blur(12px) saturate(1.2) brightness(0.7)"
                  : undefined,
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
        {/* 3-dots — abre/cierra modal de configuración de letras */}
        <button
          onClick={() => setShowLyricsSettings((v) => !v)}
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

                // ── Distancia al activo (para efecto lente / profundidad) ──
                const lineDistance =
                  currentLine >= 0 ? Math.abs(i - currentLine) : Math.max(0, 2 - i);

                // ── Calcular qué palabra está iluminada (solo línea activa) ──
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

                // ⭐ LyricLine memoizada: con props primitivas y handlers
                //    estables, en cada tick SOLO cambia la línea activa.
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

      {/* ── Animation keyframes + hover styles ────────────────────────── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
50% { opacity: 0.7; }
         }
         @keyframes sw-fade-in {
           from { opacity: 0; }
           to { opacity: 1; }
         }
         @keyframes sw-modal-in {
           from { opacity: 0; transform: scale(0.92) translateY(20px); }
           to { opacity: 1; transform: scale(1) translateY(0); }
         }
       `}</style>
    </div>
  );
}
