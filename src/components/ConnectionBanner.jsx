import React from "react";
import { FONT } from "../constants";
import { RADIUS } from "../utils/theme";
import { useSettings } from "../contexts/useSettings";
import { useBackendStatus } from "../hooks/useBackendStatus";

const AMBER = "#f59e0b";

/**
 * Banner flotante que aparece SOLO cuando se pierde la conexión con el
 * backend (heartbeat o cualquier petición fallida por red).
 *
 * - `aria-live="polite"` para que un lector de pantalla anuncie el cambio.
 * - Sin `pointerEvents` para no bloquear la UI que hay debajo.
 * - Se oculta automáticamente al reconectar (el estado vive en backendHealth).
 */
export function ConnectionBanner() {
  const { t } = useSettings();
  const { online, checking, error } = useBackendStatus();

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
        fontSize: "12.5px",
        fontWeight: 600,
        color: "#fcd34d",
        background: "rgba(45,28,4,.86)",
        border: `1px solid ${AMBER}66`,
        boxShadow: "0 4px 20px rgba(0,0,0,.35)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
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
          background: AMBER,
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}
