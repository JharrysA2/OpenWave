import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  overlayOpacityForLuminance,
  smoothstep,
  useDynamicTheme,
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_FG,
} from "./useDynamicTheme";
import { DEFAULT_SETTINGS } from "../constants";
import { contrastRatio, deriveTheme, ON_ACCENT_MIN_CONTRAST } from "../utils/colorTheme";

describe("smoothstep", () => {
  it("vale 0 por debajo del borde inferior y 1 por encima del superior", () => {
    expect(smoothstep(0, 1, -5)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 42)).toBe(1);
  });

  it("es monótona creciente y simétrica respecto al punto medio", () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(1 - smoothstep(0, 1, 0.75), 10);

    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const value = smoothstep(0, 1, x);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it("tiene pendiente ~0 en los extremos (sin codo)", () => {
    const eps = 1e-4;
    expect(smoothstep(0, 1, eps) / eps).toBeLessThan(0.01);
    expect((1 - smoothstep(0, 1, 1 - eps)) / eps).toBeLessThan(0.01);
  });
});

describe("overlayOpacityForLuminance", () => {
  it("usa opacidad plena con acentos oscuros", () => {
    expect(overlayOpacityForLuminance(0)).toBe(1);
    expect(overlayOpacityForLuminance(0.2)).toBe(1);
    expect(overlayOpacityForLuminance(0.55)).toBe(1);
  });

  it("baja al mínimo con acentos casi blancos", () => {
    expect(overlayOpacityForLuminance(0.92)).toBeCloseTo(0.08, 10);
    expect(overlayOpacityForLuminance(0.99)).toBeCloseTo(0.08, 10);
    expect(overlayOpacityForLuminance(1)).toBeCloseTo(0.08, 10);
  });

  it("es continua: sin saltos entre umbrales consecutivos", () => {
    // El bug original: 0.1 y 0.2 de diferencia al cruzar 0.7 / 0.85
    let maxJump = 0;
    let prev = overlayOpacityForLuminance(0);
    for (let lum = 0.005; lum <= 1; lum += 0.005) {
      const value = overlayOpacityForLuminance(lum);
      maxJump = Math.max(maxJump, Math.abs(prev - value));
      prev = value;
    }
    // Con 200 muestras, cualquier salto > 0.02 delataría un escalón
    expect(maxJump).toBeLessThan(0.02);
  });

  it("decrece de forma monótona y siempre queda dentro de [0.08, 1]", () => {
    let prev = Infinity;
    for (let lum = 0; lum <= 1; lum += 0.01) {
      const value = overlayOpacityForLuminance(lum);
      expect(value).toBeLessThanOrEqual(prev + 1e-12);
      expect(value).toBeGreaterThanOrEqual(0.08 - 1e-9);
      expect(value).toBeLessThanOrEqual(1);
      prev = value;
    }
  });

  it("mantiene la legibilidad en cremas/amarillos pastel (#ffeedd ≈ 0.876)", () => {
    const opacity = overlayOpacityForLuminance(0.876);
    expect(opacity).toBeLessThan(0.15);
    expect(opacity).toBeGreaterThan(0.08);
  });

  it("no rompe con valores no finitos", () => {
    expect(overlayOpacityForLuminance(NaN)).toBe(1);
    expect(overlayOpacityForLuminance(undefined)).toBe(1);
    expect(overlayOpacityForLuminance(Infinity)).toBe(1);
  });

  // ── Par por defecto (--neon, --neon-fg) ──────────────────────────────────

  it("DEFAULT_ACCENT_FG cumple ≥4.5:1 contra DEFAULT_ACCENT (no blanco fijo)", () => {
    expect(contrastRatio(DEFAULT_ACCENT_FG, DEFAULT_ACCENT)).toBeGreaterThanOrEqual(
      ON_ACCENT_MIN_CONTRAST,
    );
  });

  it("el par por defecto coincide con deriveTheme (única fuente de verdad)", () => {
    expect(DEFAULT_ACCENT_FG).toBe(deriveTheme(DEFAULT_ACCENT).onAccent);
  });
});

// ── Color de la app (appColor) ──────────────────────────────────────────────

describe("useDynamicTheme — color de la app (appColor)", () => {
  const mkSettings = (appColor, dynamicTheme = false) => ({
    ...DEFAULT_SETTINGS,
    appColor,
    dynamicTheme,
  });

  it("aplica el color elegido como --neon y --neon-fg con el tema dinámico apagado", () => {
    const { result } = renderHook(() =>
      useDynamicTheme({ settings: mkSettings("#22d3ee"), currentSong: null }),
    );
    const esperado = deriveTheme("#22d3ee");
    expect(result.current.neonColor).toBe(esperado.accent);
    expect(result.current.neonForeground).toBe(esperado.onAccent);
    expect(document.documentElement.style.getPropertyValue("--neon")).toBe(esperado.accent);
    expect(document.documentElement.style.getPropertyValue("--neon-fg")).toBe(esperado.onAccent);
  });

  it("con tema dinámico y sin canción (al abrir la app) se ve el color elegido", () => {
    const { result } = renderHook(() =>
      useDynamicTheme({ settings: mkSettings("#ec4899", true), currentSong: null }),
    );
    expect(result.current.neonColor).toBe(deriveTheme("#ec4899").accent);
    expect(result.current.hasAccent).toBe(false);
  });

  it("el texto/icono del color elegido cumple ≥4.5:1 (botones visibles)", () => {
    const { result } = renderHook(() =>
      useDynamicTheme({ settings: mkSettings("#2563eb"), currentSong: null }),
    );
    expect(
      contrastRatio(result.current.neonForeground, result.current.neonColor),
    ).toBeGreaterThanOrEqual(ON_ACCENT_MIN_CONTRAST);
  });

  it("un ajuste antiguo sin appColor cae al morado por defecto", () => {
    const { result } = renderHook(() =>
      useDynamicTheme({
        settings: { ...DEFAULT_SETTINGS, appColor: undefined, dynamicTheme: false },
        currentSong: null,
      }),
    );
    expect(result.current.neonColor).toBe(deriveTheme(DEFAULT_ACCENT).accent);
  });
});
