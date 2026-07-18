import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../utils/api";

// ═════════════════════════════════════════════════════════════════════════════
//  useDynamicTheme — extracción de color de la portada + sistema de CSS vars
//  (--neon, aurora, overlay). Extraído de App.jsx sin cambiar comportamiento.
// ═════════════════════════════════════════════════════════════════════════════

// ── Helpers de color (puros) — a nivel de módulo para identidad estable ─────

// Helper: RGB → HSL
const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
};

// Helper: HSL → hex
const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// ── Opacidad del overlay en función de la luminancia del acento ─────────────
//    El overlay dibuja la aurora sobre el fondo. Un acento oscuro aguanta
//    opacidad plena, pero uno casi blanco (crema, amarillo pastel…) lavaría
//    el fondo y rompería el contraste del texto blanco.
//
//    Antes esto eran TRES umbrales discretos (0.7 / 0.85), lo que producía
//    saltos bruscos de opacidad al cambiar de canción. Ahora es una curva
//    `smoothstep` continua: sin escalones y con derivada 0 en los extremos.

/** Luminancia segura: por debajo, el acento es oscuro → overlay pleno. */
const OVERLAY_LUM_SAFE = 0.55;
/** Luminancia crítica: por encima, el acento es casi blanco → overlay mínimo. */
const OVERLAY_LUM_BRIGHT = 0.92;
/** Opacidad máxima (acento oscuro). */
const OVERLAY_MAX = 1;
/** Opacidad mínima (acento casi blanco). */
const OVERLAY_MIN = 0.08;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Interpolación smoothstep: 0 en `edge0`, 1 en `edge1`, con transición suave.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 */
export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Opacidad del overlay para una luminancia WCAG dada.
 *
 *   lum ≤ 0.55 → 1     (acento oscuro, overlay pleno)
 *   lum ≥ 0.92 → 0.08  (acento casi blanco, overlay mínimo)
 *   en medio   → curva continua
 *
 * @param {number} lum luminancia WCAG 0..1
 * @returns {number} opacidad 0.08..1
 */
export function overlayOpacityForLuminance(lum) {
  if (!Number.isFinite(lum)) return OVERLAY_MAX;
  const eased = smoothstep(OVERLAY_LUM_SAFE, OVERLAY_LUM_BRIGHT, lum);
  return OVERLAY_MAX - (OVERLAY_MAX - OVERLAY_MIN) * eased;
}

// Helper: boost color — ajuste suave de saturación y luminosidad.
const boostColor = (r, g, b) => {
  const hsl = rgbToHsl(r, g, b);
  if (hsl.l < 10) return null; // too dark
  if (hsl.s < 4) return null; // too gray
  let boostedS;
  if (hsl.s > 70) {
    boostedS = 50 + (hsl.s - 70) * 0.2;
  } else if (hsl.s > 55) {
    boostedS = 50 + (hsl.s - 55) * 0.15;
  } else if (hsl.s > 30) {
    boostedS = Math.min(hsl.s + 5, 55);
  } else {
    boostedS = Math.min(hsl.s + 12, 45);
  }
  let boostedL = hsl.l;
  if (hsl.l < 20) boostedL = Math.min(hsl.l + 10, 28);
  else if (hsl.l > 80) boostedL = Math.max(hsl.l - 10, 70);
  return hslToHex(hsl.h, boostedS, boostedL);
};

export function useDynamicTheme({ settings, currentSong }) {
  // ── Dynamic Theme (colores extraídos de la portada) ───────────────────────
  const [extractedColors, setExtractedColors] = useState(null);
  const colorFetchIdRef = useRef(0);

  // ── Animación suave de --neon vía requestAnimationFrame ─────────────────
  //    ⚠️  Usamos useLayoutEffect (NO useEffect) porque se ejecuta
  //    SINCRÓNICAMENTE después del commit de React pero ANTES del paint.
  //    Esto nos permite RESETEAR --neon al color de ORIGEN antes de que
  //    el browser pinte, evitando el flash del nuevo color.
  const prevNeonRef = useRef(null);
  const prevAuroraRef = useRef(null);

  // Helper: color distance (Euclidean in RGB space, 0-441 range)
  const colorDistance = useCallback((hex1, hex2) => {
    if (!hex1 || !hex2) return 999;
    const r1 = parseInt(hex1.slice(1, 3), 16),
      g1 = parseInt(hex1.slice(3, 5), 16),
      b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16),
      g2 = parseInt(hex2.slice(3, 5), 16),
      b2 = parseInt(hex2.slice(5, 7), 16);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  }, []);
  const neonAnimRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS DE COLOR — extracción, boost, contraste
  // ═══════════════════════════════════════════════════════════════════════════

  // Helper: WCAG Relative Luminance (0 = negro, 1 = blanco)
  const getLuminance = useCallback((hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }, []);

  // Helper: determinar colores de contraste para UI (botones, iconos)
  //    Devuelve { fg: color para icono, btn: color para fondo de botón,
  //              btnHover: color hover un 15% más claro/oscuro }
  const getContrastColors = useCallback(
    (accent) => {
      if (!accent || accent === "#a78bfa") {
        // Fallback: el morado por defecto
        return {
          fg: "#ffffff",
          btn: `color-mix(in srgb, var(--neon) 53%, transparent)`,
          btnHover: `color-mix(in srgb, var(--neon) 67%, transparent)`,
        };
      }
      const r = parseInt(accent.slice(1, 3), 16);
      const g = parseInt(accent.slice(3, 5), 16);
      const b = parseInt(accent.slice(5, 7), 16);
      const lum = getLuminance(accent);
      const hsl = rgbToHsl(r, g, b);

      if (lum > 0.45) {
        // Color claro → botón oscurecido, icono muy oscuro
        const btnL = Math.max(hsl.l - 25, 18);
        const btnS = Math.min(hsl.s, 60);
        const btnHoverL = Math.max(btnL - 10, 10); // hover más oscuro
        return {
          fg: "#111111",
          btn: hslToHex(hsl.h, btnS, btnL),
          btnHover: hslToHex(hsl.h, btnS, btnHoverL),
        };
      } else {
        // Color oscuro → botón aclarado, icono blanco
        // Más agresivo para colores muy oscuros (luminance < 0.08)
        const lightBoost = lum < 0.08 ? 45 : lum < 0.15 ? 38 : 32;
        const btnL = Math.min(hsl.l + lightBoost, 75);
        const btnS = Math.max(Math.min(hsl.s, 60), 18);
        const btnHoverL = Math.min(btnL + 10, 85); // hover más claro
        return {
          fg: "#ffffff",
          btn: hslToHex(hsl.h, btnS, btnL),
          btnHover: hslToHex(hsl.h, btnS, btnHoverL),
        };
      }
    },
    [getLuminance],
  );

  // Helper: interpolar entre dos colores hex
  const lerpHex = useCallback((a, b, t) => {
    const r = Math.round(
      parseInt(a.slice(1, 3), 16) + (parseInt(b.slice(1, 3), 16) - parseInt(a.slice(1, 3), 16)) * t,
    );
    const g = Math.round(
      parseInt(a.slice(3, 5), 16) + (parseInt(b.slice(3, 5), 16) - parseInt(a.slice(3, 5), 16)) * t,
    );
    const bl = Math.round(
      parseInt(a.slice(5, 7), 16) + (parseInt(b.slice(5, 7), 16) - parseInt(a.slice(5, 7), 16)) * t,
    );
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
  }, []);

  // Detectar si el color extraído es B/N (saturación < 15%) → usar blanco
  const isGrayscale = useMemo(() => {
    if (!extractedColors?.[0]) return false;
    const hex = extractedColors[0];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return rgbToHsl(r, g, b).s < 15;
  }, [extractedColors]);

  const neonColor = isGrayscale ? "#ffffff" : extractedColors?.[0] || "#a78bfa";

  // ── Colores de contraste derivados ──────────────────────────────────────
  const contrastColors = useMemo(
    () => getContrastColors(neonColor),
    [neonColor, getContrastColors],
  );
  const neonForeground = contrastColors.fg;
  const neonButtonBg = contrastColors.btn;
  const neonButtonBgHover = contrastColors.btnHover;

  // ── Velocidad de transición de color ───────────────────────────────────

  const cfTransitionSpeed = useMemo(() => {
    // ⚠️  NO acoplar al crossfadeDuration. El color debe transicionar
    //    con su propia velocidad independiente del crossfade de audio.
    //    Si el usuario puso 1s, que sea 1s aunque el crossfade sea 5s.
    const speed = settings.colorTransitionSpeed ?? 0.2;
    return speed === 0 ? "0s" : `${speed}s`;
  }, [settings.colorTransitionSpeed]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  ANIMACIÓN JS: useLayoutEffect para evitar el flash del nuevo color
  // ═══════════════════════════════════════════════════════════════════════════
  //
  //  El problema original: React renderiza el nuevo accentColor en los inline
  //  styles INSTANTÁNEAMENTE. useEffect corre DESPUÉS del paint. Para cuando
  //  la animación arranca, el browser ya pintó el nuevo color. El usuario ve:
  //
  //    color viejo → FLASH al nuevo → animación (pero ya está en destino)
  //
  //  La solución: useLayoutEffect se ejecuta ANTES del paint. Reseteamos
  //  --neon al color de ORIGEN justo antes de pintar, y la rAF anima suavemente.
  //
  //  Además, TODOS los elementos visuales usan var(--neon) con color-mix()
  //  para las variantes alpha, así toda la UI se actualiza en sincronía.

  useLayoutEffect(() => {
    const root = document.documentElement;
    const target = neonColor;

    // First run: set directly, no animation
    if (prevNeonRef.current === null) {
      root.style.setProperty("--neon", target);
      prevNeonRef.current = target;
      return;
    }

    // No change → nothing to do
    if (prevNeonRef.current === target) return;

    // Cancel any running animation
    if (neonAnimRef.current) cancelAnimationFrame(neonAnimRef.current);

    const start = prevNeonRef.current;

    // Instant mode
    if (settings.colorTransitionSpeed === 0) {
      root.style.setProperty("--neon", target);
      prevNeonRef.current = target;
      return;
    }

    // ⭐ RESETEAR al color de ORIGEN antes del paint.
    //    React ya commiteó el DOM con el nuevo color, pero el browser
    //    aún no ha pintado. Revertimos --neon al start para que la
    //    animación rAF parta desde el color correcto.
    root.style.setProperty("--neon", start);

    const duration = parseFloat(cfTransitionSpeed) * 1000;
    const startTime = performance.now();

    function animate(time) {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic: deceleración natural
      const eased = 1 - Math.pow(1 - t, 3);

      const hex = lerpHex(start, target, eased);
      root.style.setProperty("--neon", hex);

      if (t < 1) {
        neonAnimRef.current = requestAnimationFrame(animate);
      } else {
        // Ensure we land exactly on the target
        root.style.setProperty("--neon", target);
        prevNeonRef.current = target;
      }
    }

    neonAnimRef.current = requestAnimationFrame(animate);

    return () => {
      if (neonAnimRef.current) cancelAnimationFrame(neonAnimRef.current);
    };
  }, [neonColor, cfTransitionSpeed, settings.colorTransitionSpeed, lerpHex]);

  // ── Overlay backdrop y condiciones ──────────────────────────────────────

  // Helper: color base oscuro según preferencia
  const getDarkBase = useCallback(
    () => (settings.pureBlack ? "#000" : "#0a0a0f"),
    [settings.pureBlack],
  );

  const bgBase = useMemo(() => getDarkBase(), [getDarkBase]);

  const hasAccent = useMemo(
    () => settings.dynamicTheme && extractedColors && neonColor !== "#a78bfa",
    [settings.dynamicTheme, extractedColors, neonColor],
  );

  // ── Fondo tintado dinámico: CSS variable --bg-base se actualiza con var(--neon)
  //    para que el fondo herede la animación rAF y transicione suavemente.
  const bgStyle = useMemo(
    () => ({
      background: `var(--bg-base, ${bgBase})`,
    }),
    [bgBase],
  );

  // ── Opacidad del overlay: suave y siempre presente cuando dynamicTheme está activo ──
  //    Incluso con el color default (#a78bfa) se ve sutil, y transiciona suavemente.
  //    Para acentos muy brillantes la opacidad baja siguiendo una CURVA
  //    continua (smoothstep), así el cambio de canción no salta de golpe.
  const overlayOpacity = useMemo(() => {
    if (!settings.dynamicTheme) return 0;
    if (!hasAccent) return 0.35;
    return overlayOpacityForLuminance(getLuminance(neonColor));
  }, [settings.dynamicTheme, hasAccent, neonColor, getLuminance]);
  // ── Extraer colores de la portada (API + canvas SIEMPRE en paralelo) ─────

  useEffect(() => {
    if (!currentSong?.videoId || !settings.dynamicTheme) {
      setExtractedColors(null);
      return;
    }

    const fetchId = ++colorFetchIdRef.current;
    // 🔄 NO reseteamos extractedColors — el color anterior persiste hasta
    //    que el canvas/API devuelva el nuevo.
    const videoId = currentSong.videoId;
    const thumbUrl = currentSong.thumbnail;

    // ── Result flag: tracking si ALGÚN método logró extraer ──────────────
    let gotColors = false;

    // Helper: extraer colores dominantes de datos de imagen via canvas.
    //    Estrategia:
    //      1. Filtra píxeles casi-blancos (brightness > 222) porque
    //         esos dominan el conteo en portadas como dorado+blanco.
    //      2. Filtra píxeles casi-negros (brightness < 10).
    //      3. Cuantiza en buckets de 12 (más fino que 16).
    //      4. Puntúa con peso cuadrático de saturación (s² × 5)
    //         para que colores vívidos como dorado o naranja
    //         ganen aunque sean minoría frente a tonos piel.
    const extractFromImageData = (imgData) => {
      const BUCKET_SIZE = 12;
      const buckets = {};
      let totalExamined = 0;
      let totalFilteredGray = 0;
      let _totalFilteredBright = 0;

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const brightness = (r + g + b) / 3;
        totalExamined++;

        // ⭐ FILTRAR casi-blanco: así el dorado no compite contra blanco
        if (brightness < 10 || brightness > 222) {
          if (brightness > 222) _totalFilteredBright++;
          continue;
        }

        // ⭐ FILTRAR casi-gris: diferencia entre canales < 20
        //    Esto evita que grises y tonos piel muy desaturados
        //    dominen el conteo (caso: portada naranja+gris → blanco)
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if (maxC - minC < 20) {
          totalFilteredGray++;
          continue;
        }

        const key = `${Math.floor(r / BUCKET_SIZE) * BUCKET_SIZE},${Math.floor(g / BUCKET_SIZE) * BUCKET_SIZE},${Math.floor(b / BUCKET_SIZE) * BUCKET_SIZE}`;
        buckets[key] = (buckets[key] || 0) + 1;
      }

      // Log para debug
      if (totalFilteredGray > totalExamined * 0.5) {
        console.info(
          `[DynamicTheme] Filtered ${totalFilteredGray}/${totalExamined} near-gray pixels`,
        );
      }

      // Si hay muy pocos buckets, es imagen muy oscura, casi blanca o casi gris
      if (Object.keys(buckets).length < 3) {
        console.info("[DynamicTheme] ⚠️ Too few color buckets (image too dark/light/gray)");
        return ["#ffffff", "#cccccc"];
      }

      // ⭐ Peso cuadrático: saturación² × 5 ⇒ colores vivos dominan
      const half = BUCKET_SIZE / 2;
      const scored = Object.entries(buckets).map(([key, count]) => {
        const [r, g, b] = key.split(",").map(Number);
        const { s } = rgbToHsl(r + half, g + half, b + half);
        const satWeight = 1 + (s / 100) * (s / 100) * 6; // ⭐ 6 (antes 5)
        return { key, count, score: count * satWeight };
      });
      const sorted = scored.sort((a, b) => b.score - a.score);

      // Tomar top colores boosteados
      const boosted = [];
      for (const { key } of sorted) {
        const [r, g, b] = key.split(",").map(Number);
        const hex = boostColor(r + half, g + half, b + half);
        if (hex && !boosted.includes(hex)) {
          boosted.push(hex);
        }
        if (boosted.length >= 3) break;
      }

      // Fallback: RGB crudos (solo si boost falló)
      if (boosted.length === 0 && sorted.length > 0) {
        const fallbacks = [];
        for (const { key } of sorted) {
          const [r, g, b] = key.split(",").map(Number);
          // Calcular sat de este bucket; si es muy baja, skip
          const { s } = rgbToHsl(r + half, g + half, b + half);
          if (s < 5) continue;
          const hex = `#${(r + half).toString(16).padStart(2, "0")}${(g + half).toString(16).padStart(2, "0")}${(b + half).toString(16).padStart(2, "0")}`;
          if (!fallbacks.includes(hex)) fallbacks.push(hex);
          if (fallbacks.length >= 3) break;
        }
        // Si aún así no hay nada, tomar el primer bucket aunque sea gris
        if (fallbacks.length === 0 && sorted.length > 0) {
          const [r, g, b] = sorted[0].key.split(",").map(Number);
          fallbacks.push(
            `#${(r + half).toString(16).padStart(2, "0")}${(g + half).toString(16).padStart(2, "0")}${(b + half).toString(16).padStart(2, "0")}`,
          );
        }
        console.info(
          "[DynamicTheme] ⚠️ boostColor returned nothing, using raw fallbacks:",
          fallbacks,
        );
        return fallbacks;
      }

      return boosted;
    };

    // ── Vía 1: Backend API ──────────────────────────────────────────────────
    api
      .get(`/extract-colors/${videoId}`)
      .then((data) => {
        if (fetchId !== colorFetchIdRef.current) return;
        // ⭐ Si el canvas YA extrajo colores, no sobreescribir!
        if (gotColors) return;
        if (data?.colors?.length > 0) {
          const first = data.colors[0].toLowerCase();
          console.info(
            `[DynamicTheme] API returned: ${data.colors[0]} (videoId: ${videoId.slice(0, 8)}…)`,
          );
          const r = parseInt(first.slice(1, 3), 16);
          const g = parseInt(first.slice(3, 5), 16);
          const b = parseInt(first.slice(5, 7), 16);
          const isBn = rgbToHsl(r, g, b).s < 10;
          // ✅ Aceptar solo si el color principal NO es grisáceo,
          //    sin importar cuántos colores devuelva el array.
          if (isBn) {
            console.info("[DynamicTheme] ⏳ API returned grayscale primary, waiting for canvas…");
          } else {
            console.info("[DynamicTheme] ✅ Using API colors:", data.colors);
            gotColors = true;
            setExtractedColors(data.colors);
          }
        } else {
          console.info("[DynamicTheme] ⏳ API returned empty colors, waiting for canvas…");
        }
      })
      .catch((err) => {
        console.warn("[DynamicTheme] API failed:", err?.message);
      });

    // ── Vía 2: Canvas desde thumbnail ───────────────────────────────────────
    //    Primero intenta carga directa con crossOrigin (para CORS).
    //    Si falla (ej: YouTube bloquea CORS de la URL directa),
    //    reintenta con el proxy del backend que SÍ devuelve CORS headers.
    if (thumbUrl) {
      const proxyUrl = `${api.base}/thumbnail-proxy?url=${encodeURIComponent(thumbUrl)}`;

      const tryLoad = (url, isRetry) => {
        const i = new Image();
        // crossOrigin = "anonymous" es ESENCIAL: sin él el canvas se "tainta"
        // y ctx.getImageData() lanza SecurityError.
        i.crossOrigin = "anonymous";

        i.onload = () => {
          if (fetchId !== colorFetchIdRef.current) return;
          if (gotColors) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(i, 0, 0, 64, 64);
            const colors = extractFromImageData(ctx.getImageData(0, 0, 64, 64).data);
            if (colors.length > 0) {
              console.info(
                `[DynamicTheme] ✅ Canvas${isRetry ? " (proxy)" : " (direct)"} extracted:`,
                colors,
              );
              gotColors = true;
              setExtractedColors(colors);
            }
          } catch (ce) {
            console.warn("[DynamicTheme] Canvas error:", ce);
          }
        };

        i.onerror = () => {
          // Si falla la carga directa (CORS), reintentar con proxy
          if (!isRetry && url !== proxyUrl) {
            console.info("[DynamicTheme] Direct load failed, retrying via proxy…");
            tryLoad(proxyUrl, true);
          } else {
            console.warn("[DynamicTheme] Canvas image load failed for:", url.slice(0, 80));
          }
        };

        i.src = url;
      };

      tryLoad(thumbUrl, false);
    }
  }, [currentSong?.videoId, settings.dynamicTheme, currentSong?.thumbnail]);
  // ── CSS variables globales dinámicas ───────────────────────────────────────
  //    @property --neon, keyframes y prefers-reduced-motion están en index.html
  //    para que existan desde el PRIMER render (antes de que React cargue).

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--neon-border", `${neonColor}aa`);
    root.style.setProperty("--neon-18", `${neonColor}2e`);
    root.style.setProperty("--neon-fg", neonForeground);
    root.style.setProperty("--neon-btn", neonButtonBg);
    root.style.setProperty("--neon-btn-hover", neonButtonBgHover);
    root.style.setProperty("--corner-radius", `${settings.cornerRadius || 12}px`);
    // ── Fondo tintado dinámico: usa var(--neon) como referencia para que
    //    el fondo herede la animación rAF del useLayoutEffect y transicione suavemente.
    const darkBase = getDarkBase();
    root.style.setProperty("--bg-base", `color-mix(in srgb, var(--neon) 6%, ${darkBase})`);
    // ── Aurora mesh gradient: 3 blobs ALL from the song's accent color ──
    // Only update if color changed significantly (distance > 40 ≈ perceptible)
    const auroraDist = colorDistance(prevAuroraRef.current, neonColor);
    if (auroraDist > 40 || !prevAuroraRef.current) {
      root.style.setProperty("--aurora-1", neonColor);
      root.style.setProperty("--aurora-2", `${neonColor}aa`);
      root.style.setProperty("--aurora-3", `${neonColor}66`);
      prevAuroraRef.current = neonColor;
    }

    let style = document.getElementById("sw-slider-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "sw-slider-style";
      document.head.appendChild(style);
      style.textContent = `
          input[type="range"] {
            -webkit-appearance: none !important;
            appearance: none !important;
            width: 100%;
            height: 4px;
            border-radius: 2px;
            background: rgba(255,255,255,.08) !important;
            outline: none !important;
            cursor: pointer;
            margin: 8px 0;
            accent-color: transparent !important;
            padding: 0;
          }
          input[type="range"]::-webkit-slider-runnable-track {
            height: 4px;
            border-radius: 2px;
            background: rgba(255,255,255,.08);
          }
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none !important;
            appearance: none !important;
            width: 14px;
            height: 14px;
            border-radius: 9999px;
            background: var(--neon) !important;
            margin-top: -5px;
            cursor: pointer;
            border: 2px solid rgba(255,255,255,.2);
            box-shadow: 0 0 12px color-mix(in srgb, var(--neon) 93%, transparent), 0 0 24px color-mix(in srgb, var(--neon) 40%, transparent), 0 2px 4px rgba(0,0,0,.3);
            transition: transform .15s, box-shadow .15s, opacity .15s;
            opacity: 0;
          }
          input[type="range"]:hover::-webkit-slider-thumb {
            opacity: 1;
          }
          input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.25) !important;
            box-shadow: 0 0 20px var(--neon), 0 0 40px color-mix(in srgb, var(--neon) 53%, transparent), 0 2px 8px rgba(0,0,0,.4);
          }
          input[type="range"]:focus-visible::-webkit-slider-thumb {
            opacity: 1;
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--neon) 53%, transparent), 0 0 16px color-mix(in srgb, var(--neon) 80%, transparent) !important;
          }
          input[type="range"]::-moz-range-track {
            height: 4px;
            border-radius: 2px;
            background: rgba(255,255,255,.08);
            border: none;
          }
          input[type="range"]::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 9999px;
            background: var(--neon);
            cursor: pointer;
            border: 2px solid rgba(255,255,255,.2);
            opacity: 0;
          }
          input[type="range"]:hover::-moz-range-thumb {
            opacity: 1;
          }
          ::placeholder, ::-webkit-input-placeholder, :-moz-placeholder, ::-moz-placeholder {
            color: rgba(255,255,255,.4) !important;
            opacity: 1 !important;
          }
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,.12);
            border-radius: 4px;
            border: 2px solid transparent;
            background-clip: content-box;
            transition: background .2s;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: color-mix(in srgb, var(--neon) 67%, transparent);
            border: 2px solid transparent;
            background-clip: content-box;
          }
          ::-webkit-scrollbar-corner {
            background: transparent;
          }
          * {
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,.12) transparent;
          }
        `;
    }
  }, [
    neonColor,
    neonForeground,
    neonButtonBg,
    neonButtonBgHover,
    settings.cornerRadius,
    getDarkBase,
    colorDistance,
  ]);

  return {
    neonColor,
    neonForeground,
    neonButtonBg,
    neonButtonBgHover,
    cfTransitionSpeed,
    getDarkBase,
    colorDistance,
    bgStyle,
    overlayOpacity,
    hasAccent,
  };
}
