import React from "react";
import { FONT } from "../../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, TYPOGRAPHY, GLASS } from "../../utils/theme";
import { APP_COLORS } from "../../utils/appPalette";
import { deriveTheme } from "../../utils/colorTheme";
import { useOverlayLayer } from "../../hooks/useOverlayLayer";
import { Ic } from "../../icons/Icons";

/**
 * AppColorModal — selector de "Color de la app" (Ajustes → Apariencia).
 *
 * Mismo molde que BtnShapeModal/BarStyleModal: scrim + panel GLASS.sheet,
 * montado con createPortal desde PageApariencia. La paleta son círculos con
 * el acento DERIVADO (lo que ves es lo que aplica la app) y el selector
 * libre es un botón redondo con icono de extractor de color.
 *
 * Elegir un color NO cierra el modal: se aplica al instante (el anillo salta
 * al nuevo color y la app se recolorea por detrás) para poder seguir
 * comparando, como todo selector de color. Se cierra con Cancelar o
 * clicando fuera.
 */
export function AppColorModal({ accent, settings, updateSetting, onClose, title, customLabel }) {
  // Se monta/desmonta con createPortal desde PageApariencia → siempre "abierto"
  useOverlayLayer(true);

  const appColor = settings.appColor || "#a78bfa";
  const isCustom = !APP_COLORS.includes(appColor);
  const currentTheme = deriveTheme(appColor);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "rgba(5,5,10,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn .15s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          border: `1px solid ${accent}33`,
          borderRadius: RADIUS.pill,
          padding: "24px",
          width: "min(500px,calc(100vw-48px))",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: COLORS.textPrimary,
            marginBottom: SPACING.gap.xxwide,
            letterSpacing: "-.3px",
          }}
        >
          {title}
        </div>

        {/* Paleta: círculos con el color APLICADO (acento derivado), centrados */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: SPACING.gap.wide,
            justifyContent: "center",
          }}
        >
          {APP_COLORS.map((hex) => {
            const swatch = deriveTheme(hex).accent;
            const isSel = appColor === hex;
            return (
              <button
                key={hex}
                type="button"
                aria-label={`Color ${hex}`}
                title={hex}
                onClick={() => updateSetting("appColor", hex)}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  padding: 0,
                  border: "none",
                  cursor: "pointer",
                  background: swatch,
                  // Anillo doble (oscuro + blanco): se ve sobre cualquier
                  // color del swatch y sobre el fondo del panel.
                  boxShadow: isSel
                    ? "0 0 0 2px #0a0a0f, 0 0 0 4px #ffffff"
                    : "inset 0 0 0 1px rgba(255,255,255,.16)",
                  transition: TRANSITIONS.normal,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              />
            );
          })}
        </div>

        {/* Selector libre: botón redondo con extractor de color */}
        <label
          style={{
            marginTop: SPACING.gap.xwide,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // Si el color actual es personalizado, el botón lo muestra
              // (y el icono usa su on-accent, ≥4.5:1 siempre visible).
              background: isCustom ? currentTheme.accent : COLORS.surfaceCard,
              border: "1.5px solid rgba(255,255,255,.07)",
              boxShadow: isCustom ? "0 0 0 2px #0a0a0f, 0 0 0 4px #ffffff" : "none",
              color: isCustom ? currentTheme.onAccent : accent,
              transition: TRANSITIONS.normal,
            }}
          >
            {Ic.eyedropper}
          </span>
          <span style={{ ...TYPOGRAPHY.small, color: COLORS.iconActive, fontWeight: "700" }}>
            {customLabel}
          </span>
          <input
            type="color"
            aria-label={customLabel}
            value={appColor}
            onChange={(e) => updateSetting("appColor", e.target.value)}
            style={{
              position: "absolute",
              opacity: 0,
              width: "1px",
              height: "1px",
              pointerEvents: "none",
            }}
          />
        </label>

        <button
          onClick={onClose}
          style={{
            marginTop: SPACING.gap.xxwide,
            width: "100%",
            padding: "10px",
            borderRadius: RADIUS.default,
            border: `1px solid ${COLORS.borderLight}`,
            background: "transparent",
            color: COLORS.iconActive,
            fontWeight: "700",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
