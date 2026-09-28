import { useEffect } from "react";

// Contador global: pueden estar montados varios overlays a la vez (p. ej. el
// modal de letras sobre el panel de Ajustes). La clase solo se quita cuando
// el último se cierra, así ningún overlay "roto" apaga la pausa de otro.
let openOverlays = 0;

/**
 * useOverlayLayer — añade `<html class="overlay-open">` mientras hay un
 * overlay a pantalla completa (modal, sheet, panel) montado.
 *
 * ¿Para qué? Para pausar las animaciones INFINITAS que quedan DETRÁS del
 * overlay (ver index.html): shimmer de `.skeleton`, `.connection-dot` y el
 * pulse del "sonando ahora". Están tapadas por el scrim, así que nadie las
 * ve, pero cada frame suyo invalida el backdrop de las capas
 * `backdrop-filter` de las hojas → re-difuminado en cada frame de la iGPU.
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

    return () => {
      openOverlays -= 1;
      if (openOverlays <= 0) {
        openOverlays = 0;
        document.documentElement.classList.remove("overlay-open");
      }
    };
  }, [active]);
}
