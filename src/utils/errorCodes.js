/**
 * OpenWave — Catálogo de códigos de error
 *
 * Todo error que ve el usuario debe llevar un CÓDIGO estable para que pueda
 * reportarlo sin tener que copiar mensajes ("me sale un error raro"). El
 * código lo generan las capas de datos (`api.js`, `backendHealth.js`) y lo
 * muestran `StatusState` (y el toast de `api.js`).
 *
 * Formato: `E-` + familia (`CNX` conexión, `YTM` servicio de música,
 * `INT` interno, `UI` interfaz) + `-NN`.
 *
 * Uso:
 *   import { describeError, codeForHttp, codeFromReason } from "./errorCodes";
 *   describeError("E-CNX-01", "es") // { code, title, message }
 *
 * Los textos viven aquí (es + en) porque también los necesita código no-React
 * (api.js/backendHealth.js) y no debe importar `i18n/translations.js`.
 * Los textos de INTERFAZ genéricos ("Reintentar", "Iniciando OpenWave…")
 * sí viven en `i18n/translations.js`.
 */

/** Código usado cuando un error no trae uno propio (fallo inesperado de UI). */
export const DEFAULT_ERROR_CODE = "E-UI-00";

export const ERROR_CODES = {
  "E-CNX-01": {
    es: {
      title: "Sin conexión con el servidor",
      message: "No se pudo conectar con el backend (127.0.0.1:8765). Comprueba que esté en marcha.",
    },
    en: {
      title: "No connection to the server",
      message: "Could not reach the backend (127.0.0.1:8765). Make sure it is running.",
    },
  },
  "E-CNX-02": {
    es: {
      title: "El servidor tardó en responder",
      message: "La petición superó el tiempo de espera. El backend puede estar saturado.",
    },
    en: {
      title: "The server took too long to respond",
      message: "The request timed out. The backend may be overloaded.",
    },
  },
  "E-CNX-03": {
    es: {
      title: "Respuesta no válida del servidor",
      message: "El servidor devolvió un código HTTP distinto de 200. Vuelve a intentarlo.",
    },
    en: {
      title: "Invalid server response",
      message: "The server returned a non-200 HTTP status. Please try again.",
    },
  },
  "E-YTM-01": {
    es: {
      title: "Servicio de música no disponible",
      message:
        "El proveedor de música (YouTube Music) no responde. Inténtalo de nuevo en unos minutos.",
    },
    en: {
      title: "Music service unavailable",
      message: "The music provider (YouTube Music) is not responding. Try again in a few minutes.",
    },
  },
  "E-INT-00": {
    es: {
      title: "Error interno del servidor",
      message:
        "El backend falló al procesar la petición. Reintenta; si persiste, reporta este código.",
    },
    en: {
      title: "Internal server error",
      message:
        "The backend failed to process the request. Retry; if it persists, report this code.",
    },
  },
  "E-UI-00": {
    es: {
      title: "Error inesperado",
      message: "Algo falló en la interfaz. Reintenta; si persiste, reporta este código.",
    },
    en: {
      title: "Unexpected error",
      message: "Something failed in the interface. Retry; if it persists, report this code.",
    },
  },
};

/**
 * Texto de un código (con fallback al código por defecto).
 *
 * @param {string|null|undefined} code
 * @param {"es"|"en"} [lang]
 * @returns {{ code: string, title: string, message: string }}
 */
export function describeError(code, lang = "es") {
  const entry = ERROR_CODES[code];
  if (entry) {
    const text = entry[lang] || entry.es;
    return { code, title: text.title, message: text.message };
  }
  const fallback = ERROR_CODES[DEFAULT_ERROR_CODE];
  const text = fallback[lang] || fallback.es;
  return { code: code || DEFAULT_ERROR_CODE, title: text.title, message: text.message };
}

/**
 * Código para una respuesta HTTP no-2xx.
 *
 * El backend responde 503 con "YTMusic no disponible" cuando el proveedor de
 * música cae (backend/ytmusic_client.py), así que se detecta por el cuerpo.
 *
 * @param {number} status
 * @param {string} [body] - cuerpo de la respuesta (si se leyó)
 * @returns {string}
 */
export function codeForHttp(status, body = "") {
  if (/ytmusic/i.test(body)) return "E-YTM-01";
  if (status >= 500) return "E-INT-00";
  return "E-CNX-03";
}

/**
 * Deriva un código a partir de un motivo legible ("Timeout", "HTTP 503"…).
 * Sirve para llamadas antiguas que solo pasan el texto del error.
 *
 * @param {string} [reason]
 * @returns {string}
 */
export function codeFromReason(reason = "") {
  const text = String(reason || "");
  if (/timeout/i.test(text)) return "E-CNX-02";
  const http = /^\s*HTTP\s+(\d{3})/i.exec(text);
  // El motivo completo puede mencionar YTMusic ("HTTP 503 YTMusic caído"),
  // así que se pasa como cuerpo para que codeForHttp lo tenga en cuenta.
  if (http) return codeForHttp(Number(http[1]), text);
  return "E-CNX-01";
}

/**
 * Sufijo para toasts/errores: `Error de conexión con el servidor (E-CNX-01)`.
 *
 * @param {string|null|undefined} code
 * @returns {string} "" si no hay código
 */
export function formatErrorCode(code) {
  return code ? `(${code})` : "";
}
