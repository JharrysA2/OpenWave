import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DynamicBackground } from "./DynamicBackground";

// El vignette es el velo de oscurecimiento del fondo dinámico (0–200 %).
// Regresión del bug «la intensidad del velo se comporta al revés»: el
// antiguo `Number(vignette) || 100` trataba el 0 como «sin definir»
// (0 es falsy) y «Sin velo» aplicaba el velo por defecto (100 %).

function renderVig(props = {}) {
  const { container } = render(
    <DynamicBackground enabled={true} hasAccent={false} cfTransitionSpeed="0.4s" {...props} />,
  );
  return container.firstElementChild;
}

describe("DynamicBackground — velo (vignette)", () => {
  it("sin habilitar no pinta nada", () => {
    const { container } = render(
      <DynamicBackground enabled={false} vignette={100} cfTransitionSpeed="0.4s" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("vignette 0 («Sin velo») = opacidad 0 EXPLÍCITA (bug: antes valía 100)", () => {
    const el = renderVig({ vignette: 0 });
    expect(el).toBeTruthy();
    expect(el.style.opacity).toBe("0");
  });

  it("es monotónico: 0 < 10 < 100 < 200", () => {
    const op = (v) => Number(renderVig({ vignette: v }).style.opacity);
    expect(op(0)).toBe(0);
    expect(op(10)).toBeLessThan(op(100));
    expect(op(100)).toBeLessThan(op(200));
    expect(op(200)).toBeCloseTo(op(100) * 2, 5); // 200 % = doble que 100 %
  });

  it("base con acento: 100 % → 0.35 y 200 % → 0.7", () => {
    expect(Number(renderVig({ vignette: 100, hasAccent: true }).style.opacity)).toBeCloseTo(0.35, 5);
    expect(Number(renderVig({ vignette: 200, hasAccent: true }).style.opacity)).toBeCloseTo(0.7, 5);
  });

  it("sin acento la base es 0.1 (estado por defecto)", () => {
    expect(Number(renderVig({ vignette: 100 }).style.opacity)).toBeCloseTo(0.1, 5);
  });

  it("valores no numéricos / ausentes caen al 100 % (no a 0)", () => {
    expect(Number(renderVig({ vignette: undefined }).style.opacity)).toBeCloseTo(0.1, 5);
    expect(Number(renderVig({ vignette: null }).style.opacity)).toBeCloseTo(0.1, 5);
    expect(Number(renderVig({ vignette: "basura" }).style.opacity)).toBeCloseTo(0.1, 5);
    // sin prop → default del componente = 100
    const { container } = render(
      <DynamicBackground enabled={true} hasAccent={false} cfTransitionSpeed="0.4s" />,
    );
    expect(Number(container.firstElementChild.style.opacity)).toBeCloseTo(0.1, 5);
  });

  it("recorta fuera de rango (−5 → 0, 999 → 200)", () => {
    expect(Number(renderVig({ vignette: -5 }).style.opacity)).toBe(0);
    expect(Number(renderVig({ vignette: 999, hasAccent: true }).style.opacity)).toBeCloseTo(0.7, 5);
  });

  it("pinta el gradiente vignette y no intercepta el ratón", () => {
    const el = renderVig({ vignette: 100 });
    expect(el.style.background).toContain("radial-gradient");
    expect(el.style.pointerEvents).toBe("none");
    expect(el.style.zIndex).toBe("0");
  });

  it("la transición usa la velocidad de crossfade indicada", () => {
    const el = renderVig({ vignette: 100, cfTransitionSpeed: "1.2s" });
    expect(el.style.transition).toContain("1.2s");
  });
});
