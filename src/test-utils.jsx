import React from "react";
import { render } from "@testing-library/react";
import { expect } from "vitest";
import { SettingsProvider } from "./contexts/SettingsContext";

/**
 * Render a component wrapped in the app's SettingsProvider.
 * Provides `settings`, `updateSetting`, and `t` (translations)
 * so that components using the useSettings hook work in tests.
 */
export function renderWithSettings(component) {
  return render(<SettingsProvider>{component}</SettingsProvider>);
}

/**
 * Create a mock fetch Response-like object.
 * The api.js _fetch function checks resp.ok and resp.headers.get("content-type"),
 * so bare { json: () => ... } mocks will fail.
 */
export function mockApiResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => "application/json",
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

// ── Presupuesto de GPU de overlays (docs/PERFORMANCE.md) ────────────────────
//
// Medido en iGPU: con un modal abierto el uso subía del 33 % al 76 % mientras
// estaba montado, y a 11 % con el modo Rendimiento (blur/anim off). Reglas:
//
//   1. Un scrim (capa full-screen de atenuación: fondo plano, no degradado)
//      NUNCA lleva backdrop-filter: se re-ejecuta en cada repintado de detrás
//      (progreso del player a 5 Hz, shimmer de skeletons, hovers) y, además,
//      `html.perf-solid [style*="backdrop-filter"]` lo pintaría entero en
//      modo Rendimiento.
//   2. Cualquier backdrop-filter inline de un overlay es `blur(6px)` exacto
//      (o `none` para anularlo): sin `saturate` y sin radios de 8/10px.

function isZeroPx(v) {
  return v === "0" || v === "0px";
}

/** Capa a pantalla completa (fixed o absolute, cubriendo el viewport). */
export function isFullScreenLayer(el) {
  if (!el.style) return false;
  const { position } = el.style;
  if (position !== "fixed" && position !== "absolute") return false;
  const inset = el.style.inset;
  if (inset) return isZeroPx(inset) || /^(0px)( 0px){3}$/.test(inset);
  return (
    isZeroPx(el.style.top) &&
    isZeroPx(el.style.right) &&
    isZeroPx(el.style.bottom) &&
    isZeroPx(el.style.left)
  );
}

/** Fondo plano de atenuación (scrim), no un cristal con degradado. */
function isDimmingScrim(el) {
  if (!isFullScreenLayer(el)) return false;
  const bg = el.style.background || el.style.backgroundColor || "";
  return bg !== "" && !bg.includes("gradient");
}

/** Valores de backdrop-filter inline en el árbol de document.body. */
export function inlineBlurred() {
  return [...document.body.querySelectorAll("*")].filter(
    (el) => el.style && el.style.backdropFilter,
  );
}

/** Lanza si el DOM montado rompe el presupuesto de blur de overlays. */
export function expectOverlayGlassBudget() {
  const layers = [...document.body.querySelectorAll("*")].filter(isFullScreenLayer);
  // Hay al menos una capa a pantalla completa (el overlay que estamos viendo)
  expect(layers.length).toBeGreaterThan(0);
  // Regla 1: ningún scrim atenuado difumina
  for (const scrim of layers.filter(isDimmingScrim)) {
    expect(scrim.style.backdropFilter ?? "").toBe("");
  }
  // Regla 2: todo lo que difumina es blur(6px) (o "none" explícito)
  for (const el of inlineBlurred()) {
    expect(["blur(6px)", "none"]).toContain(el.style.backdropFilter);
  }
}
