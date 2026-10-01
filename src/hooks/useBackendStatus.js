import { useSyncExternalStore } from "react";
import { getHealthState, subscribeHealth } from "../utils/backendHealth";

/**
 * Estado de conexión con el backend.
 * Re-renderiza solo cuando el estado cambia de verdad (online/checking/booting).
 *
 * @returns {{
 *   online: boolean,
 *   checking: boolean,
 *   booting: boolean,
 *   lastCheckAt: number,
 *   error: string|null,
 *   code: string|null,
 *   reconnects: number,
 * }}
 * `booting` es true hasta que termina el primer health-check (arranque);
 * `code` es el código reportable del último error (utils/errorCodes).
 */
export function useBackendStatus() {
  return useSyncExternalStore(subscribeHealth, getHealthState, getHealthState);
}
