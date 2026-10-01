import React, { useContext, useEffect, useState } from "react";
import { FONT } from "../constants";
import { SettingsContext } from "../contexts/SettingsContext";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { BOOT_TIMEOUT_MS, checkHealth } from "../utils/backendHealth";
import { StatusState } from "./StatusState";
import { COLORS, SPACING, TYPOGRAPHY } from "../utils/theme";

/**
 * OpenWave — Pantalla de arranque
 *
 * Cubre el hueco entre el splash estático (index.html) y la primera respuesta
 * real del backend:
 *
 *   - **Arrancando**: logo + "Iniciando OpenWave…" mientras corre la ventana
 *     de gracia del health-check (reintenta cada 1,5 s hasta 30 s: el backend
 *     en frío tarda ~15-20 s en servir). Si el primer intento falla, aparece
 *     ya un «Continuar sin conexión» para no retener al usuario.
 *   - **Error**: si la gracia se agota, la pantalla pasa al estado de error +
 *     CÓDIGO reportable + "Reintentar" / "Continuar sin conexión" (nunca un
 *     skeleton eterno ni una app a medias). Si el backend acaba de subir
 *     después, el overlay se desvanece solo (vuelve a `online`).
 *   - **Listo**: se desvanece (~320 ms) y se desmonta, dejando paso a la app.
 *
 * Si el backend se cae DESPUÉS de entrar, el overlay no vuelve (eso lo
 * lleva ConnectionBanner).
 *
 * Sin `<SettingsProvider>` cae a los textos por defecto (tests).
 */
const FADE_MS = 320;
// fadeIn discreto (mismo keyframe que el resto de la app, index.html).
const FADE_IN = { animation: "sw-fade-in .3s ease" };

export function BootScreen() {
  const ctx = useContext(SettingsContext);
  const t = ctx?.t || {};
  const { online, booting, code } = useBackendStatus();

  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false); // "Continuar sin conexión"
  const [hidden, setHidden] = useState(false); // ya terminó el fade-out

  const pending = booting || retrying;
  const done = dismissed || (!pending && online);
  const failed = !dismissed && !pending && !online;

  // Fade-out al pasar a "listo" → desmontar (si no, quedaría tapando a ciegas).
  useEffect(() => {
    if (!done) return undefined;
    const id = setTimeout(() => setHidden(true), FADE_MS + 40);
    return () => clearTimeout(id);
  }, [done]);

  if (hidden) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await checkHealth({ timeout: BOOT_TIMEOUT_MS });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      data-testid="boot-screen"
      style={{
        position: "fixed",
        inset: 0,
        // Por encima del player (999999) y del banner (100001): es la capa
        // de arranque. `pointerEvents` se apaga al salir para no bloquear.
        zIndex: 1500000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "radial-gradient(900px 480px at 50% 28%, #12101d, #050508 70%)",
        fontFamily: FONT,
        color: "#fff",
        opacity: done ? 0 : 1,
        pointerEvents: done ? "none" : "auto",
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      <div style={{ width: "100%", maxWidth: "540px", textAlign: "center" }}>
        {pending && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: SPACING.gap.wide,
              ...FADE_IN,
            }}
          >
            {/* Logo — onda simple, sin dependencias de iconos */}
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12c1.6 0 1.6-5 3.2-5s1.6 10 3.2 10 1.6-13 3.2-13 1.6 13 3.2 13 1.6-10 3.2-10 1.6 5 3.2 5" />
            </svg>
            <div style={{ ...TYPOGRAPHY.h2, fontSize: "26px", color: COLORS.textPrimary }}>
              OpenWave
            </div>
            <div style={{ ...TYPOGRAPHY.body, color: COLORS.textMuted }}>
              {t.booting || "Iniciando OpenWave…"}
            </div>
            {/* Barra de progreso indeterminada (shimmer de index.html) */}
            <div
              className="skeleton"
              aria-hidden="true"
              style={{ width: "180px", height: "4px", borderRadius: "999px" }}
            />
            {/* Si ya falló algún intento, no retenemos: salir a la app. */}
            {!online && (
              <button
                type="button"
                onClick={() => setDismissed(true)}
                style={{
                  ...TYPOGRAPHY.body,
                  background: "none",
                  border: "none",
                  color: COLORS.textMuted,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: SPACING.xs,
                  marginTop: SPACING.xs,
                }}
              >
                {t.continueOffline || "Continuar sin conexión"}
              </button>
            )}
          </div>
        )}

        {failed && (
          <StatusState
            code={code}
            onRetry={handleRetry}
            onAction={() => setDismissed(true)}
            actionLabel={t.continueOffline || "Continuar sin conexión"}
          />
        )}
      </div>
    </div>
  );
}

export default BootScreen;
