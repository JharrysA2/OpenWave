import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../utils/api";
import { deriveTheme, extractOklchAccent, getLuminance, BASE } from "../utils/colorTheme";

// ═════════════════════════════════════════════════════════════════════════════
//  useDynamicTheme — extracción de color de la portada (OKLCH) + CSS vars
//  (--neon, --neon-fg, --neon-transition, --bg-base, --corner-radius).
//  El resto de variables derivadas (--neon-border, --neon-btn, aurora…)
//  se escriben SOLO una vez en src/dynamic-theme.css usando color-mix().
// ═════════════════════════════════════════════════════════════════════════════

// ── Acentos por defecto (sin extracción / tema apagado) ─────────────────────

const DEFAULT_ACCENT = "#a78bfa";
const DEFAULT_ACCENT_FG = "#ffffff";

// Tema acromático (portada en B/N o casi blanca). El acento es blanco puro y
// el on-accent negro puro; la derivación OKLCH no aplica (no hay tono).
const ACHROMATIC_THEME = Object.freeze({
  accent: "#ffffff",
  onAccent: "#111111",
  ambient: "#8e8e96",
});

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

export function useDynamicTheme({ settings, currentSong }) {
  // ── Dynamic Theme (colores derivados de la portada) ───────────────────────
  //    `extractedTheme` es null hasta que el canvas responde, o el objeto
  //    { accent, onAccent, ambient } de la portada actual (o el Tema
  //    acromático si la extracción concluye que no hay tono).
  const [extractedTheme, setExtractedTheme] = useState(null);
  const colorFetchIdRef = useRef(0);

  // ── Velocidad de transición de color ───────────────────────────────────

  const cfTransitionSpeed = useMemo(() => {
    // ⚠️  NO acoplar al crossfadeDuration. El color debe transicionar
    //    con su propia velocidad independiente del crossfade de audio.
    //    Si el usuario puso 1s, que sea 1s aunque el crossfade sea 5s.
    const speed = settings.colorTransitionSpeed ?? 0.2;
    return speed === 0 ? "0s" : `${speed}s`;
  }, [settings.colorTransitionSpeed]);

  const neonColor = extractedTheme?.accent || DEFAULT_ACCENT;
  const neonForeground = extractedTheme?.onAccent || DEFAULT_ACCENT_FG;

  const hasAccent = useMemo(
    () => settings.dynamicTheme && extractedTheme !== null,
    [settings.dynamicTheme, extractedTheme],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  FONDO TINTADO: --bg-base usa var(--neon) para que el fondo herede la
  //  transición CSS de --neon (no hay animación rAF: la interpolación la hace
  //  el navegador vía @property --neon + `transition: --neon` en el CSS).
  // ═══════════════════════════════════════════════════════════════════════════

  const bgBase = useMemo(() => (settings.pureBlack ? "#000" : BASE), [settings.pureBlack]);

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
  }, [settings.dynamicTheme, hasAccent, neonColor]);

  // ── Extraer colores de la portada vía canvas (nuevo algoritmo OKLCH) ─────

  useEffect(() => {
    if (!currentSong?.videoId || !settings.dynamicTheme) {
      setExtractedTheme(null);
      return;
    }

    const fetchId = ++colorFetchIdRef.current;
    // 🔄 NO reseteamos extractedTheme — el color anterior persiste hasta
    //    que el canvas devuelva el nuevo.
    const thumbUrl = currentSong.thumbnail;

    // ── Result flag: evita que una respuesta tardía pise la ganadora ──────
    let gotTheme = false;

    const applyTheme = (repHex, source) => {
      if (fetchId !== colorFetchIdRef.current) return;
      if (gotTheme) return;
      gotTheme = true;
      if (repHex === null) {
        console.info(`[DynamicTheme] ⚪ Imagen acromática (${source}) → blanco/negro`);
        setExtractedTheme(ACHROMATIC_THEME);
      } else {
        console.info(`[DynamicTheme] ✅ ${source} extraído: ${repHex}`);
        setExtractedTheme(deriveTheme(repHex));
      }
    };

    // ── Canvas desde thumbnail ─────────────────────────────────────────────
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
          if (gotTheme) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(i, 0, 0, 64, 64);
            const repHex = extractOklchAccent(ctx.getImageData(0, 0, 64, 64).data);
            applyTheme(repHex, isRetry ? "proxy" : "direct");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.videoId, settings.dynamicTheme]);

  // ── CSS variables globales dinámicas ───────────────────────────────────────
  //    Solo se escriben inline las que dependen de la canción. Las que son
  //    fórmulas estáticas de var(--neon) viven en src/dynamic-theme.css
  //    (color-mix) y en index.html (@property --neon, keyframes, reduced-motion).

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--neon", neonColor);
    root.style.setProperty("--neon-fg", neonForeground);
    root.style.setProperty("--neon-transition", cfTransitionSpeed);
    root.style.setProperty("--corner-radius", `${settings.cornerRadius || 12}px`);
    // ── Fondo tintado dinámico: usa var(--neon) como referencia para que
    //    el fondo herede la transición CSS de --neon.
    root.style.setProperty("--bg-base", `color-mix(in srgb, var(--neon) 6%, ${bgBase})`);
  }, [neonColor, neonForeground, cfTransitionSpeed, settings.cornerRadius, bgBase]);

  return {
    neonColor,
    neonForeground,
    cfTransitionSpeed,
    bgStyle,
    overlayOpacity,
    hasAccent,
  };
}
