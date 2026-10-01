import { API } from "../constants";
import { codeForHttp, codeFromReason } from "./errorCodes";

/**
 * OpenWave — Estado de conexión con el backend
 *
 * Store agnóstico de React (patrón external store) que centraliza:
 *
 *   1. **Heartbeat**: poll a `GET /health` para saber si el backend vive.
 *      El intervalo se adapta: lento cuando todo va bien, agresivo mientras
 *      está caído (reconexión automática rápida) y **muy lento cuando la
 *      ventana está oculta (minimizada)** para que el consumo en segundo
 *      plano sea ~0; al volver a ser visible se chequea al instante.
 *   2. **Estado offline**: `api.js` marca offline en cuanto una petición
 *      falla por red (no por HTTP) y online en cuanto alguna responde. Así
 *      la UI reacciona sin esperar al siguiente heartbeat.
 *   3. **Reconexión**: al pasar de offline → online se notifica a los
 *      suscriptores (`subscribeReconnect`) para refrescar datos cacheados.
 *
 * Uso desde React:
 *   const { online, checking, booting, code } = useBackendStatus();
 *
 * Uso fuera de React:
 *   const unsub = subscribeReconnect(() => api.clearCache());
 */

export const HEALTH_PATH = "/health";

/** Intervalo de chequeo cuando el backend responde (bajo consumo). */
export const ONLINE_INTERVAL_MS = 20_000;
/** Intervalo de reintento cuando está caído (reconexión rápida). */
export const OFFLINE_INTERVAL_MS = 3_000;
/**
 * Mismos intervalos con la ventana OCULTA (minimizada/cubierta): aquí el
 * objetivo es consumo ~0 en segundo plano, así que el latido baja al mínimo
 * viable y el navegador además aplica su propio intensive throttling.
 */
export const HIDDEN_ONLINE_INTERVAL_MS = 60_000;
export const HIDDEN_OFFLINE_INTERVAL_MS = 10_000;
/** Timeout del propio health-check. */
export const HEALTH_TIMEOUT_MS = 4_000;
/**
 * Timeout del PRIMER chequeo (arranque): corto a propósito para que la
 * pantalla de inicio se resuelva rápido con el backend caído (en vez de
 * esperar los 4s del chequeo normal o los 20s del primer latido).
 */
export const BOOT_TIMEOUT_MS = 3_000;

const INITIAL_STATE = {
  /** ¿El backend respondió la última vez que supimos de él? */
  online: true,
  /** ¿Hay un health-check en vuelo ahora mismo? */
  checking: false,
  /**
   * ¿Estamos aún en el arranque (hasta que termine el primer chequeo)?
   * La UI lo usa para la pantalla de inicio: sin él, el estado decía
   * "online" (optimista) hasta el primer latido a +20 s.
   */
  booting: true,
  /** Timestamp del último resultado positivo. */
  lastCheckAt: 0,
  /** Último error de conexión registrado (null si todo bien). */
  error: null,
  /** Código reportable del último error (catálogo utils/errorCodes). */
  code: null,
  /** Cuántas veces se recuperó la conexión en esta sesión. */
  reconnects: 0,
};

let state = { ...INITIAL_STATE };
const statusListeners = new Set();
const reconnectListeners = new Set();

let running = false;
let heartbeatTimer = null;
let heartbeatDelay = null;

// ── Suscripción ──────────────────────────────────────────────────────────────

function emit() {
  for (const listener of statusListeners) listener(state);
}

function patch(next, { silent = false } = {}) {
  state = { ...state, ...next };
  if (!silent) emit();
}

export function getHealthState() {
  return state;
}

/** Suscribe una función al estado de conexión. Devuelve el unsubscriber. */
export function subscribeHealth(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** Suscribe una función que se dispara SOLO cuando se recupera la conexión. */
export function subscribeReconnect(listener) {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

// ── Transiciones ─────────────────────────────────────────────────────────────

/**
 * Marca el backend como caído. Lo llaman tanto `api.js` (error de red) como
 * el heartbeat.
 * @param {string} reason
 * @param {string} [code] - código reportable (utils/errorCodes). Si no llega,
 *   se deriva del motivo ("Timeout" → E-CNX-02, "HTTP 503" → E-INT-00…).
 * @returns {boolean} true si hubo cambio de estado (estaba online).
 */
export function markOffline(reason = "Error de conexión", code) {
  const nextCode = code || codeFromReason(reason);
  if (!state.online) {
    // Ya estaba offline: solo actualizamos el motivo si cambió.
    if (state.error !== reason || state.code !== nextCode) {
      patch({ error: reason, code: nextCode });
    }
    return false;
  }
  patch({ online: false, error: reason, code: nextCode });
  // Al caerse el backend queremos reintentar YA (no esperar los 20s del
  // siguiente latido): se reprograma el timer pendiente al intervalo corto.
  rescheduleIfNeeded();
  return true;
}

/**
 * Marca el backend como operativo. Si veníamos de offline, cuenta la
 * reconexión y avisa a los suscriptores.
 * @returns {boolean} true si hubo reconexión (estaba offline).
 */
export function markOnline() {
  const recovered = !state.online;

  if (!recovered && !state.error) {
    // Nada visible cambió: actualizamos el timestamp sin re-renderizar.
    patch({ lastCheckAt: Date.now() }, { silent: true });
    return false;
  }

  patch({
    online: true,
    error: null,
    code: null,
    lastCheckAt: Date.now(),
    reconnects: recovered ? state.reconnects + 1 : state.reconnects,
  });

  if (recovered) {
    rescheduleIfNeeded();
    for (const listener of reconnectListeners) listener(state);
  }

  return recovered;
}

// ── Health-check ─────────────────────────────────────────────────────────────

/**
 * Consulta `GET /health`. Actualiza el estado y devuelve si el backend vive.
 * Nunca lanza: los errores se traducen a estado offline.
 *
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<boolean>}
 */
export async function checkHealth({ timeout = HEALTH_TIMEOUT_MS } = {}) {
  if (state.checking) return state.online;

  patch({ checking: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(`${API}${HEALTH_PATH}`, { signal: controller.signal });
    if (!resp.ok) {
      markOffline(`HTTP ${resp.status}`, codeForHttp(resp.status));
      return false;
    }
    markOnline();
    return true;
  } catch (err) {
    if (err?.name === "AbortError") markOffline("Timeout", "E-CNX-02");
    else markOffline("Error de conexión", "E-CNX-01");
    return false;
  } finally {
    clearTimeout(timer);
    // Primer chequeo terminado → fin del arranque (la UI puede salir de la
    // pantalla de inicio con el resultado real: online o error + código).
    patch({ checking: false, booting: false });
  }
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

/** ¿La ventana está oculta (minimizada, cubierta o en otra pestaña)? */
function isPageHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function nextInterval() {
  const hidden = isPageHidden();
  if (state.online) return hidden ? HIDDEN_ONLINE_INTERVAL_MS : ONLINE_INTERVAL_MS;
  return hidden ? HIDDEN_OFFLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS;
}

function schedule() {
  if (!running) return;
  heartbeatDelay = nextInterval();
  heartbeatTimer = setTimeout(async () => {
    heartbeatTimer = null;
    heartbeatDelay = null;
    await checkHealth();
    schedule();
  }, heartbeatDelay);
}

/**
 * Ajusta el timer pendiente si el intervalo que toca ya no es el programado.
 * No hace nada si el latido está en vuelo (heartbeatTimer === null), porque
 * en ese caso el propio tick reprogramará con el intervalo correcto.
 */
function rescheduleIfNeeded() {
  if (!running || heartbeatTimer === null) return;
  if (heartbeatDelay === nextInterval()) return;
  clearTimeout(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatDelay = null;
  schedule();
}

/**
 * Al ocultarse la ventana se reprograma el latido pendiente al intervalo
 * largo (consumo ~0 en segundo plano); al volver a ser visible se vuelve a
 * los intervalos normales y se lanza un chequeo inmediato, para que el usuario
 * vea el estado real sin esperar al siguiente latido.
 */
function handleVisibilityChange() {
  if (!running) return;
  rescheduleIfNeeded();
  if (!isPageHidden()) void checkHealth();
}

/**
 * Arranca el heartbeat (idempotente).
 *
 * El primer chequeo es INMEDIATO (timeout corto): sin él el estado arrancaba
 * "online" (optimista) y no se sabía de verdad si el backend vivía hasta el
 * primer latido a +20 s, con lo que la UI quedaba en skeleton eterno.
 */
export function startHeartbeat() {
  if (running) return;
  running = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  void checkHealth({ timeout: BOOT_TIMEOUT_MS });
  schedule();
}

/** Detiene el heartbeat y cancela el timer pendiente. */
export function stopHeartbeat() {
  running = false;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatDelay = null;
}

/** ¿Está el heartbeat activo? */
export function isHeartbeatRunning() {
  return running;
}

/** Milisegundos hasta el próximo chequeo según el estado actual. */
export function getHeartbeatInterval() {
  return nextInterval();
}

/** Reinicia todo el store. Solo para tests. */
export function __resetHealth() {
  stopHeartbeat();
  state = { ...INITIAL_STATE };
  statusListeners.clear();
  reconnectListeners.clear();
}
