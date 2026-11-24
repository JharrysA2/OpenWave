import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  angleToUnitVector,
  buildLensField,
  clamp,
  clearLensCache,
  computeSceneCover,
  getLensField,
  glassGeometry,
  lensCacheKey,
  lensFieldToDataUrl,
  lerp,
  sceneOffsetForRect,
  sdfRoundRect,
  sdfRoundRectNormal,
} from "./glassEngine";

const BASE = {
  width: 100,
  height: 50,
  radius: 10,
  rim: 12,
  maxDisp: 6,
  margin: 10,
};

function pixel(field, x, y) {
  const i = (y * field.width + x) * 4;
  return [field.data[i], field.data[i + 1], field.data[i + 2], field.data[i + 3]];
}

describe("glassEngine — SDF y geometría", () => {
  it("clamp y lerp respetan los extremos", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it("la SDF es negativa dentro, cero en el borde y positiva fuera", () => {
    expect(sdfRoundRect(50, 25, 100, 50, 0)).toBe(-25);
    expect(sdfRoundRect(50, 0, 100, 50, 0)).toBeCloseTo(0, 5);
    expect(sdfRoundRect(50, -5, 100, 50, 0)).toBeCloseTo(5, 5);
    expect(sdfRoundRect(-5, 25, 100, 50, 0)).toBeCloseTo(5, 5);
    // Con radio, la esquina se redondea: el punto exacto de la esquina
    // queda fuera del rectángulo redondeado.
    expect(sdfRoundRect(0, 0, 100, 50, 10)).toBeGreaterThan(0);
  });

  it("la normal analítica apunta hacia fuera en lados y esquinas", () => {
    expect(sdfRoundRectNormal(0, 25, 100, 50, 0)).toEqual({ nx: -1, ny: 0 });
    expect(sdfRoundRectNormal(50, 0, 100, 50, 0)).toEqual({ nx: 0, ny: -1 });
    const corner = sdfRoundRectNormal(0, 0, 100, 50, 10);
    expect(corner.nx).toBeLessThan(0);
    expect(corner.ny).toBeLessThan(0);
    expect(Math.hypot(corner.nx, corner.ny)).toBeCloseTo(1, 5);
  });

  it("glassGeometry crece con grosor, IOR y refracción, y se limita en barras bajas", () => {
    const thin = glassGeometry({ glassDepth: "thin", glassIor: 1.5, glassRefraction: 60 }, 680, 84);
    const thick = glassGeometry(
      { glassDepth: "thick", glassIor: 1.5, glassRefraction: 60 },
      680,
      84,
    );
    expect(thick.rim).toBeGreaterThan(thin.rim);
    expect(thick.maxDisp).toBeGreaterThan(thin.maxDisp);
    // 30 px nominales > 44 % de 84 (36,96): cabe, pero no llega a 30 en un
    // lado corto de 60 px.
    const small = glassGeometry({ glassDepth: "thick" }, 300, 60);
    expect(small.rim).toBeLessThanOrEqual(60 * 0.44 + 1e-9);
    // Sin tamaño no hay lente.
    expect(glassGeometry({}, 0, 84)).toEqual({ rim: 0, maxDisp: 0, margin: 0, dispersion: 0 });
    // Más IOR dobla más; más refracción también.
    const lowIor = glassGeometry({ glassIor: 1.1, glassRefraction: 60 }, 680, 84);
    const highIor = glassGeometry({ glassIor: 1.9, glassRefraction: 60 }, 680, 84);
    expect(highIor.maxDisp).toBeGreaterThan(lowIor.maxDisp);
    const lowRef = glassGeometry({ glassRefraction: 10, glassDispersion: 10 }, 680, 84);
    const highRef = glassGeometry({ glassRefraction: 100, glassDispersion: 100 }, 680, 84);
    expect(highRef.maxDisp).toBeGreaterThan(lowRef.maxDisp);
    expect(highRef.dispersion).toBeGreaterThan(lowRef.dispersion);
  });

  it("la lente queda neutra en el centro y desplaza en el canto", () => {
    const field = buildLensField(BASE);
    expect(field.width).toBe(120);
    expect(field.height).toBe(70);
    // Centro del rectángulo (50,25) + margen (10,10) → (60,35).
    expect(pixel(field, 60, 35)).toEqual([128, 128, 128, 255]);
    // Canto izquierdo (x=0, y=25) + margen → (10,35). La normal apunta hacia
    // fuera, así que R se aleja de 128.
    const edge = pixel(field, 10, 35);
    expect(edge[3]).toBe(255);
    expect(edge[0] !== 128 || edge[1] !== 128).toBe(true);
    // Fuera del recorte: neutro.
    expect(pixel(field, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it("el campo se cachea por geometría y se puede limpiar", () => {
    clearLensCache();
    const a = getLensField(BASE);
    const b = getLensField({ ...BASE });
    expect(a).toBe(b);
    const key = lensCacheKey(BASE);
    expect(key).toBe(lensCacheKey({ ...BASE }));
    expect(key).not.toBe(lensCacheKey({ ...BASE, rim: 20 }));
    clearLensCache();
    expect(getLensField(BASE)).not.toBe(a);
  });

  it("en jsdom no hay canvas: el data URL es null y el componente cae al tinte", () => {
    expect(lensFieldToDataUrl(null)).toBeNull();
    expect(lensFieldToDataUrl(buildLensField(BASE))).toBeNull();
  });
});

describe("glassEngine — escena y rim", () => {
  it("computeSceneCover recorta la imagen con cover y la centra", () => {
    // Imagen 1000×500 en viewport 800×600: manda la altura → 1200×600.
    expect(computeSceneCover(1000, 500, 800, 600)).toEqual({
      width: 1200,
      height: 600,
      left: -200,
      top: 0,
    });
    // Imagen 500×1000 en viewport 800×600: manda la anchura → 800×1600.
    expect(computeSceneCover(500, 1000, 800, 600)).toEqual({
      width: 800,
      height: 1600,
      left: 0,
      top: -500,
    });
    expect(computeSceneCover(0, 0, 800, 600)).toEqual({ width: 0, height: 0, left: 0, top: 0 });
  });

  it("sceneOffsetForRect alinea la copia con la escena y compensa el margen", () => {
    const cover = { width: 1200, height: 600, left: -100, top: 0 };
    const rect = { left: 200, top: 600 };
    expect(sceneOffsetForRect(cover, rect, 20)).toEqual({
      backgroundSize: "1200px 600px",
      backgroundPosition: "-280px -580px",
    });
  });

  it("angleToUnitVector produce un gradiente de izquierda a derecha a 0°", () => {
    expect(angleToUnitVector(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    const vertical = angleToUnitVector(90);
    expect(vertical.x1).toBeCloseTo(0.5, 5);
    expect(vertical.y1).toBeCloseTo(0, 5);
    expect(vertical.x2).toBeCloseTo(0.5, 5);
    expect(vertical.y2).toBeCloseTo(1, 5);
  });
});

beforeEach(() => {
  clearLensCache();
  // jsdom no implementa canvas: el motor debe caer al tinte sin ruido.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});
