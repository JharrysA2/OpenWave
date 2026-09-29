/**
 * Pre-difumina una imagen y devuelve una data URL (Promise).
 *
 * Lo usa el fondo de Letras: la cadena blur+saturate+brightness sobre el
 * viewport completo costaba ~1.8% GPU re-ejecutándose en cada repintado
 * (letras/scroll), y empeoraba con will-change: filter (medido con
 * scripts/measure-perf.ps1). Dibujando la cadena UNA VEZ aquí, la capa CSS
 * queda sin `filter` y solo pinta una textura (el upsample bilinear del
 * canvas pequeño aporta la cremosidad del blur).
 *
 * Coste y bloqueo del hilo principal (medido con heartbeat de la sonda CDP,
 * portada 1400², viewport 1080p → canvas 1280×1280):
 *   - drawImage con ctx.filter: 0.2-0.5 ms (raster en GPU) → no cuenta.
 *   - canvas.toDataURL("image/webp") SÍNCRONO: 147 ms (~0.10 µs/píxel,
 *     lineal en área) bloqueando el hilo → era el longtask de 77-171 ms de
 *     cada apertura de Letras.
 *   - OffscreenCanvas.convertToBlob con el MISMO lienzo y calidad: ~122 ms
 *     de pared pero FUERA del hilo principal (hueco máximo del heartbeat
 *     18 ms vs 148 ms) → sin longtask. Por eso la función es async y ese es
 *     el camino principal; la API síncrona solo queda como fallback.
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
 * Resuelve a null si la imagen no tiene dimensiones, el canvas no está
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

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    try {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

export async function preblurToDataUrl(img, opts = {}) {
  try {
    const nw = img?.naturalWidth || 0;
    const nh = img?.naturalHeight || 0;
    if (!nw || !nh) return null;

    const viewportW = opts.viewportWidth ?? (window.innerWidth || 1920);
    const width = opts.width ?? defaultCanvasWidth();
    const blurPx = Math.round((12 * width * 10) / viewportW) / 10;
    const filter = opts.filter ?? `blur(${blurPx}px) saturate(1.2) brightness(0.7)`;
    const height = Math.max(1, Math.round((width * nh) / nw));

    // ── Camino principal: codificar fuera del hilo principal (ver cabecera).
    // convertToBlob cae a PNG si el motor no sabe WebP (spec) → en ese caso,
    // o si rechaza (p. ej. canvas contaminado), se continúa con la cadena
    // síncrona de abajo.
    if (typeof OffscreenCanvas === "function") {
      try {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.filter = filter;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
          if (blob?.type === "image/webp") {
            const url = await blobToDataUrl(blob);
            if (url) return url;
          }
        }
      } catch {
        // convertToBlob no disponible o canvas contaminado → sincrónico abajo.
      }
    }

    // ── Fallback síncrono (jsdom, motores sin OffscreenCanvas): bloquea el
    // hilo el tiempo de codificación; solo se usa como último recurso.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
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
