import React from "react";
import { FONT } from "../constants";
import { COLORS, GLASS, RADIUS } from "../utils/theme";

/**
 * Píldoras segmentadas (estilo SearchView) para las pestañas de biblioteca.
 * tabs: [{ key, label, count? }]
 *
 * El contenedor y las píldoras inactivas van con el material del player bar
 * (cristal + brillo interior + sombra) y SIN contorno; la píldora activa se
 * marca con el relleno del acento.
 */
export default React.memo(function LibraryTabs({ tabs, value, onChange, accentColor }) {
  // Hover declarativo de las píldoras inactivas (la activa es el acento).
  const [hoverKey, setHoverKey] = React.useState(null);

  if (!tabs || tabs.length < 2) return null;
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "4px",
        marginBottom: "16px",
        padding: "4px",
        background: GLASS.control.background,
        border: `1px solid ${COLORS.borderSubtle}`,
        borderRadius: RADIUS.pill,
        width: "fit-content",
        fontFamily: FONT,
      }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        const hovered = !active && hoverKey === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            onMouseEnter={() => setHoverKey(t.key)}
            onMouseLeave={() => setHoverKey((k) => (k === t.key ? null : k))}
            style={{
              minHeight: "44px",
              padding: "0 16px",
              borderRadius: RADIUS.pill,
              border: "none",
              background: active
                ? accentColor
                : hovered
                  ? GLASS.controlHover.background
                  : "transparent",
              // Píldora activa = fondo acento → primer plano dinámico
              color: active
                ? "var(--neon-fg)"
                : hovered
                  ? COLORS.textPrimary
                  : COLORS.textSecondary,
              fontWeight: "600",
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: FONT,
              transition: "background .16s ease, color .16s ease",
              // El relleno del acento basta para marcar la pestaña activa:
              // una sombra de color añadía glow y una elevación falsa.
              boxShadow: "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  opacity: active ? 0.75 : 0.65,
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
