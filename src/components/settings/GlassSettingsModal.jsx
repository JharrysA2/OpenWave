import React from "react";
import { FONT } from "../../constants";
import { COLORS, GLASS, RADIUS, SPACING, TRANSITIONS } from "../../utils/theme";
import { GLASS_LIGHT_STYLES } from "../../utils/glassPresets";
import { Slider } from "../SettingsComponents";
import { useOverlayLayer } from "../../hooks/useOverlayLayer";
import { useEscClose } from "../../hooks/useEscape";

const SLIDERS = [
  ["glassRefraction", "glassRefraction", 0, 100, 1, (v) => `${Math.round(v)}%`],
  ["glassDispersion", "glassDispersion", 0, 100, 1, (v) => `${Math.round(v)}%`],
  ["glassIor", "glassIor", 1, 2, 0.05, (v) => Number(v).toFixed(2)],
  ["glassTint", "glassTint", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`],
  ["glassBlur", "glassBlur", 0, 40, 1, (v) => `${Math.round(v)} px`],
  ["glassSaturation", "glassSaturation", 0.5, 1.6, 0.05, (v) => Number(v).toFixed(2)],
  ["glassBrightness", "glassBrightness", 0.6, 1.6, 0.05, (v) => Number(v).toFixed(2)],
  ["glassContrast", "glassContrast", 0.6, 1.6, 0.05, (v) => Number(v).toFixed(2)],
  ["glassFresnel", "glassFresnel", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`],
  ["glassSpecularAngle", "glassSpecularAngle", 0, 360, 5, (v) => `${Math.round(v)}°`],
  ["glassBevel", "glassBevel", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`],
];

const DEFAULTS = {
  glassRefraction: 80,
  glassDispersion: 35,
  glassIor: 1.5,
  glassTint: 0.4,
  glassBlur: 20,
  glassSaturation: 1.15,
  glassBrightness: 1,
  glassContrast: 1,
  glassFresnel: 0.6,
  glassSpecularAngle: 40,
  glassBevel: 0.35,
};

/**
 * Ajustes finos del vidrio líquido: los seis estilos de luz y los parámetros
 * ópticos que no caben en la página. El panel se cierra con Escape o clic
 * fuera y congela el fondo mientras está abierto (useOverlayLayer).
 */
export function GlassSettingsModal({ accent, settings, updateSetting, t, onClose }) {
  useOverlayLayer(true);
  useEscClose(true, onClose);

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
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          border: "none",
          borderRadius: "20px",
          padding: "22px",
          width: "min(560px, 100%)",
          maxHeight: "min(760px, calc(100vh - 48px))",
          overflowY: "auto",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: "17px",
            fontWeight: "900",
            letterSpacing: "-.3px",
            color: COLORS.textPrimary,
          }}
        >
          {t.glassAdvanced}
        </div>
        <div
          style={{
            marginTop: "4px",
            fontSize: "12px",
            color: COLORS.textTertiary,
            fontWeight: "500",
          }}
        >
          {t.glassAdvancedDesc}
        </div>

        <div
          style={{
            marginTop: "18px",
            fontSize: "11px",
            fontWeight: "700",
            color: COLORS.textTertiary,
            letterSpacing: ".05em",
            textTransform: "uppercase",
          }}
        >
          {t.glassLight}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "6px",
            marginTop: "8px",
          }}
        >
          {GLASS_LIGHT_STYLES.map((style) => {
            const selected = (settings.glassLightStyle || "outline") === style.id;
            return (
              <button
                key={style.id}
                onClick={() => updateSetting("glassLightStyle", style.id)}
                style={{
                  padding: "9px 6px",
                  borderRadius: RADIUS.sm,
                  border: `1.5px solid ${selected ? accent : "rgba(255,255,255,.08)"}`,
                  background: selected ? `${accent}22` : COLORS.surfaceCard,
                  color: selected ? accent : COLORS.iconActive,
                  fontWeight: "700",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  transition: TRANSITIONS.fast,
                }}
              >
                {t[style.labelKey]}
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: "7px",
            fontSize: "11px",
            lineHeight: 1.45,
            color: COLORS.textTertiary,
            fontWeight: "500",
          }}
        >
          {t.glassLightNote}
        </div>

        <div
          style={{
            marginTop: "22px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {SLIDERS.map(([key, labelKey, min, max, step, format]) => {
            const value = Number(settings[key] ?? DEFAULTS[key]);
            return (
              <div key={key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "6px",
                  }}
                >
                  <span style={{ fontSize: "13px", fontWeight: "600", color: COLORS.textPrimary }}>
                    {t[labelKey]}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: COLORS.textTertiary,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {format(value)}
                  </span>
                </div>
                <Slider
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(next) => updateSetting(key, next)}
                />
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: SPACING.gap.xxwide,
            width: "100%",
            padding: "11px",
            borderRadius: RADIUS.default,
            ...GLASS.control,
            color: COLORS.iconActive,
            fontWeight: "700",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {t.glassClose}
        </button>
      </div>
    </div>
  );
}
