import { describe, it, expect, beforeEach } from "vitest";
import {
  detectSoftwareRenderer,
  isSoftwareRenderer,
  resetSoftwareRendererCache,
  getRendererInfo,
  readRendererString,
} from "./softwareRenderer";

/** Fábrica de un stub de WebGLRenderingContext con el renderer indicado. */
function glFactory(renderer, { withDebugExt = true } = {}) {
  return () => ({
    RENDERER: 0x1f01,
    getExtension: (name) =>
      name === "WEBGL_debug_renderer_info" && withDebugExt ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    getParameter: () => renderer,
  });
}

describe("detectSoftwareRenderer", () => {
  it("sin contexto WebGL → render por software (no hay aceleración usable)", () => {
    expect(detectSoftwareRenderer(() => null)).toBe(true);
  });

  it("si la fábrica lanza excepción → asume software (modo seguro)", () => {
    expect(
      detectSoftwareRenderer(() => {
        throw new Error("getContext no soportado");
      }),
    ).toBe(true);
  });

  it("llvmpipe (máquina sin GPU dedicada) → software", () => {
    expect(detectSoftwareRenderer(glFactory("llvmpipe (LLVM 15.0.7, 256 bits)"))).toBe(true);
  });

  it("ANGLE sobre SwiftShader → software", () => {
    expect(
      detectSoftwareRenderer(
        glFactory("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)"),
      ),
    ).toBe(true);
  });

  it("GPU real (NVIDIA) → NO software", () => {
    expect(detectSoftwareRenderer(glFactory("NVIDIA GeForce RTX 4090/PCIe/SSE2"))).toBe(false);
  });

  it("GPU real (Intel Mesa) → NO software", () => {
    expect(detectSoftwareRenderer(glFactory("Mesa Intel(R) UHD Graphics 630"))).toBe(false);
  });

  it("sin extensión debug: renderer genérico sin vendor → SOFTWARE (modo seguro)", () => {
    expect(detectSoftwareRenderer(glFactory("Mozilla", { withDebugExt: false }))).toBe(true);
  });

  it("string genérico enmascarado («WebKit WebGL») → software (no se puede confirmar GPU)", () => {
    expect(detectSoftwareRenderer(glFactory("WebKit WebGL"))).toBe(true);
  });

  it("«Apple GPU» fuera de macOS (fallback de WebCore sin información de hardware) → software", () => {
    // navigator.platform en jsdom no es Mac: la cadena cae en el fallback.
    expect(detectSoftwareRenderer(glFactory("Apple GPU"))).toBe(true);
  });

  it("GPU real AMD vía ANGLE/Direct3D (Windows) → NO software", () => {
    expect(
      detectSoftwareRenderer(
        glFactory("ANGLE (AMD Radeon RX 6800 XT, Direct3D11 vs_5_0 ps_5_0, D3D11)"),
      ),
    ).toBe(false);
  });

  it("GPU real Intel vía ANGLE/Direct3D (Windows) → NO software", () => {
    expect(
      detectSoftwareRenderer(glFactory("ANGLE (Intel(R) UHD Graphics 630, Direct3D11)")),
    ).toBe(false);
  });
});

describe("isSoftwareRenderer (caché)", () => {
  beforeEach(() => resetSoftwareRendererCache());

  it("en jsdom (sin WebGL real) devuelve true de forma segura y cacheada", () => {
    const a = isSoftwareRenderer();
    const b = isSoftwareRenderer();
    expect(a).toBe(true);
    expect(b).toBe(a);
  });

  it("resetSoftwareRendererCache permite volver a evaluar", () => {
    expect(isSoftwareRenderer()).toBe(true);
    resetSoftwareRendererCache();
    expect(isSoftwareRenderer()).toBe(true);
  });
});

describe("getRendererInfo (diagnóstico para Ajustes → Rendimiento)", () => {
  beforeEach(() => resetSoftwareRendererCache());

  it("GPU real → aceleración por hardware con la cadena del renderer", () => {
    const info = getRendererInfo(glFactory("NVIDIA GeForce RTX 4090/PCIe/SSE2"));
    expect(info.software).toBe(false);
    expect(info.renderer).toBe("NVIDIA GeForce RTX 4090/PCIe/SSE2");
  });

  it("SwiftShader → software (fallback de bajo consumo)", () => {
    const info = getRendererInfo(
      glFactory("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)"),
    );
    expect(info.software).toBe(true);
    expect(info.renderer).toContain("SwiftShader");
  });

  it("sin WebGL → software con renderer vacío", () => {
    expect(getRendererInfo(() => null)).toEqual({ software: true, renderer: "" });
  });

  it("sin fábrica se cachea (jsdom: seguro por defecto) y el reset lo libera", () => {
    const a = getRendererInfo();
    expect(a.software).toBe(true);
    expect(getRendererInfo()).toBe(a);
    resetSoftwareRendererCache();
    expect(getRendererInfo()).not.toBe(a);
  });
});

describe("readRendererString", () => {
  it("sin extensión debug lee vía RENDERER", () => {
    expect(readRendererString(glFactory("Mozilla", { withDebugExt: false }))).toBe("Mozilla");
  });

  it("sin contexto WebGL devuelve null", () => {
    expect(readRendererString(() => null)).toBeNull();
  });
});
