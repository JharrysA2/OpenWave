/**
 * Motor del vidrio líquido.
 *
 * El motor no pinta nada: calcula el campo de desplazamiento que usa el
 * filtro SVG (`feDisplacementMap`) para doblar la escena en el borde de una
 * superficie. La lente se modela con la distancia firmada (SDF) de un
 * rectángulo redondeado: el centro queda intacto y solo el anillo exterior
 * desplaza la muestra, como una lente de canto.
 *
 * Todo se calcula una vez por tamaño y se cachea. No hay bucles por frame.
 */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Distancia firmada a un rectángulo redondeado centrado en (w/2, h/2).
 * Negativa dentro, positiva fuera. Es la misma fórmula que usa el motor
 * nativo para la silueta del cristal.
 */
export function sdfRoundRect(px, py, w, h, r) {
  if (w <= 0 || h <= 0) return 1;
  const radius = clamp(r, 0, Math.min(w, h) / 2);
  const qx = Math.abs(px - w / 2) - (w / 2 - radius);
  const qy = Math.abs(py - h / 2) - (h / 2 - radius);
  const ax = qx > 0 ? qx : 0;
  const ay = qy > 0 ? qy : 0;
  return Math.min(Math.max(qx, qy), 0) + Math.sqrt(ax * ax + ay * ay) - radius;
}

/**
 * Normal analítica del SDF (hacia fuera). Evita cuatro evaluaciones extra de
 * la SDF por píxel dentro del bucle del mapa.
 */
export function sdfRoundRectNormal(px, py, w, h, r) {
  const radius = clamp(r, 0, Math.min(w, h) / 2);
  const qx = Math.abs(px - w / 2) - (w / 2 - radius);
  const qy = Math.abs(py - h / 2) - (h / 2 - radius);
  const sx = px < w / 2 ? -1 : 1;
  const sy = py < h / 2 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const len = Math.sqrt(qx * qx + qy * qy) || 1;
    return { nx: (sx * qx) / len, ny: (sy * qy) / len };
  }
  if (qx > qy) return { nx: sx, ny: 0 };
  return { nx: 0, ny: sy };
}

/**
 * Grosor del anillo de lente y desplazamiento máximo.
 *
 * `rim` es la anchura del canto que se dobla; `maxDisp` es cuántos píxeles
 * puede separarse la muestra en el borde. El IOR se normaliza respecto al
 * vidrio (1.5): por debajo dobla menos, por encima más.
 */
export function glassGeometry(settings = {}, width, height) {
  if (!(width > 0) || !(height > 0)) {
    return { rim: 0, maxDisp: 0, margin: 0, dispersion: 0 };
  }
  const thick = settings.glassDepth === "thick";
  const short = Math.max(1, Math.min(width, height));
  // En una barra baja (84 px) un canto de 30 px invade demasiado: se limita
  // al 44 % del lado corto. En una hoja alta crece hasta el valor nominal.
  const nominal = thick ? 30 : 14;
  const rim = clamp(Math.min(nominal, short * 0.44), 6, short * 0.44);
  const ior = clamp(Number(settings.glassIor) || 1.5, 1, 2);
  const iorFactor = clamp((ior - 1) / 0.5, 0.35, 2);
  const refraction = clamp((Number(settings.glassRefraction) || 0) / 60, 0, 1.6);
  const maxDisp = clamp(rim * 0.72 * iorFactor * refraction, 0, rim);
  const margin = Math.ceil(maxDisp + 8);
  const dispersion = clamp((Number(settings.glassDispersion) || 0) / 100, 0, 1) * 0.03;
  return { rim, maxDisp, margin, dispersion };
}

function neutralPixel(data, i) {
  data[i] = 128;
  data[i + 1] = 128;
  data[i + 2] = 128;
  data[i + 3] = 255;
}

/**
 * Construye el mapa RGBA que consume `feDisplacementMap`.
 *
 * R y G guardan el desplazamiento normalizado en [-1, 1] (128 = sin
 * desplazamiento). El margen exterior permite muestrear fuera del recorte
 * de la superficie, que es lo que produce la lente convexa del borde.
 */
export function buildLensField({ width, height, radius = 0, rim = 14, maxDisp = 8, margin = 0 }) {
  const mw = Math.max(1, Math.round(width + margin * 2));
  const mh = Math.max(1, Math.round(height + margin * 2));
  const data = new Uint8ClampedArray(mw * mh * 4);
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  const rimPx = Math.max(1, rim);
  const strength = Math.max(1e-3, maxDisp);

  for (let y = 0; y < mh; y += 1) {
    for (let x = 0; x < mw; x += 1) {
      const i = (y * mw + x) * 4;
      const lx = x - margin;
      const ly = y - margin;
      const d = -sdfRoundRect(lx, ly, width, height, r);
      if (d < 0 || d > rimPx) {
        neutralPixel(data, i);
        continue;
      }
      // Perfil suave: máximo en el canto (t=0) y cero al llegar al interior
      // del anillo (t=1). Así no hay línea dura donde empieza la lente.
      const t = d / rimPx;
      const profile = (1 - t) * (1 - t);
      if (profile <= 0.0001) {
        neutralPixel(data, i);
        continue;
      }
      const { nx, ny } = sdfRoundRectNormal(lx, ly, width, height, r);
      const dx = nx * profile * strength;
      const dy = ny * profile * strength;
      data[i] = Math.round(128 + (dx / strength) * 127);
      data[i + 1] = Math.round(128 + (dy / strength) * 127);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  return { width: mw, height: mh, data, margin, rim: rimPx, maxDisp: strength };
}

const fieldCache = new Map();
const urlCache = new Map();
const MAX_CACHE = 16;

function cacheGet(cache, key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(cache, key, value) {
  cache.set(key, value);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

export function lensCacheKey(params) {
  return [
    Math.round(params.width),
    Math.round(params.height),
    Math.round(params.radius || 0),
    Math.round(params.rim || 0),
    Math.round((params.maxDisp || 0) * 10) / 10,
    Math.round(params.margin || 0),
  ].join(":");
}

export function getLensField(params) {
  const key = lensCacheKey(params);
  const cached = cacheGet(fieldCache, key);
  if (cached) return cached;
  const field = buildLensField(params);
  cacheSet(fieldCache, key, field);
  return field;
}

/** Convierte el campo en PNG (data URL) para `feImage`. En jsdom no hay
 * canvas real: devuelve null y el componente usa solo el tinte + rim. */
export function lensFieldToDataUrl(field) {
  if (!field || typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = field.width;
    canvas.height = field.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(field.width, field.height);
    image.data.set(field.data);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function getLensMap(params) {
  const key = lensCacheKey(params);
  if (urlCache.has(key)) {
    const url = urlCache.get(key);
    return { field: getLensField(params), url };
  }
  const field = getLensField(params);
  const url = lensFieldToDataUrl(field);
  if (url) cacheSet(urlCache, key, url);
  return { field, url };
}

export function clearLensCache() {
  fieldCache.clear();
  urlCache.clear();
}

/** Rectángulo que ocupa una imagen con `object-fit: cover` en el viewport. */
export function computeSceneCover(imageWidth, imageHeight, viewWidth, viewHeight) {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(viewWidth > 0) || !(viewHeight > 0)) {
    return { width: 0, height: 0, left: 0, top: 0 };
  }
  const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    width,
    height,
    left: (viewWidth - width) / 2,
    top: (viewHeight - height) / 2,
  };
}

/**
 * Coordenadas de la escena dentro de una superficie recortada. La copia de
 * la escena tiene que quedar exactamente alineada con la escena de fondo:
 * se resta la posición de la superficie y se suma el margen de la lente.
 */
export function sceneOffsetForRect(cover, rect, margin = 0) {
  return {
    backgroundSize: `${cover.width}px ${cover.height}px`,
    backgroundPosition: `${cover.left - (rect.left - margin)}px ${
      cover.top - (rect.top - margin)
    }px`,
  };
}

/** Vector unitario para el gradiente del rim, en coordenadas 0..1. */
export function angleToUnitVector(angle = 0) {
  const rad = ((Number(angle) || 0) * Math.PI) / 180;
  const cx = Math.cos(rad) * 0.5;
  const cy = Math.sin(rad) * 0.5;
  return {
    x1: 0.5 - cx,
    y1: 0.5 - cy,
    x2: 0.5 + cx,
    y2: 0.5 + cy,
  };
}
