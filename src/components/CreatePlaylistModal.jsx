import React, { useState, useRef, useEffect, useCallback } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { api } from "../utils/api";
import { COLORS, RADIUS, TRANSITIONS, GLASS } from "../utils/theme";

const PRESET_COLORS = [
  null,
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#a855f7",
  "#14b8a6",
];

export function CreatePlaylistModal({ open, onClose, onCreated, toast }) {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSelectedColor(null);
      setCoverPreview(null);
      setCoverFile(null);
      creatingRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleCoverSelect = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast("Selecciona una imagen valida", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setCoverPreview(reader.result);
        setCoverFile(reader.result);
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );

  const handleCreate = useCallback(async () => {
    if (!name.trim() || creatingRef.current) return;
    creatingRef.current = true;
    setLoading(true);

    try {
      const result = await api.createPlaylist(
        { name: name.trim(), color: selectedColor || null, cover: coverFile || null },
        toast,
      );

      if (!result) {
        creatingRef.current = false;
        setLoading(false);
        return;
      }

      toast(`Playlist "${name.trim()}" creada`, "success");
      onClose();
      // Notificar al padre DESPUES de cerrar — el padre hace refreshPlaylists + navega
      onCreated?.(result);
    } catch {
      toast("Error al conectar con el servidor", "error");
    }

    creatingRef.current = false;
    setLoading(false);
  }, [name, selectedColor, coverFile, toast, onCreated, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000010,
        background: "rgba(0,0,0,.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "sw-fade-in .15s ease both",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          borderRadius: RADIUS.card,
          width: "400px",
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
          animation: "sw-fade-slide-up .2s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <span
            style={{
              fontSize: "16px",
              fontWeight: "800",
              color: COLORS.textPrimary,
              letterSpacing: "-.3px",
            }}
          >
            Nueva playlist
          </span>
          <button
            onClick={onClose}
            style={{
              ...GLASS.btn,
              borderRadius: RADIUS.full,
              width: "32px",
              height: "32px",
              cursor: "pointer",
              color: COLORS.winCtrlDefault,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: TRANSITIONS.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.surfaceCardHover;
              e.currentTarget.style.color = COLORS.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.surfaceNav;
              e.currentTarget.style.color = COLORS.winCtrlDefault;
            }}
          >
            {Ic.close}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
            {/* Cover picker */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100px",
                height: "100px",
                borderRadius: "16px",
                overflow: "hidden",
                flexShrink: 0,
                cursor: "pointer",
                background: selectedColor
                  ? `linear-gradient(135deg, ${selectedColor}44, ${selectedColor}11)`
                  : "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
                border: "2px dashed rgba(255,255,255,.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "4px",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,.3)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,.15)")}
            >
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,.35)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <span
                    style={{ fontSize: "9px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}
                  >
                    Portada
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverSelect}
              style={{ display: "none" }}
            />

            {/* Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  color: "rgba(255,255,255,.5)",
                  textTransform: "uppercase",
                  letterSpacing: ".5px",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                Nombre
              </label>
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Escribe un nombre..."
                maxLength={50}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: `1px solid ${COLORS.borderActive}`,
                  background: "rgba(255,255,255,.06)",
                  color: COLORS.textPrimary,
                  fontSize: "14px",
                  fontWeight: "600",
                  fontFamily: FONT,
                  outline: "none",
                  transition: TRANSITIONS.fast,
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--neon)";
                  e.currentTarget.style.boxShadow = "0 0 16px var(--neon)33";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderActive;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <div
                style={{
                  fontSize: "10px",
                  color: "rgba(255,255,255,.3)",
                  fontWeight: "600",
                  marginTop: "4px",
                  textAlign: "right",
                }}
              >
                {name.length}/50
              </div>
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label
              style={{
                fontSize: "11px",
                fontWeight: "700",
                color: "rgba(255,255,255,.5)",
                textTransform: "uppercase",
                letterSpacing: ".5px",
                display: "block",
                marginBottom: "10px",
              }}
            >
              Color
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {PRESET_COLORS.map((color, i) => {
                const isSelected = selectedColor === color;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedColor(color)}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      border: isSelected ? "2.5px solid #fff" : "2px solid rgba(255,255,255,.12)",
                      background: color || "rgba(255,255,255,.06)",
                      cursor: "pointer",
                      transition: TRANSITIONS.fast,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      boxShadow: isSelected
                        ? `0 0 12px ${color || "rgba(255,255,255,.2)"}55`
                        : "none",
                      transform: isSelected ? "scale(1.15)" : "scale(1)",
                    }}
                  >
                    {!color && !isSelected && (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "rgba(255,255,255,.25)",
                          fontWeight: "800",
                        }}
                      >
                        x
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "12px 20px 16px",
            borderTop: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              ...GLASS.btn,
              borderRadius: "10px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: "700",
              color: "rgba(255,255,255,.6)",
              cursor: "pointer",
              transition: TRANSITIONS.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,.08)";
              e.currentTarget.style.color = "rgba(255,255,255,.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
              e.currentTarget.style.color = "rgba(255,255,255,.6)";
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            style={{
              background:
                name.trim() && !loading ? selectedColor || "var(--neon)" : "rgba(255,255,255,.06)",
              border: "none",
              borderRadius: "10px",
              padding: "8px 20px",
              fontSize: "13px",
              fontWeight: "700",
              color: name.trim() && !loading ? "#fff" : "rgba(255,255,255,.3)",
              cursor: name.trim() && !loading ? "pointer" : "not-allowed",
              transition: TRANSITIONS.fast,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {loading ? <span style={{ animation: "spin 1s linear infinite" }}>...</span> : Ic.music}{" "}
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
