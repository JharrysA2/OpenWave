/**
 * OpenWave — Vídeo de fondo de la pantalla de letras.
 *
 * Funciones puras que traducen lo que dice el backend (estado de
 * `/video/status`, frames del SSE de `/video/progress`) al estado de la
 * pantalla, más el plan de sincronía con el `<audio>` de la app.
 */

/** Estados de la preparación del vídeo. */
export const VIDEO_PREP = {
  CHECKING: "checking", // consultando si ya está preparado
  IDLE: "idle", // hay que prepararlo
  PREPARING: "preparing", // descargando/muxando (con progreso)
  READY: "ready", // vídeo listo para pintarse de fondo
  NO_VIDEO: "no_video", // la canción no tiene videoclip: queda la portada
  ERROR: "error", // falló la preparación (se queda la portada)
};

/** Estado inicial de la preparación. */
export const VIDEO_PREP_INITIAL = {
  status: VIDEO_PREP.CHECKING,
  progress: 0,
  error: null,
  // Desfase (s) del videoclip con la canción (lleva intro): 0 = a la par.
  desfase: 0,
};

/**
 * Desfase informado por el backend, o 0 si no lo hay.
 *
 * @param {*} valor
 * @returns {number}
 */
export function normalizarDesfase(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Respuesta de `/video/status` → estado de la pantalla.
 *
 * `sin_videoclip` lo resuelve el backend: la canción no tiene videoclip
 * oficial, así que se queda la portada y no se descarga nada. Si está
 * preparado, `desfase` es lo que el vídeo debe llevar por delante del audio.
 *
 * @param {{prepared?:boolean, sin_videoclip?:boolean, desfase?:number}|null} data
 */
export function normalizeStatus(data) {
  if (data?.prepared) {
    return {
      ...VIDEO_PREP_INITIAL,
      status: VIDEO_PREP.READY,
      progress: 100,
      desfase: normalizarDesfase(data.desfase),
    };
  }
  if (data?.sin_videoclip) {
    return { ...VIDEO_PREP_INITIAL, status: VIDEO_PREP.NO_VIDEO };
  }
  return { ...VIDEO_PREP_INITIAL, status: VIDEO_PREP.IDLE };
}

/**
 * Frame del SSE de `/video/progress` → estado de la pantalla.
 *
 * El frame final `done` arrastra el `desfase` medido con la canción.
 *
 * @param {{status?:string, progress?:number, error?:string, desfase?:number}|null} data
 */
export function normalizePrepareFrame(data) {
  if (!data || typeof data !== "object") {
    return { ...VIDEO_PREP_INITIAL, status: VIDEO_PREP.PREPARING };
  }
  const raw = Number(data.progress);
  const progress = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  if (data.status === "done") {
    return {
      status: VIDEO_PREP.READY,
      progress: 100,
      error: null,
      desfase: normalizarDesfase(data.desfase),
    };
  }
  if (data.status === "sin_video") {
    return { ...VIDEO_PREP_INITIAL, status: VIDEO_PREP.NO_VIDEO, progress: 100 };
  }
  if (data.status === "error") {
    return {
      status: VIDEO_PREP.ERROR,
      progress,
      error: data.error || "unknown",
      desfase: 0,
    };
  }
  return { status: VIDEO_PREP.PREPARING, progress, error: null, desfase: 0 };
}

/** URL del vídeo preparado a partir de la base de la API. */
export function videoFileUrl(base, videoId) {
  return `${String(base).replace(/\/+$/, "")}/video/file/${videoId}`;
}

/** ¿En este estado hay que pintar el vídeo de fondo? */
export function isVideoReady(state) {
  return state?.status === VIDEO_PREP.READY;
}

/** Tolerancia de deriva (s) entre el reloj del audio y la posición del vídeo. */
export const VIDEO_DRIFT_TOLERANCE = 0.4;

/**
 * Plan de sincronía del vídeo de fondo con el `<audio>` de la app.
 *
 * El `<audio>` es el transporte (play/pausa, seek, cola) y el reloj de
 * referencia; el vídeo solo lo sigue, en mudo: el sonido es siempre el de la
 * app, así que nunca se oyen dos pistas a la vez. Si el vídeo se ha quedado
 * atrás más de la tolerancia, se corrige su posición.
 *
 * El vídeo va `desfase` segundos por delante del audio: los videoclips con
 * intro empiezan antes que la canción (así lo midió el backend al
 * prepararlos). Con desfase negativo el vídeo aún no ha empezado y espera en
 * su primer fotograma hasta que el audio lo alcance.
 *
 * @param {{audioTime?:number, videoTime?:number, audioPaused?:boolean,
 *          videoEnded?:boolean, desfase?:number, tolerance?:number}} frame
 * @returns {{play:boolean, seekTo:number|null}}
 */
export function planVideoSync({
  audioTime,
  videoTime,
  audioPaused,
  videoEnded = false,
  desfase = 0,
  tolerance = VIDEO_DRIFT_TOLERANCE,
} = {}) {
  if (audioPaused !== false) {
    return { play: false, seekTo: null };
  }
  const audio = Number(audioTime);
  const video = Number(videoTime);
  const objetivo = Number.isFinite(audio) ? audio + desfase : NaN;
  if (Number.isFinite(objetivo) && objetivo < 0) {
    // El clip arranca dentro de la canción: aún no hay vídeo que mostrar.
    return { play: false, seekTo: 0 };
  }
  const drift =
    Number.isFinite(objetivo) && Number.isFinite(video) ? Math.abs(video - objetivo) : 0;
  // Un vídeo terminado (el videoclip es más corto que la canción) se queda en
  // su último fotograma: corregir ahí daría un bucle de seeks imposibles.
  const seekTo = !videoEnded && drift > tolerance ? objetivo : null;
  return { play: true, seekTo };
}
