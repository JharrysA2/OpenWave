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

// ── Presupuesto de GPU de overlays (docs/PERFORMANCE.md §7) ────────────────
//
// Medido en iGPU: con un modal abierto el uso subía del 33 % al 76 % mientras
// estaba montado, y a 11 % con el modo Rendimiento (blur/anim off). Bajar el
// blur de las hojas de 10px+saturate a 6px sin saturate NO bastó: seguía por
// encima del 70 % — el coste era el filtro en sí (full-screen, backdrop que se
// repinta con el modal abierto), no su radio. Reglas:
//
//   1. Un scrim (capa full-screen de atenuación: fondo plano, no degradado)
//      NUNCA lleva backdrop-filter: se re-ejecuta en cada repintado de detrás
//      (progreso del player a 5 Hz, shimmer de skeletons, hovers) y, además,
//      `html.perf-solid [style*="backdrop-filter"]` lo pintaría entero en
//      modo Rendimiento.
//   2. NINGÚN elemento de un overlay lleva backdrop-filter inline: la hoja es
//      full-screen y su backdrop cambia mientras está montado, así que un
//      filtro = un pase de Gauss de iGPU por frame. El "frosted" lo dan el
//      degradado, la sombra y el rim light.
//      (Las superficies de la shell —sidebar/titlebar/searchbar/player— sí
//      difuminan fuera de un overlay; `html.overlay-open` las apaga mientras
//      dure, por eso aquí solo se inspecciona el subárbol de las capas.)

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
  // Regla 2: 0 backdrop-filter dentro de las capas del overlay (ni en la
  // capa propia, ni en la hoja, ni en sus hijos). `none` es un opt-out de
  // coste cero y se permite. Los elementos fuera de las capas (superficies
  // de la shell) no se tocan: html.overlay-open los apaga mientras el
  // overlay está montado.
  const offenders = new Set();
  for (const layer of layers) {
    for (const el of [layer, ...layer.querySelectorAll("*")]) {
      const blur = el.style && el.style.backdropFilter;
      if (blur && blur !== "none") {
        offenders.add(`${el.tagName.toLowerCase()}: ${blur}`);
      }
    }
  }
  expect([...offenders]).toEqual([]);
}
