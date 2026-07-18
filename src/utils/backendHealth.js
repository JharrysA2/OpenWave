import { API } from "../constants";

/**
 * SoundWave — Estado de conexión con el backend
 *
 * Store agnóstico de React (patrón external store) que centraliza:
 *
 *   1. **Heartbeat**: poll a `GET /health` para saber si el backend vive.
 *      El intervalo se adapta: lento cuando todo va bien, agresivo mientras
 *      está caído (reconexión automática rápida).
 *   2. **Estado offline**: `api.js` marca offline en cuanto una petición
 *      falla por red (no por HTTP) y online en cuanto alguna responde. Así
 *      la UI reacciona sin esperar al siguiente heartbeat.
 *   3. **Reconexión**: al pasar de offline → online se notifica a los
 *      suscriptores (`subscribeReconnect`) para refrescar datos cacheados.
 *
 * Uso desde React:
 *   const { online, checking } = useBackendStatus();
 *
 * Uso fuera de React:
 *   const unsub = subscribeReconnect(() => api.clearCache());
 */

export const HEALTH_PATH = "/health";

/** Intervalo de chequeo cuando el backend responde (bajo consumo). */
export const ONLINE_INTERVAL_MS = 20_000;
/** Intervalo de reintento cuando está caído (reconexión rápida). */
export const OFFLINE_INTERVAL_MS = 3_000;
/** Timeout del propio health-check. */
export const HEALTH_TIMEOUT_MS = 4_000;

const INITIAL_STATE = {
  /** ¿El backend respondió la última vez que supimos de él? */
  online: true,
  /** ¿Hay un health-check en vuelo ahora mismo? */
  checking: false,
  /** Timestamp del último resultado positivo. */
  lastCheckAt: 0,
  /** Último error de conexión registrado (null si todo bien). */
  error: null,
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
 * @returns {boolean} true si hubo cambio de estado (estaba online).
 */
export function markOffline(reason = "Error de conexión") {
  if (!state.online) {
    // Ya estaba offline: solo actualizamos el motivo si cambió.
    if (state.error !== reason) patch({ error: reason });
    return false;
  }
  patch({ online: false, error: reason });
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
      markOffline(`HTTP ${resp.status}`);
      return false;
    }
    markOnline();
    return true;
  } catch (err) {
    markOffline(err?.name === "AbortError" ? "Timeout" : "Error de conexión");
    return false;
  } finally {
    clearTimeout(timer);
    patch({ checking: false });
  }
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

function nextInterval() {
  return state.online ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS;
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

/** Arranca el heartbeat (idempotente). */
export function startHeartbeat() {
  if (running) return;
  running = true;
  schedule();
}

/** Detiene el heartbeat y cancela el timer pendiente. */
export function stopHeartbeat() {
  running = false;
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
