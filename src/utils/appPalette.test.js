import { describe, it, expect } from "vitest";
import { APP_COLORS } from "./appPalette";
import { DEFAULT_SETTINGS } from "../constants";
import {
  deriveTheme,
  contrastRatio,
  getLuminance,
  BASE,
  ACCENT_MIN_CONTRAST,
  ON_ACCENT_MIN_CONTRAST,
} from "./colorTheme";

describe("APP_COLORS (paleta del color de la app)", () => {
  it("empieza por el morado histórico y coincide con el ajuste por defecto", () => {
    expect(APP_COLORS[0]).toBe("#a78bfa");
    expect(DEFAULT_SETTINGS.appColor).toBe(APP_COLORS[0]);
  });

  it("ofrece bastantes colores, todos en #rrggbb y sin repetidos", () => {
    expect(APP_COLORS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(APP_COLORS).size).toBe(APP_COLORS.length);
    for (const hex of APP_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("todos derivan un acento visible sobre el fondo oscuro (≥5:1)", () => {
    for (const hex of APP_COLORS) {
      const { accent } = deriveTheme(hex);
      expect(contrastRatio(accent, BASE)).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
    }
  });

  it("todos derivan el texto/icono de los botones a ≥4.5:1 contra su acento", () => {
    for (const hex of APP_COLORS) {
      const { accent, onAccent } = deriveTheme(hex);
      expect(contrastRatio(onAccent, accent)).toBeGreaterThanOrEqual(ON_ACCENT_MIN_CONTRAST);
    }
  });

  it("colores oscuros se aclaran y muy claros se oscurecen (siempre visibles)", () => {
    // Oscuro → "que los botones sean un poco blancos": se aclara para verse.
    expect(getLuminance(deriveTheme("#2563eb").accent)).toBeGreaterThan(getLuminance("#2563eb"));
    // Muy claro → "que los botones sean un poco oscuros": se modera un poco.
    expect(getLuminance(deriveTheme("#ffffff").accent)).toBeLessThan(getLuminance("#ffffff"));
  });
});
