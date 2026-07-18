import { useSyncExternalStore } from "react";
import { getHealthState, subscribeHealth } from "../utils/backendHealth";

/**
 * Estado de conexión con el backend.
 * Re-renderiza solo cuando el estado cambia de verdad (online/checking/error).
 *
 * @returns {{ online: boolean, checking: boolean, lastCheckAt: number, error: string|null, reconnects: number }}
 */
export function useBackendStatus() {
  return useSyncExternalStore(subscribeHealth, getHealthState, getHealthState);
}
