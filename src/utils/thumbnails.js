/**
 * SoundWave — Fuente única de verdad para thumbnails HD
 *
 * Antes esta lógica estaba duplicada en TRES lugares:
 *   • `utils/api.js`         → generateThumbsHD()
 *   • `hooks/usePlayer.js`   → generateThumbsHD()
 *   • `components/MusicCover.jsx` → generación inline de srcset/blur
 *
 * Ahora todo vive aquí. Cualquier cambio de resoluciones, formato de
 * srcset o criterio de "cuál es la imagen más pequeña para blur"
 * se hace UNA sola vez.
 *
 * Uso:
 *   import { withHDThumbnails } from "../utils/thumbnails";   // normalizar una canción
 *   import { getCoverSources } from "../utils/thumbnails";    // pintar un <img srcSet>
 */

// ── Patrones / resoluciones ──────────────────────────────────────────────────

/** Extrae el videoId de una URL de YouTube (i.ytimg.com/vi/{id}/...) */
export const YT_THUMB_REGEX = /\/vi\/([a-zA-Z0-9_-]+)\//;

/**
 * Resoluciones estándar de YouTube, de mayor a menor.
 * Es el ORDEN CANÓNICO: los consumidores asumen descendente.
 */
export const YT_THUMB_SIZES = [
  { res: "maxresdefault", width: 1280, height: 720 },
  { res: "sddefault", width: 640, height: 480 },
  { res: "hqdefault", width: 480, height: 360 },
  { res: "mqdefault", width: 320, height: 180 },
];

/**
 * Resoluciones de googleusercontent, de menor a mayor (orden canónico).
 * El sufijo se concatena a la URL base (`base + suffix`).
 */
export const GOOGLE_THUMB_SIZES = [
  { suffix: "=w120-h120-l90-rj", width: 120, height: 120 },
  { suffix: "=w226-h226-l90-rj", width: 226, height: 226 },
  { suffix: "=w576-h576-l90-rj", width: 576, height: 576 },
  { suffix: "=w1200-h1200-l90-rj", width: 1200, height: 1200 },
  { suffix: "=w2048-h2048-l90-rj", width: 2048, height: 2048 },
];

// ── Helpers de detección ─────────────────────────────────────────────────────

/** ¿Es una URL de googleusercontent? */
export function isGoogleThumbUrl(url) {
  return Boolean(url) && url.includes("googleusercontent.com");
}

/** ¿Es una URL de thumbnail de YouTube? */
export function isYoutubeThumbUrl(url) {
  return Boolean(url) && YT_THUMB_REGEX.test(url);
}

/** Extrae el videoId de una URL de YouTube, o null. */
export function youtubeVideoIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(YT_THUMB_REGEX);
  return match ? match[1] : null;
}

/** URL base de googleusercontent (sin parámetros de tamaño). */
export function googleThumbBase(url) {
  if (!isGoogleThumbUrl(url)) return null;
  return url.split("=")[0];
}

// ── Generadores ──────────────────────────────────────────────────────────────

/**
 * URL de YouTube para una resolución concreta.
 * @param {string} videoId
 * @param {string} res - 'maxresdefault' | 'sddefault' | 'hqdefault' | 'mqdefault'
 */
export function ytThumbUrl(videoId, res) {
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/${res}.jpg`;
}

/** Las 4 resoluciones de YouTube, de mayor a menor. */
export function ytThumbnails(videoId) {
  if (!videoId) return null;
  return YT_THUMB_SIZES.map(({ res, width, height }) => ({
    url: ytThumbUrl(videoId, res),
    width,
    height,
  }));
}

/** Las 5 resoluciones de googleusercontent, de menor a mayor. */
export function googleThumbnails(url) {
  const base = googleThumbBase(url);
  if (!base) return null;
  return GOOGLE_THUMB_SIZES.map(({ suffix, width, height }) => ({
    url: `${base}${suffix}`,
    width,
    height,
  }));
}

/**
 * Genera un array `thumbnails[]` HD desde una URL y/o un videoId.
 * Prioridad: googleusercontent → URL de YouTube → videoId suelto.
 * @returns {Array<{url:string,width:number,height:number}>|null}
 */
export function generateThumbsHD(srcUrl, videoId) {
  if (isGoogleThumbUrl(srcUrl)) {
    const thumbs = googleThumbnails(srcUrl);
    if (thumbs) return thumbs;
  }

  const vid = youtubeVideoIdFromUrl(srcUrl) || videoId;
  if (vid) return ytThumbnails(vid);

  return null;
}

/**
 * Normaliza una canción para que tenga `thumbnails[]` HD.
 *
 * - Si ya trae un array con ≥2 entradas se respeta tal cual.
 * - Si no, se generan desde `thumbnail`, el primer thumbnail o el videoId.
 * - `thumbnail` se apunta al ÚLTIMO elemento del array canónico, que es la
 *   "calidad máxima garantizada" de cada proveedor (ver comentario abajo).
 *
 * @template {{videoId?:string, thumbnail?:string, thumbnails?:Array}} T
 * @param {T} song
 * @returns {T}
 */
export function withHDThumbnails(song) {
  if (!song || !song.videoId) return song;

  if (Array.isArray(song.thumbnails) && song.thumbnails.length >= 2) return song;

  const srcUrl = song.thumbnail || song.thumbnails?.[0]?.url;
  const thumbs = generateThumbsHD(srcUrl, song.videoId);
  if (!thumbs) return song;

  // `thumbnail` se usa como src directo (imgs sin fallback) y para extraer
  // colores en el canvas, así que apuntamos a la calidad MÁXIMA GARANTIZADA:
  //   • Google (array asc) → w2048, porque Google genera cualquier tamaño.
  //   • YouTube (array desc) → mqdefault, la única que existe SIEMPRE
  //     (maxresdefault 404ea en muchos videos).
  // En ambos casos es el ÚLTIMO elemento del array canónico.
  return {
    ...song,
    thumbnails: thumbs,
    thumbnail: thumbs[thumbs.length - 1].url,
  };
}

// ── Consumo en UI (MusicCover) ───────────────────────────────────────────────

/**
 * Calcula las fuentes de una portada para pintar <img srcSet> con blur
 * placeholder.
 *
 * Devuelve siempre tres claves:
 *   • allSrcs   → cadena de fallback, de MAYOR a menor (allSrcs[0] = principal)
 *   • srcSetStr → srcset responsive, de MENOR a mayor
 *   • blurSrc   → la imagen MÁS PEQUEÑA disponible (placeholder borroso)
 *
 * @param {{ thumbnails?: Array, src?: string }} params
 * @returns {{ allSrcs: string[], srcSetStr: string, blurSrc: string }}
 */
export function getCoverSources({ thumbnails, src } = {}) {
  const EMPTY = { allSrcs: [], srcSetStr: "", blurSrc: "" };

  const thumbs =
    Array.isArray(thumbnails) && thumbnails.length
      ? [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))
      : [];

  if (thumbs.length) {
    return {
      allSrcs: thumbs.map((t) => t.url),
      srcSetStr: [...thumbs]
        .reverse()
        .map((t) => `${t.url} ${t.width || 0}w`)
        .join(", "),
      blurSrc: thumbs[thumbs.length - 1].url,
    };
  }

  if (!src) return EMPTY;

  const generated = generateThumbsHD(src, null);
  if (!generated) return { allSrcs: [src], srcSetStr: "", blurSrc: src };

  const desc = [...generated].sort((a, b) => b.width - a.width);
  const asc = [...generated].sort((a, b) => a.width - b.width);

  return {
    allSrcs: desc.map((t) => t.url),
    srcSetStr: asc.map((t) => `${t.url} ${t.width}w`).join(", "),
    blurSrc: desc[desc.length - 1].url,
  };
}
