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
 * blur(2px) a 320w equivale a blur(12px) a 1920w (×6 de subida).
 *
 * Devuelve null si la imagen no tiene dimensiones, el canvas no está
 * disponible o el canvas queda contaminado (tainted) por CORS.
 */
export function preblurToDataUrl(
  img,
  { width = 320, filter = "blur(2px) saturate(1.2) brightness(0.7)" } = {},
) {
  try {
    const nw = img?.naturalWidth || 0;
    const nh = img?.naturalHeight || 0;
    if (!nw || !nh) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(1, Math.round((width * nh) / nw));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.filter = filter;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    // toDataURL lanza si el canvas está contaminado (imagen cross-origin sin CORS)
    return null;
  }
}
