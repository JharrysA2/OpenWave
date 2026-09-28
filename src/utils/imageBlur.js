/**
 * Pre-difumina una imagen en un canvas pequeño y devuelve una data URL.
 *
 * Lo usa el fondo de Letras: la cadena blur+saturate+brightness sobre el
 * viewport completo costaba ~1.8% GPU re-ejecutándose en cada repintado
 * (letras/scroll), y empeoraba con will-change: filter (medido con
 * scripts/measure-perf.ps1). Dibujando la cadena UNA VEZ aquí, la capa CSS
 * queda sin `filter` y solo pinta una textura (el upsample bilinear del
 * canvas pequeño aporta la cremosidad del blur).
 *
 * Calidad (v1 del canvas a 320px se veía pixelado al estirarse 6×: los
 * bloques JPEG de 8px se agrandaban ~48px):
 *   - El canvas cubre el viewport con ~1.5× de subida (960–1440 px según
 *     pantalla; en 1080p sale 1280 → subida de 1.5×, no de 6×).
 *   - Se codifica en WebP (sin bloques DCT visibles) con fallback JPEG q.92
 *     si el motor no lo soporta.
 *   - imageSmoothingQuality "high" para el downscale de la fuente.
 *
 * El radio de blur se elige para que tras el upsample equivalga al
 * blur(12px) CSS del viewport completo de siempre:
 *   r_canvas = 12 px × (anchoCanvas / anchoViewport)
 *
 * Devuelve null si la imagen no tiene dimensiones, el canvas no está
 * disponible o el canvas queda contaminado (tainted) por CORS.
 */
function defaultCanvasWidth() {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const deviceW = (window.innerWidth || 1920) * dpr;
    // ~1.5× de subida, con suelo 960 y techo 1440 (coste único por canción)
    return Math.round(Math.min(1440, Math.max(960, deviceW / 1.5)));
  } catch {
    return 960;
  }
}

export function preblurToDataUrl(img, opts = {}) {
  try {
    const nw = img?.naturalWidth || 0;
    const nh = img?.naturalHeight || 0;
    if (!nw || !nh) return null;

    const viewportW = opts.viewportWidth ?? (window.innerWidth || 1920);
    const width = opts.width ?? defaultCanvasWidth();
    const blurPx = Math.round((12 * width * 10) / viewportW) / 10;
    const filter = opts.filter ?? `blur(${blurPx}px) saturate(1.2) brightness(0.7)`;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(1, Math.round((width * nh) / nw));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.filter = filter;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // WebP: sin bloques DCT. Si el motor no lo soporta (devuelve "data:,"),
    // cae a JPEG de mayor calidad que la v1 (q.82).
    const primary = canvas.toDataURL("image/webp", 0.9);
    if (primary?.startsWith("data:image/webp")) return primary;
    const fallback = canvas.toDataURL("image/jpeg", 0.92);
    return fallback?.startsWith("data:image/jpeg") ? fallback : null;
  } catch {
    // toDataURL lanza si el canvas está contaminado (imagen cross-origin sin CORS)
    return null;
  }
}
