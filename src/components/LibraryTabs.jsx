import React from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, withAlpha } from "../utils/theme";

/**
 * Píldoras segmentadas (estilo SearchView) para las pestañas de biblioteca.
 * tabs: [{ key, label, count? }]
 */
export default React.memo(function LibraryTabs({ tabs, value, onChange, accentColor }) {
  if (!tabs || tabs.length < 2) return null;
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "6px",
        marginBottom: "18px",
        padding: "3px",
        background: "rgba(255,255,255,.04)",
        borderRadius: RADIUS.pill,
        width: "fit-content",
        fontFamily: FONT,
      }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            style={{
              padding: "7px 18px",
              borderRadius: RADIUS.pill,
              border: "none",
              background: active ? accentColor : "transparent",
              color: active ? COLORS.black : COLORS.textSecondary,
              fontWeight: active ? "700" : "600",
              fontSize: "12.5px",
              cursor: "pointer",
              fontFamily: FONT,
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: active ? `0 2px 8px ${withAlpha(accentColor, "44")}` : "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: "800",
                  opacity: active ? 0.7 : 0.55,
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
