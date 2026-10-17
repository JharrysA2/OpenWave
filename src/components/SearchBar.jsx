import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { COLORS, GLASS } from "../utils/theme";

/**
 * Barra de búsqueda glassmorphism compartida por SearchView y HomeView.
 * `showSearchButton` pinta el botón con lupa (SearchView); con `glowOnFocus`
 * el contenedor se resalta con el color de acento al enfocar (HomeView).
 */
export function SearchBar({
  value = "",
  onChange,
  onSearch,
  onClear,
  inputRef,
  placeholder,
  accentColor = "#a78bfa",
  autoFocus = false,
  showSearchButton = false,
  glowOnFocus = false,
  clearCircle = false,
  borderRadius = "14px",
  padding = "0 16px",
  height,
  marginBottom = 0,
  containerStyle = {},
}) {
  return (
    <div
      className="app-searchbar"
      style={{
        ...containerStyle,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        ...GLASS.searchbar,
        borderRadius,
        padding,
        height,
        marginBottom,
        transition:
          "background .2s cubic-bezier(.16,1,.3,1), box-shadow .2s cubic-bezier(.16,1,.3,1)",
      }}
      onMouseEnter={(e) => {
        // Realza el cristal (sin contorno): mismo material, un paso más claro.
        e.currentTarget.style.background = GLASS.btnHoverSoft.background;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = GLASS.searchbar.background;
      }}
    >
      {showSearchButton ? (
        <button
          onClick={() => onSearch && onSearch(value)}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,.35)",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color .12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.7)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.35)")}
        >
          {Ic.search}
        </button>
      ) : (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,.3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      )}
      <input
        ref={inputRef}
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch && onSearch(value);
        }}
        onFocus={
          glowOnFocus
            ? (e) => {
                const container = e.currentTarget.parentElement;
                if (container) {
                  // El foco realza el cristal (relleno + glow difuso), nunca
                  // un aro: el contorno pegado al borde se veía como línea.
                  container.style.background = GLASS.btnHoverSoft.background;
                  container.style.boxShadow = `0 0 22px ${accentColor}30, inset 0 1px 0 rgba(255,255,255,.16)`;
                }
              }
            : undefined
        }
        onBlur={
          glowOnFocus
            ? (e) => {
                const container = e.currentTarget.parentElement;
                if (container) {
                  container.style.background = GLASS.searchbar.background;
                  container.style.boxShadow = GLASS.searchbar.boxShadow;
                }
              }
            : undefined
        }
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          color: COLORS.textPrimary,
          fontSize: "14px",
          fontWeight: "600",
          fontFamily: FONT,
          outline: "none",
          height: "100%",
        }}
      />
      {value && (
        <button
          onClick={() => {
            onChange && onChange("");
            if (onClear) onClear();
            inputRef && inputRef.current && inputRef.current.focus();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,.35)",
            cursor: "pointer",
            padding: "4px",
            borderRadius: clearCircle ? "50%" : "0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color .12s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.7)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.35)")}
        >
          {Ic.close}
        </button>
      )}
    </div>
  );
}
