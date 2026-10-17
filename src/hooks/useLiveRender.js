import { useEffect, useSyncExternalStore } from "react";

// Contador global de consumidores «en vivo»: puede haber varios a la vez (el
// vídeo de fondo y la carga de una lista, por ejemplo) y el reposo solo se
// activa cuando no queda ninguno. Mismo patrón de ref-count que
// useOverlayLayer (varios overlays apilados no se apagan entre ellos).
let liveConsumers = 0;

const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLiveRender() {
  return liveConsumers > 0;
}

/**
 * useLiveRender — «ahora mismo SÍ hay algo que se está moviendo en pantalla».
 *
 * El reposo (`app-idle`, ver PerformanceContext) para el dibujado cuando el
 * usuario lleva un rato sin tocar nada; eso es exactamente lo que se quiere
 * en una pantalla quieta, pero no cuando lo que se ve es contenido en vivo
 * (un videoclip de fondo, el karaoke avanzando, una lista cargando). Este
 * hook lo declara: mientras `active` sea true no se entra en reposo.
 *
 * No confundir con `visible`/`sleeping` (ventana oculta) ni con
 * `overlay-open` (modal encima): son condiciones distintas y se suman.
 */
export function useLiveRender(active) {
  useEffect(() => {
    if (!active) return undefined;
    liveConsumers += 1;
    notify();
    return () => {
      liveConsumers -= 1;
      if (liveConsumers < 0) liveConsumers = 0;
      notify();
    };
  }, [active]);
}

/** ¿Hay algún consumidor en vivo? (lo consulta PerformanceContext). */
export function useLiveRenderActive() {
  return useSyncExternalStore(subscribe, isLiveRender, () => false);
}
