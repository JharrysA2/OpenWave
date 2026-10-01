import React, { useContext } from "react";
import { FONT } from "../constants";
import { SettingsContext } from "../contexts/SettingsContext";
import { describeError, DEFAULT_ERROR_CODE } from "../utils/errorCodes";
import {
  ANIMATIONS,
  COLORS,
  GLASS,
  RADIUS,
  SPACING,
  TYPOGRAPHY,
  safeAccentText,
  withAlpha,
} from "../utils/theme";

/**
 * Estado genérico de error / vacío-con-error.
 *
 * Sustituye a los "No se pudo cargar…" escritos a mano en cada vista: un
 * icono + título + mensaje + **badge con el código de error** (para que el
 * usuario lo reporte) + botón "Reintentar".
 *
 * - Tipografía SIEMPRE desde `TYPOGRAPHY`/`FONT` (DM Sans empaquetada local):
 *   antes cada estado traía un `fontSize` suelto y no coincidía con el resto.
 * - `code` es el catálogo de `utils/errorCodes`; sin código se usa E-UI-00
 *   para que NUNCA falte un código que reportar.
 * - Fuera de `<SettingsProvider>` cae a los textos por defecto (tests).
 *
 * @param {object} props
 * @param {string} [props.code] - código reportable (E-CNX-01…)
 * @param {string} [props.title] - título propio (p.ej. "No se pudo cargar el artista")
 * @param {string} [props.message] - mensaje propio (p.ej. el error de la API)
 * @param {() => void} [props.onRetry] - muestra el botón "Reintentar"
 * @param {string} [props.retryLabel] - etiqueta del botón (por defecto t.retry)
 * @param {string} [props.actionLabel] - etiqueta de una acción secundaria
 * @param {() => void} [props.onAction] - acción secundaria (p.ej. "Volver")
 * @param {string} [props.accentColor] - color de acento de la vista
 * @param {boolean} [props.compact] - versión reducida (dentro de un overlay)
 */
export function StatusState({
  code,
  title,
  message,
  onRetry,
  retryLabel,
  actionLabel,
  onAction,
  accentColor = "#a78bfa",
  compact = false,
}) {
  const ctx = useContext(SettingsContext);
  const t = ctx?.t || {};
  const lang = ctx?.settings?.language || "es";

  const info = describeError(code || DEFAULT_ERROR_CODE, lang);
  const titleText = title || info.title;
  const messageText = message || info.message;
  const accent = safeAccentText(accentColor);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="status-state"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: SPACING.gap.wide,
        padding: compact ? "40px 20px" : "80px 20px",
        // Como sustituye al contenido de la vista, ocupa su alto completo
        // (centrado vertical) en lugar de un bloque suelto arriba.
        height: "100%",
        fontFamily: FONT,
        ...ANIMATIONS.fadeIn(0),
      }}
    >
      {/* Icono — círculo con glow del acento (mismo lenguaje que el estado vacío) */}
      <div
        aria-hidden="true"
        style={{
          width: compact ? "56px" : "72px",
          height: compact ? "56px" : "72px",
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${withAlpha(accentColor, "15")}, ${withAlpha(accentColor, "05")})`,
          border: `1px solid ${withAlpha(accentColor, "22")}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={compact ? "26" : "32"}
          height={compact ? "26" : "32"}
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.85 }}
        >
          <path d="M9 2v6M15 2v6" />
          <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
          <path d="M12 17v5" />
          <line x1="3" y1="3" x2="21" y2="21" />
        </svg>
      </div>

      <div style={{ ...TYPOGRAPHY.h2, color: COLORS.textPrimary, maxWidth: "420px" }}>
        {titleText}
      </div>

      <div
        style={{
          ...TYPOGRAPHY.body,
          color: COLORS.textMuted,
          maxWidth: "380px",
          lineHeight: 1.5,
        }}
      >
        {messageText}
      </div>

      {/* Badge del código — tabular-nums para que el número no "baile" */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.gap.normal,
          padding: "6px 14px",
          borderRadius: RADIUS.pill,
          background: withAlpha(accentColor, "12"),
          border: `1px solid ${withAlpha(accentColor, "33")}`,
        }}
      >
        <span style={{ ...TYPOGRAPHY.caption, color: COLORS.textTertiary }}>
          {t.errorCode || "Código de error"}
        </span>
        <span
          data-testid="error-code"
          style={{
            ...TYPOGRAPHY.metadata,
            color: accent,
            letterSpacing: "0.06em",
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: '"tnum"',
          }}
        >
          {info.code}
        </span>
      </div>

      <div style={{ ...TYPOGRAPHY.caption, color: COLORS.textDimmest, maxWidth: "320px" }}>
        {t.errorCodeHint || "Indica este código si reportas el error"}
      </div>

      {(onRetry || onAction) && (
        <div style={{ display: "flex", gap: SPACING.gap.wide, marginTop: SPACING.gap.tight }}>
          {onRetry && (
            <button
              onClick={onRetry}
              data-testid="status-retry"
              style={{
                padding: "9px 22px",
                borderRadius: RADIUS.pill,
                border: "none",
                background: accentColor,
                // Acento de fondo → primer plano dinámico (nunca negro fijo)
                color: "var(--neon-fg)",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: FONT,
                transition: "transform .12s cubic-bezier(.16,1,.3,1), filter .12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
            >
              {retryLabel || t.retry || "Reintentar"}
            </button>
          )}
          {onAction && (
            <button
              onClick={onAction}
              data-testid="status-action"
              style={{
                padding: "9px 22px",
                borderRadius: RADIUS.pill,
                ...GLASS.btn,
                color: COLORS.textSecondary,
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default StatusState;
