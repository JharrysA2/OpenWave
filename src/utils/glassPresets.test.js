import { describe, it, expect } from "vitest";
import { isGlassBlocked, glassLightStyle, glassLightLabel } from "./glassPresets";

describe("glassPresets — el vidrio explícito manda sobre el auto", () => {
  it("auto y equilibrado no bloquean el vidrio aunque la GPU se detecte como software", () => {
    expect(isGlassBlocked({ perfMode: "auto", blurStyle: "blur" })).toBe(false);
    expect(isGlassBlocked({ perfMode: "balanced", blurStyle: "blur" })).toBe(false);
    expect(isGlassBlocked({})).toBe(false);
  });

  it("Color sólido y Ninguno son elecciones manuales y lo apagan", () => {
    expect(isGlassBlocked({ blurStyle: "solid" })).toBe(true);
    expect(isGlassBlocked({ blurStyle: "none" })).toBe(true);
  });

  it("Rendimiento y el modo personalizado sin blur/sólido lo apagan", () => {
    expect(isGlassBlocked({ perfMode: "performance" })).toBe(true);
    expect(isGlassBlocked({ perfMode: "custom", perfBlur: false })).toBe(true);
    expect(isGlassBlocked({ perfMode: "custom", perfSolid: true })).toBe(true);
    expect(isGlassBlocked({ perfMode: "custom", perfBlur: true, perfSolid: false })).toBe(false);
  });

  it("el estilo de luz cae en Outline y las etiquetas salen de i18n", () => {
    expect(glassLightStyle("no-existe").id).toBe("outline");
    expect(glassLightLabel({ glassLightComet: "Cometa" }, "comet")).toBe("Cometa");
    expect(glassLightLabel({}, "comet")).toBe("Outline");
  });
});
