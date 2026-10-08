import React, { useRef, useState } from "react";
import { FONT } from "../../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, TYPOGRAPHY, GLASS } from "../../utils/theme";
import { APP_COLORS } from "../../utils/appPalette";
import { deriveTheme, hexToHsv, hsvToHex } from "../../utils/colorTheme";
import { useOverlayLayer } from "../../hooks/useOverlayLayer";
import { useEscClose } from "../../hooks/useEscape";
import { useSettings } from "../../contexts/useSettings";
import { Ic } from "../../icons/Icons";

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const normHex = (s) => `#${String(s).replace(/^#/, "").toLowerCase()}`;

/**
 * AppColorModal — selector de "Color de la app" (Ajustes → Apariencia).
 *
 * Mismo molde que BtnShapeModal/BarStyleModal: scrim + panel GLASS.sheet,
 * montado con createPortal desde PageApariencia.
 *
 * Vista paleta: círculos con el acento DERIVADO (lo que ves es lo que se
 * aplica) + botón redondo con extractor de color. Elegir un color NO cierra
 * el modal: se aplica al instante para poder seguir comparando; se cierra
 * con Cancelar o clicando fuera.
 *
 * Vista extractor: selector de color PROPIO con el estilo de la app (área
 * de saturación/brillo con cursor, slider de tono, vista previa y campo
 * hex) en lugar del cuadro de color del sistema. "Aplicar" guarda y vuelve
 * a la paleta; "Cancelar" vuelve sin guardar.
 */
export function AppColorModal({ accent, onClose }) {
  // Se monta/desmonta con createPortal desde PageApariencia → siempre "abierto"
  useOverlayLayer(true);
  useEscClose(true, onClose);

  const { settings, updateSetting, t } = useSettings();
  const appColor = settings.appColor || "#a78bfa";
  const isCustom = !APP_COLORS.includes(appColor);
  const currentTheme = deriveTheme(appColor);
  // fg garantizado para el botón primario (fondo = accent en curso)
  const accentFg = deriveTheme(accent).onAccent;

  const [view, setView] = useState("palette"); // "palette" | "custom"
  const [hsv, setHsv] = useState(() => hexToHsv(appColor));
  const [hexDraft, setHexDraft] = useState(() => hsvToHex(hexToHsv(appColor)));
  const svRef = useRef(null);
  const svDragging = useRef(false);

  const picked = hsvToHex(hsv);

  const updateHsv = (nh) => {
    setHsv(nh);
    setHexDraft(hsvToHex(nh));
  };

  const openCustom = () => {
    const init = hexToHsv(settings.appColor || "#a78bfa");
    setHsv(init);
    setHexDraft(hsvToHex(init));
    setView("custom");
  };

  const pickSV = (e) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return; // sin layout (jsdom) no hay nada que calcular
    updateHsv({
      h: hsv.h,
      s: clamp01((e.clientX - rect.left) / rect.width),
      v: 1 - clamp01((e.clientY - rect.top) / rect.height),
    });
  };

  const apply = () => {
    updateSetting("appColor", HEX_RE.test(hexDraft) ? normHex(hexDraft) : picked);
    setView("palette");
  };

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
          {view === "palette" ? t.appColor : t.appColorCustom}
        </div>

        {view === "palette" ? (
          <>
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
            <button
              type="button"
              onClick={openCustom}
              style={{
                marginTop: SPACING.gap.xwide,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
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
                {t.appColorCustom}
              </span>
            </button>

            <button
              type="button"
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
              {t.cancel}
            </button>
          </>
        ) : (
          <>
            {/* Saturación / brillo: capa negra hacia arriba + capa blanca
                hacia la derecha sobre el color del tono actual */}
            <div
              ref={svRef}
              role="presentation"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                svDragging.current = true;
                pickSV(e);
              }}
              onPointerMove={(e) => {
                if (svDragging.current) pickSV(e);
              }}
              onPointerUp={() => {
                svDragging.current = false;
              }}
              onPointerCancel={() => {
                svDragging.current = false;
              }}
              style={{
                position: "relative",
                height: "200px",
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.borderLight}`,
                cursor: "crosshair",
                touchAction: "none",
                background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${Math.round(hsv.h)},100%, 50%)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border: "2px solid #ffffff",
                  transform: "translate(-50%,-50%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.55), 0 1px 4px rgba(0,0,0,.6)",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Tono: barra arcoíris con slider accesible (input range invisible) */}
            <div style={{ position: "relative", marginTop: SPACING.gap.wide, height: "16px" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: RADIUS.pill,
                  border: `1px solid ${COLORS.borderLight}`,
                  background:
                    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${(hsv.h / 360) * 100}%`,
                  top: "50%",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: `hsl(${Math.round(hsv.h)},100%,50%)`,
                  border: "2px solid #ffffff",
                  transform: "translate(-50%,-50%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.55), 0 1px 4px rgba(0,0,0,.6)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={Math.round(hsv.h)}
                aria-label={t.appColorHue}
                onChange={(e) => updateHsv({ ...hsv, h: Number(e.target.value) })}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  margin: 0,
                  opacity: 0,
                  cursor: "pointer",
                  WebkitAppearance: "none",
                  appearance: "none",
                }}
              />
            </div>

            {/* Vista previa + hex */}
            <div
              style={{
                marginTop: SPACING.gap.xwide,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "44px",
                  height: "44px",
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: picked,
                  border: "1.5px solid rgba(255,255,255,.07)",
                  boxShadow: "0 0 0 2px #0a0a0f, 0 0 0 4px #ffffff",
                }}
              />
              <input
                type="text"
                aria-label={t.appColorHex}
                value={hexDraft}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  const val = e.target.value;
                  setHexDraft(val);
                  if (HEX_RE.test(val)) updateHsv(hexToHsv(val));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") apply();
                }}
                style={{
                  width: "130px",
                  padding: "10px 12px",
                  borderRadius: RADIUS.default,
                  border: `1px solid ${COLORS.borderLight}`,
                  background: "rgba(255,255,255,.05)",
                  color: COLORS.textPrimary,
                  fontFamily: FONT,
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                  outline: "none",
                }}
              />
            </div>

            {/* Cancelar / Aplicar */}
            <div style={{ marginTop: SPACING.gap.xxwide, display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setView("palette")}
                style={{
                  flex: 1,
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
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={apply}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: RADIUS.default,
                  border: "none",
                  background: accent,
                  color: accentFg,
                  fontWeight: "700",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t.appColorApply}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
