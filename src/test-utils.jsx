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

// Presupuesto de GPU de overlays (docs/PERFORMANCE.md §7). Medido en iGPU: el
// coste es el filtro full-screen en sí, no su radio. Reglas:
//   1. Un scrim (capa de atenuación full-screen) NUNCA lleva backdrop-filter.
//   2. Ningún elemento de un overlay lleva backdrop-filter inline.
// La shell (sidebar/titlebar/player) sí difumina fuera de un overlay;
// `html.overlay-open` la apaga, por eso aquí solo se inspecciona el subárbol.

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

/** Valores de backdrop-filter inline EN SERIO (el `none` es un opt-out de
 *  coste cero que el repo usa para blindarse contra futuros blurs). */
export function inlineBlurred() {
  return [...document.body.querySelectorAll("*")].filter(
    (el) => el.style && el.style.backdropFilter && el.style.backdropFilter !== "none",
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
  // Regla 2: dentro de las capas del overlay SOLO difumina la superficie de
  // cristal (fondo con degradado) y SOLO con el valor del presupuesto:
  // `blur(40px)` (cristal de modal: sheet/settings, §7) o `blur(6px)`
  // (superficie transitoria tipo popup), siempre sin `saturate`. Filas,
  // resultados y capas internas: 0 filtros (`none` es el opt-out de coste
  // cero y se permite). Los elementos fuera de las capas (superficies de la
  // shell) no se tocan: html.overlay-open los apaga mientras el overlay
  // está montado.
  const offenders = new Set();
  for (const layer of layers) {
    for (const el of [layer, ...layer.querySelectorAll("*")]) {
      const blur = el.style && el.style.backdropFilter;
      if (!blur || blur === "none") continue;
      const bg = `${el.style.background || ""}${el.style.backgroundImage || ""}`;
      const isGlassSurface = bg.includes("gradient");
      const isBudgetBlur = /^blur\((?:40|6)(?:\.\d+)?px\)$/.test(blur);
      if (!isGlassSurface || !isBudgetBlur) {
        const cls = el.getAttribute && el.getAttribute("class");
        const bg = (el.style.background || "").slice(0, 48) || "∅";
        offenders.add(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}: ${blur} | bg: ${bg}`);
      }
    }
  }
  expect([...offenders]).toEqual([]);
}
