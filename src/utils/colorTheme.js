/**
 * colorTheme.js — Derivación de acentos en espacio perceptual OKLCH.
 *
 * Sustituye el sistema HSL (boostColor / getContrastColors) por una
 * derivación OKLCH con garantías de contraste WCAG verificadas de verdad:
 *
 *   accent   → L OKLCH 0.65–0.85, C con soft-knee (0.12 → techo 0.16),
 *              piso de luminancia: ratio real ≥ 5:1 vs #0a0a0f
 *   onAccent → casi-negro o casi-blanco del mismo tono (C ≈ 0.02–0.03);
 *              gana el de mayor contraste; L ajustada por bisección hasta ≥ 4.5:1
 *   ambient  → mismo tono, L ≈ 0.5, C ≤ 0.12
 *
 * Módulo 100% puro: sin DOM, sin dependencias. Diseñado para test de
 * propiedad con miles de colores aleatorios.
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTES DE DERIVACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Fondo oscuro fijo de la app (contraste objetivo del acento). */
export const BASE = "#0a0a0f";

/** Rango de luminosidad OKLCH del acento (piso se puede exceder si el contraste lo exige). */
export const ACCENT_L_MIN = 0.65;
export const ACCENT_L_MAX = 0.8;

/** Soft-knee del croma: por debajo se conserva, por encima satura suavemente al techo. */
export const C_SOFT_KNEE = 0.11;
export const C_CEILING = 0.14;

/** Ratio de contraste mínimo del acento contra el fondo oscuro. */
export const ACCENT_MIN_CONTRAST = 5;

/** Croma de los on-colors (casi neutros con un sutil tinte del tono). */
export const ON_ACCENT_C = 0.025;
/** Ratio de contraste mínimo del on-accent contra el acento. */
export const ON_ACCENT_MIN_CONTRAST = 4.5;

/** Ambient: L fija y croma máx. */
export const AMBIENT_L = 0.5;
export const AMBIENT_C_MAX = 0.12;

// ═══════════════════════════════════════════════════════════════════════════════
//  CONVERSIONES sRGB ↔ OKLab / OKLCH  (Björn Ottosson, matrices estándar)
// ═══════════════════════════════════════════════════════════════════════════════

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toEncoded = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * sRGB (canales 0-255) → OKLab { L, a, b }.
 */
export const srgbToOklab = (r, g, b) => {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
};

/**
 * OKLab → sRGB lineal (canales puede salir del rango 0..1; sin clamp).
 */
export const oklabToLinearRgb = (L, a, b) => {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
};

/**
 * OKLab → sRGB (canales 0-255, con clamp).
 */
export const oklabToSrgb = (L, a, b) => oklabToSrgbFromLinear(oklabToLinearRgb(L, a, b));

const oklabToSrgbFromLinear = ({ r, g, b }) => ({
  r: Math.round(clamp01(toEncoded(r)) * 255),
  g: Math.round(clamp01(toEncoded(g)) * 255),
  b: Math.round(clamp01(toEncoded(b)) * 255),
});

/**
 * sRGB (canales 0-255) → OKLCH { L, C, H } (H en grados 0-360).
 */
export const srgbToOklch = (r, g, b) => {
  const { L, a, b: bb } = srgbToOklab(r, g, b);
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
};

const inGamut = (L, C, H, eps = 1e-6) => {
  const rad = (H * Math.PI) / 180;
  const { r, g, b } = oklabToLinearRgb(L, C * Math.cos(rad), C * Math.sin(rad));
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
};

/**
 * Proyección de gamut: reduce el croma (sin tocar tono ni luz) hasta que el
 * color cabe en sRGB. Nunca recorta canales (eso desvirtuaría el tono).
 */
const fitGamut = (L, C, H) => {
  if (inGamut(L, C, H)) return C;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, H)) lo = mid;
    else hi = mid;
  }
  return lo;
};

/**
 * OKLCH → hex #rrggbb, con proyección de gamut.
 */
export const oklchToHex = (L, C, H) => {
  const Cf = fitGamut(L, C, H);
  const rad = (H * Math.PI) / 180;
  const { r, g, b } = oklabToSrgbFromLinear(
    oklabToLinearRgb(L, Cf * Math.cos(rad), Cf * Math.sin(rad)),
  );
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * hex → { r, g, b } en 0-255 (soporta #rgb, #rrggbb y #rrggbbaa).
 */
export const hexToRgb = (hex) => {
  let h = String(hex).replace(/^#/, "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length >= 6) h = h.slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

/** hex → OKLCH. */
export const oklchFromHex = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return srgbToOklch(r, g, b);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTRASTE WCAG (ratio real, no un umbral de luminancia)
// ═══════════════════════════════════════════════════════════════════════════════

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
export const getLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
};

/** Ratio de contraste WCAG entre dos hex. */
export const contrastRatio = (hexA, hexB) => {
  const la = getLuminance(hexA);
  const lb = getLuminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DERIVACIÓN DEL TEMA
// ═══════════════════════════════════════════════════════════════════════════════

/** Soft-knee del croma: conserva por debajo, satura suavemente hacia el techo. */
const softKneeC = (c) =>
  c <= C_SOFT_KNEE
    ? c
    : C_SOFT_KNEE + (C_CEILING - C_SOFT_KNEE) * Math.tanh((c - C_SOFT_KNEE) / 0.06);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Acento: L acotada 0.65-0.85, C con soft-knee, y piso de luminancia
 * (sube L hasta alcanzar ≥5:1 contra el fondo oscuro, si hace falta).
 */
const deriveAccent = (srcL, srcC, H) => {
  let L = clamp(srcL, ACCENT_L_MIN, ACCENT_L_MAX);
  const C = softKneeC(srcC);

  if (contrastRatio(oklchToHex(L, C, H), BASE) < ACCENT_MIN_CONTRAST) {
    let lo = L;
    let hi = 0.96;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(oklchToHex(mid, C, H), BASE) >= ACCENT_MIN_CONTRAST) hi = mid;
      else lo = mid;
    }
    L = hi;
  }
  return oklchToHex(L, C, H);
};

/**
 * On-accent: casi-negro o casi-blanco del mismo tono; el de mayor contraste
 * gana, y su L se ajusta por bisección hasta cumplir ≥ 4.5:1 contra el acento.
 */
const deriveOnAccent = (accentHex, H) => {
  const whiteL = 0.97;
  const blackL = 0.03;
  const whiteContrast = contrastRatio(oklchToHex(whiteL, ON_ACCENT_C, H), accentHex);
  const blackContrast = contrastRatio(oklchToHex(blackL, ON_ACCENT_C, H), accentHex);

  // Polo ganador: 1 = casi-blanco, 0 = casi-negro (el de mayor ratio).
  const pole = whiteContrast >= blackContrast ? 1 : 0;
  let L = pole === 1 ? whiteL : blackL;

  if (contrastRatio(oklchToHex(L, ON_ACCENT_C, H), accentHex) < ON_ACCENT_MIN_CONTRAST) {
    if (pole === 1) {
      // Subir L hacia blanco → el contraste crece; busca el menor L que pase.
      let lo = L;
      let hi = 1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(oklchToHex(mid, ON_ACCENT_C, H), accentHex) >= ON_ACCENT_MIN_CONTRAST) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      L = hi;
    } else {
      // Bajar L hacia negro → el contraste crece; busca el mayor L que pase.
      let lo = 0;
      let hi = L;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(oklchToHex(mid, ON_ACCENT_C, H), accentHex) >= ON_ACCENT_MIN_CONTRAST) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      L = lo;
    }
  }
  return oklchToHex(L, ON_ACCENT_C, H);
};

/**
 * Deriva el tema completo de un color fuente.
 *
 * @param {string} hex color origen en #rrggbb (p. ej. extractor de portada)
 * @returns {{ accent: string, onAccent: string, ambient: string }} hex #rrggbb
 */
export const deriveTheme = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const { L: srcL, C: srcC, H: rawH } = srgbToOklch(r, g, b);
  const H = Number.isFinite(rawH) ? rawH : 0;

  const accent = deriveAccent(srcL, srcC, H);
  const onAccent = deriveOnAccent(accent, H);
  const ambient = oklchToHex(AMBIENT_L, Math.min(srcC, AMBIENT_C_MAX), H);

  return { accent, onAccent, ambient };
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXTRACTOR DE PORTADA — píxeles RGBA → tono dominante en OKLCH
// ═══════════════════════════════════════════════════════════════════════════════

/** Nº de bins de tono (cada uno = 15°). */
export const HUE_BIN_COUNT = 24;

/** Centro y radio de la ventana de luminosidad: penaliza píxeles muy oscuros o quemados. */
const HUE_WIN_L = 0.75;
const HUE_WIN_RADIUS = 0.35;

/** Croma mínimo para contar a un píxel como "de color". */
const ACHROMATIC_C = 0.04;
/** Si menos de este porcentaje de píxeles tiene croma, la imagen es acromática. */
const ACHROMATIC_FRACTION = 0.04;

/** L/C del color representativo con el que se alimenta deriveTheme. */
const HUE_REP_L = 0.7;
const HUE_REP_C = 0.12;

/**
 * Extrae el tono dominante de un buffer RGBA (típicamente un downscale 64×64
 * de la portada) usando peso = Croma² × ventana-de-luz centrada en L≈0.75.
 *
 * - Se ignoran píxeles acromáticos (C < 0.04): no contaminan el histograma de tono.
 * - El histograma se suaviza circularmente (kernel 1-2-1) para evitar
 *   decisiones inestables entre bins vecinos.
 * - Si la fracción de píxeles de color es < 4% (B/N, casi blanco…) devuelve
 *   `null` → el llamador aplica el tema acromático blanco/negro.
 *
 * @param {Uint8ClampedArray} imgData buffer RGBA
 * @returns {string|null} hex representativo del tono dominante, o null si acromático
 */
export const extractOklchAccent = (imgData) => {
  const bins = new Float64Array(HUE_BIN_COUNT);
  let total = 0;
  let coloredPixels = 0;

  for (let i = 0; i < imgData.length; i += 4) {
    const { L, C, H } = srgbToOklch(imgData[i], imgData[i + 1], imgData[i + 2]);
    total++;
    if (C < ACHROMATIC_C) continue;
    coloredPixels++;

    const bin = Math.floor(H / (360 / HUE_BIN_COUNT)) % HUE_BIN_COUNT;
    const lWindow = Math.max(0, 1 - ((L - HUE_WIN_L) / HUE_WIN_RADIUS) ** 2);
    bins[bin] += C * C * lWindow;
  }

  if (coloredPixels / total < ACHROMATIC_FRACTION) return null;

  const smooth = new Float64Array(HUE_BIN_COUNT);
  for (let i = 0; i < HUE_BIN_COUNT; i++) {
    const prevBin = bins[(i + HUE_BIN_COUNT - 1) % HUE_BIN_COUNT];
    const nextBin = bins[(i + 1) % HUE_BIN_COUNT];
    smooth[i] = bins[i] * 0.5 + prevBin * 0.25 + nextBin * 0.25;
  }

  let bestBin = 0;
  let bestScore = -1;
  for (let i = 0; i < HUE_BIN_COUNT; i++) {
    if (smooth[i] > bestScore) {
      bestScore = smooth[i];
      bestBin = i;
    }
  }

  return oklchToHex(HUE_REP_L, HUE_REP_C, (bestBin + 0.5) * (360 / HUE_BIN_COUNT));
};
