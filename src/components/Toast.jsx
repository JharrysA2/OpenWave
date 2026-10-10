import React from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, TRANSITIONS, GLASS, withAlpha } from "../utils/theme";

export function Toasts({ toasts }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "90px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          style={{
            padding: "10px 16px",
            borderRadius: RADIUS.card,
            fontSize: "13.5px",
            fontWeight: "700",
            fontFamily: FONT,
            ...GLASS.popup,
            // Errores: Liquid Glass en blanco y negro (petición) — vidrio
            // oscuro puro, texto blanco, borde blanco sutil. Sin rojos ni
            // colores "raros".
            background:
              t.type === "error"
                ? "linear-gradient(135deg, rgba(18,18,20,.94), rgba(0,0,0,.88))"
                : t.type === "success"
                  ? "rgba(5,46,22,.88)"
                  : GLASS.popup.background,
            // Variantes sólidas (error/éxito): a ~88 % de opacidad el blur
            // no se ve — opt-out de coste cero (docs/PERFORMANCE.md §7)
            ...(t.type === "error" || t.type === "success"
              ? { backdropFilter: "none", WebkitBackdropFilter: "none" }
              : {}),
            color:
              t.type === "error"
                ? "#ffffff"
                : t.type === "success"
                  ? "#86efac"
                  : COLORS.textPlayerTitle,
            border: `1px solid ${
              t.type === "error"
                ? "rgba(255,255,255,.45)"
                : t.type === "success"
                  ? withAlpha(COLORS.successColor, "4d")
                  : GLASS.popup.borderColor
            }`,
            animation: `toastIn .18s ${TRANSITIONS.spring}`,
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
