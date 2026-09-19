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
        transition: "all .2s cubic-bezier(.16,1,.3,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,.10)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,.14)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = GLASS.searchbar.background;
        e.currentTarget.style.borderColor = GLASS.searchbar.borderColor;
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
                  container.style.borderColor = `${accentColor}55`;
                  container.style.boxShadow = `0 0 0 3px ${accentColor}15, 0 0 20px ${accentColor}08`;
                }
              }
            : undefined
        }
        onBlur={
          glowOnFocus
            ? (e) => {
                const container = e.currentTarget.parentElement;
                if (container) {
                  container.style.borderColor = "rgba(255,255,255,.08)";
                  container.style.boxShadow = "none";
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
