import React from "react";
import { FONT } from "../constants";
import { RADIUS, TRANSITIONS, GLASS } from "../utils/theme";

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
            // Liquid Glass (petición): UN estilo para todos los avisos, sea
            // info, éxito o error — EL MISMO material translúcido del player
            // bar (se ve a través, blur 10px), letras blancas y sin contorno.
            // Ni verdes ni rojos: el `type` solo alimenta la semántica
            // (dedup/registro), nunca el color del mensaje.
            ...GLASS.mensaje,
            color: "#ffffff",
            animation: `toastIn .18s ${TRANSITIONS.spring}`,
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
