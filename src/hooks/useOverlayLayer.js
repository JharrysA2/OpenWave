import { useEffect, useSyncExternalStore } from "react";

// Contador global: pueden estar montados varios overlays a la vez (p. ej. el
// modal de letras sobre el panel de Ajustes). La clase solo se quita cuando
// el último se cierra, así ningún overlay "roto" apaga la pausa de otro.
let openOverlays = 0;

// Suscriptores de `useOverlayActive` (PlayerBar, reloj de karaoke…).
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Exportado como respaldo de useEscBack (hooks/useEscape.js): una capa que
// monte useOverlayLayer sin registrarse en la pila de ESC sigue bloqueando
// la navegación con la tecla Escape.
export function isOverlayActive() {
  return openOverlays > 0;
}

/**
 * useOverlayLayer — añade `<html class="overlay-open">` mientras hay un
 * overlay a pantalla completa (modal, sheet, panel) montado.
 *
 * ¿Para qué? Para dejar de pagar lo que está DETRÁS del overlay, que nadie
 * ve (scrim) pero que sigue repintando (ver index.html):
 *  - animaciones infinitas: shimmer de `.skeleton`, `.connection-dot` y el
 *    pulse de `.now-playing-pulse` → `animation-play-state: paused`;
 *  - los blurs de las superficies de la shell (sidebar, titlebar, searchbar,
 *    player bar) → `backdrop-filter: none` mientras dure el overlay;
 *  - repaints programados: `useOverlayActive()` congela el intervalo de
 *    progreso de PlayerBar y el reloj de karaoke de LyricsView.
 * Medido: abrir cualquier modal subía el uso de GPU del 33 % al 76 % mientras
 * estaba abierto; con el modo Rendimiento (blur/anim off) bajaba a 11 %.
 *
 * No sustituye a `app-hidden` (segundo plano) ni a `perf-anim-off` (modo
 * Rendimiento): es el caso "ventana visible y tapada por un modal".
 */
export function useOverlayLayer(active = true) {
  useEffect(() => {
    if (!active) return undefined;

    openOverlays += 1;
    document.documentElement.classList.add("overlay-open");
    notify();

    return () => {
      openOverlays -= 1;
      if (openOverlays <= 0) {
        openOverlays = 0;
        document.documentElement.classList.remove("overlay-open");
      }
      notify();
    };
  }, [active]);
}

/**
 * useOverlayActive — `true` mientras hay un overlay a pantalla completo
 * montado (mismo ref-count que la clase `html.overlay-open`).
 *
 * Para componentes que escriben al DOM a cadencia fija (progreso del player,
 * reloj de karaoke): con el overlay montado esas escrituras son invisibles
 * bajo el scrim, pero cada una repinta la región y re-ejecuta los
 * `backdrop-filter` de detrás. Al cerrar el overlay el primer frame
 * recalcula el estado real (progressRef / audio.currentTime), así que no hay
 * "cuela" de datos.
 */
export function useOverlayActive() {
  return useSyncExternalStore(subscribe, isOverlayActive, () => false);
}
