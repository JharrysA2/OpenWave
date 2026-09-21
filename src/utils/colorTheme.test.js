import { describe, it, expect } from "vitest";
import {
  deriveTheme,
  contrastRatio,
  getLuminance,
  srgbToOklch,
  oklchFromHex,
  hexToRgb,
  BASE,
  ACCENT_L_MIN,
  C_CEILING,
  ON_ACCENT_C,
  ON_ACCENT_MIN_CONTRAST,
  ACCENT_MIN_CONTRAST,
  AMBIENT_C_MAX,
  AMBIENT_L,
} from "./colorTheme";

const HEX_RE = /^#[0-9a-f]{6}$/;

// ── PRNG determinista (mulberry32) para el test de propiedad ─────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toHex = (r, g, b) =>
  `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

function assertValidTheme(hex, violations) {
  const t = deriveTheme(hex);

  const label = (field) => `deriveTheme(${hex}).${field} -> ${t[field]}`;

  for (const field of ["accent", "onAccent", "ambient"]) {
    if (!HEX_RE.test(t[field])) violations.push(`${label(field)} no es #rrggbb`);
  }

  const aL = oklchFromHex(t.accent).L;
  const aC = oklchFromHex(t.accent).C;
  // Tolerancia ±0.01 por cuantización al hex de 8 bits (round-trip).
  if (aL < ACCENT_L_MIN - 0.01) {
    violations.push(`${label("accent")} L=${aL.toFixed(3)} < ${ACCENT_L_MIN}`);
  }
  if (aL > 0.98) {
    violations.push(`${label("accent")} L=${aL.toFixed(3)} > 0.98`);
  }
  if (aC > C_CEILING + 0.005) {
    violations.push(`${label("accent")} C=${aC.toFixed(3)} > techo ${C_CEILING}`);
  }

  const accentVsBase = contrastRatio(t.accent, BASE);
  if (accentVsBase < ACCENT_MIN_CONTRAST - 1e-9) {
    violations.push(
      `${label("accent")} contraste vs base ${accentVsBase.toFixed(3)} < ${ACCENT_MIN_CONTRAST}`,
    );
  }

  const fgVsAccent = contrastRatio(t.onAccent, t.accent);
  if (fgVsAccent < ON_ACCENT_MIN_CONTRAST - 1e-6) {
    violations.push(`${label("onAccent")} contraste ${fgVsAccent.toFixed(3)} < 4.5`);
  }

  const onC = oklchFromHex(t.onAccent).C;
  if (onC > ON_ACCENT_C + 0.005) {
    violations.push(`${label("onAccent")} C=${onC.toFixed(3)} > ${ON_ACCENT_C}`);
  }

  const amb = oklchFromHex(t.ambient);
  if (Math.abs(amb.L - AMBIENT_L) > 0.01) {
    violations.push(`${label("ambient")} L=${amb.L.toFixed(3)} ≠ 0.5`);
  }
  if (amb.C > AMBIENT_C_MAX + 0.005) {
    violations.push(`${label("ambient")} C=${amb.C.toFixed(3)} > ${AMBIENT_C_MAX}`);
  }

  const srcH = oklchFromHex(hex).H;
  if (amb.C > 1e-3) {
    const hueDiff = Math.abs(amb.H - srcH) % 360;
    const wrapped = hueDiff > 180 ? 360 - hueDiff : hueDiff;
    if (wrapped > 25) {
      violations.push(`${label("ambient")} hue ${amb.H.toFixed(0)}º ≠ ${srcH.toFixed(0)}º`);
    }
  }
}

describe("colorTheme — referencia del acento por defecto", () => {
  const t = deriveTheme("#a78bfa");

  it("devuelve hex #rrggbb para los tres roles", () => {
    expect(t.accent).toMatch(HEX_RE);
    expect(t.onAccent).toMatch(HEX_RE);
    expect(t.ambient).toMatch(HEX_RE);
  });

  it("acento con L dentro del rango 0.65-0.85 y C bajo el techo", () => {
    const { L, C } = oklchFromHex(t.accent);
    expect(L).toBeGreaterThanOrEqual(0.64);
    expect(L).toBeLessThanOrEqual(0.86);
    expect(C).toBeLessThanOrEqual(C_CEILING + 1e-3);
  });

  it("acento con contraste ≥ 5:1 contra el fondo oscuro", () => {
    expect(contrastRatio(t.accent, BASE)).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
  });

  it("on-accent con contraste ≥ 4.5:1 contra el acento", () => {
    expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(ON_ACCENT_MIN_CONTRAST);
  });
});

describe("colorTheme — test de propiedad (miles de colores aleatorios)", () => {
  it("deriva temas válidos para 4000 colores aleatorios", () => {
    const rand = mulberry32(20260918);
    const violations = [];
    for (let i = 0; i < 4000; i++) {
      const r = Math.floor(rand() * 256);
      const g = Math.floor(rand() * 256);
      const b = Math.floor(rand() * 256);
      assertValidTheme(toHex(r, g, b), violations);
    }
    expect(violations).toEqual([]);
  });

  it("deriva temas válidos para casos extremos", () => {
    const extremes = [
      "#000000",
      "#ffffff",
      "#808080",
      "#0000ff",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#ffd700",
      "#a78bfa",
      "#003c00", // azul casi negro
      "#0a0a0f", // el propio fondo
      "#ffeedd", // crema brillante
      "#1a1a2e", // navy oscuro
      "#c4824b", // el caso que invertía el contraste en HSL
      "#fefffe",
      "#010001",
    ];
    const violations = [];
    for (const hex of extremes) assertValidTheme(hex, violations);
    expect(violations).toEqual([]);
  });

  it("el azul casi negro (#003c00) ya no termina con contraste ≈1.3:1", () => {
    const t = deriveTheme("#003c00");
    expect(contrastRatio(t.accent, BASE)).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
  });
});

describe("colorTheme — conversions y contraste", () => {
  it("getLuminance sigue WCAG (negro=0, blanco=1)", () => {
    expect(getLuminance("#000000")).toBe(0);
    expect(getLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#000000")).toBe(1);
  });

  it("srgbToOklch round-trip aproximado", () => {
    const { L, C, H } = srgbToOklch(167, 139, 250);
    expect(L).toBeGreaterThan(0.6);
    expect(L).toBeLessThan(0.8);
    expect(C).toBeGreaterThan(0.1);
    expect(H).toBeGreaterThan(240);
    expect(H).toBeLessThan(330);
  });

  it("hexToRgb soporta #rgb y #rrggbbaa", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#a78bfa22")).toEqual({ r: 167, g: 139, b: 250 });
  });
});
