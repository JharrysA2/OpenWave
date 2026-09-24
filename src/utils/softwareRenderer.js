// ═══════════════════════════════════════════════════════════════════════════════
//  Detección de render por software (sin GPU dedicada).
//
//  Sin GPU rasteriza TODO en CPU (llvmpipe/SwiftShader) y los efectos de cristal
//  (backdrop-filter) cuestan ~×10 más que con aceleración real. En ese caso la
//  app debe arrancar en modo bajo consumo (perfMode "auto"); con GPU real
//  (Windows) "auto" resuelve a equilibrado y no se toca nada.
// ═══════════════════════════════════════════════════════════════════════════════

/** Cadenas del renderer WebGL que indican rasterización por software. */
const SOFTWARE_MARKERS = [
  "llvmpipe",
  "swiftshader",
  "softpipe",
  "software",
  "microsoft basic render",
  "mesa offscreen",
];

/** Fabricantes de GPU reales: su presencia confirma aceleración de hardware. */
const GPU_VENDORS = [
  "nvidia",
  "geforce",
  "quadro",
  "radeon",
  "amd",
  "intel",
  "apple",
  "mali",
  "adreno",
  "qualcomm",
  "arm",
  "powervr",
  "imagination",
  "vivante",
  "broadcom",
  "mediatek",
];

/**
 * Detecta si el navegador rasteriza por software.
 * @param {() => WebGLRenderingContext|null} [createGl] fábrica inyectable (tests)
 * @returns {boolean} true = sin GPU usable (o sin WebGL)
 */
export function detectSoftwareRenderer(createGl) {
  try {
    const makeGl =
      createGl ||
      (() => {
        if (typeof document === "undefined") return null;
        const canvas = document.createElement("canvas");
        return canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      });
    const gl = makeGl();
    if (!gl) return true; // Sin WebGL no hay aceleración usable

    let renderer = "";
    try {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(
        dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      );
    } catch {
      renderer = String(gl.getParameter?.(gl.RENDERER) || "");
    }
    const r = renderer.toLowerCase();

    // 1) Marcadores clásicos de rasterizador por software.
    if (SOFTWARE_MARKERS.some((m) => r.includes(m))) return true;

    // 2) «Apple GPU» es la cadena POR DEFECTO de WebCore cuando la plataforma no
    //    informa del hardware real (p. ej. webkit2gtk sin GPU dedicada): la
    //    reporta aunque no haya Apple ni GPU. Solo es creíble en macOS.
    const isMac =
      typeof navigator !== "undefined" &&
      /mac/i.test(String(navigator.platform || navigator.userAgent || ""));
    if (r.includes("apple gpu") && !isMac) return true;

    // 3) Si el string no nombra a ningún fabricante de GPU real («WebKit WebGL»
    //    genérico, enmascarado o vacío): no hay forma de confirmar aceleración,
    //    así que modo seguro (bajo consumo). Windows con GPU real (WebView2/ANGLE)
    //    sí expone el fabricante (NVIDIA/AMD/Intel…) y queda en equilibrado.
    return !GPU_VENDORS.some((v) => r.includes(v));
  } catch {
    return true; // ante cualquier duda: modo seguro (bajo consumo)
  }
}

let cached = null;

/** Resultado cacheado por pestaña (la GPU no cambia en caliente). */
export function isSoftwareRenderer() {
  if (cached === null) cached = detectSoftwareRenderer();
  return cached;
}

/** Solo para tests. */
export function resetSoftwareRendererCache() {
  cached = null;
}
