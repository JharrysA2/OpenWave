import React from "react";
import { FONT } from "../constants";
import { RADIUS, TYPOGRAPHY } from "../utils/theme";
import { useSettings } from "../contexts/useSettings";
import { useBackendStatus } from "../hooks/useBackendStatus";

/**
 * Banner flotante que aparece SOLO cuando se pierde la conexión con el
 * backend (heartbeat o cualquier petición fallida por red).
 *
 * - `aria-live="polite"` para que un lector de pantalla anuncie el cambio.
 * - Sin `pointerEvents` para no bloquear la UI que hay debajo.
 * - Tipografía SIEMPRE desde `TYPOGRAPHY` (DM Sans empaquetada local): antes
 *   traía un `fontSize`/`fontWeight` suelto que no coincidía con el resto.
 * - Muestra el CÓDIGO reportable (utils/errorCodes) para que el usuario
 *   pueda indicarlo al reportar el fallo.
 * - Blanco y negro SIN contorno (petición): vidrio negro con texto blanco,
 *   punto blanco y badge neutro — el color NO comunica el estado, los avisos
 *   nunca van en ámbar/rojo/verde.
 * - Sin `backdrop-filter`: es un chip opaco (.86) y transitorio, y detrás no
 *   hay animación que difuminar (presupuesto: blur solo con movimiento detrás
 *   o en superficies de modal, ver docs/PERFORMANCE.md §1/§7). La sombra es
 *   de separación, no un borde.
 * - Se oculta automáticamente al reconectar (el estado vive en backendHealth).
 */
export function ConnectionBanner() {
  const { t } = useSettings();
  const { online, checking, error, code } = useBackendStatus();

  if (online) return null;

  const label = checking ? t.reconnecting : t.serverOffline;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
      title={error || ""}
      style={{
        position: "absolute",
        top: "40px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100001,
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "7px 14px",
        borderRadius: RADIUS.card,
        fontFamily: FONT,
        color: "#ffffff",
        background: "rgba(12,12,16,.86)",
        boxShadow: "0 12px 40px rgba(0,0,0,.5)",
        pointerEvents: "none",
        animation: "sw-fade-slide-up .25s cubic-bezier(.16,1,.3,1)",
      }}
    >
      <span
        aria-hidden="true"
        className={checking ? "connection-dot" : undefined}
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "rgba(255,255,255,.9)",
          flexShrink: 0,
        }}
      />
      <span style={{ ...TYPOGRAPHY.caption, fontWeight: 600 }}>{label}</span>
      {code && (
        <span
          data-testid="connection-code"
          style={{
            ...TYPOGRAPHY.metadata,
            letterSpacing: "0.06em",
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: '"tnum"',
            padding: "2px 7px",
            borderRadius: RADIUS.pill,
            background: "rgba(255,255,255,.10)",
            color: "rgba(255,255,255,.92)",
          }}
        >
          {code}
        </span>
      )}
    </div>
  );
}
