import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useIdle — «el usuario no toca nada desde hace `delay` ms».
 *
 * Emula lo que hace un navegador con una página quieta: mientras no llega
 * ENTRADA (ratón, teclado, rueda, tacto, foco) no hay nada nuevo que pintar,
 * así que el motor puede dejar de producir fotogramas. Este hook mide SOLO
 * esa inactividad; el reposo de verdad lo decide PerformanceContext (ventana
 * visible + sin contenido en vivo) y expone `wake` para que cualquier
 * cambio de contenido —canción nueva, carga en curso— también lo levante.
 *
 * Coste: **ni un timer en reposo**. Al quedar inactivo el último `setTimeout`
 * se consume y no se reprograma; solo un evento de entrada vuelve a armar el
 * próximo vencimiento. Mientras el usuario se mueve hay UN timer pendiente
 * (no se re-arma con cada `pointermove`: el vencimiento comprueba el
 * instante de la última entrada y, si no ha pasado el margen, se re-arma).
 */
export function useIdle(delay) {
  const [idle, setIdle] = useState(false);
  /** Instante de la última entrada del usuario (reloj de pared). */
  const lastRef = useRef(Date.now());
  const timerRef = useRef(null);
  const idleRef = useRef(false);

  // Arma el próximo vencimiento si no hay ninguno pendiente.
  const arm = useCallback(
    (ms) => {
      if (timerRef.current !== null) return;
      timerRef.current = setTimeout(
        () => {
          timerRef.current = null;
          // Exacto: lo que falte desde la ÚLTIMA entrada (si el usuario tocó
          // algo con el timer ya armado, se reprograma por el resto y el
          // reposo llega `delay` ms después de esa entrada, ni antes ni el
          // doble). Con lo que falte <= 0 → reposo y ningún timer pendiente.
          const restante = delay - (Date.now() - lastRef.current);
          if (restante <= 0) {
            idleRef.current = true;
            setIdle(true);
          } else {
            arm(restante);
          }
        },
        ms === undefined ? delay : ms,
      );
    },
    [delay],
  );

  /** Marca actividad: despierta al instante y rearma el vencimiento. */
  const wake = useCallback(() => {
    lastRef.current = Date.now();
    if (idleRef.current) {
      idleRef.current = false;
      setIdle(false);
    }
    arm();
  }, [arm]);

  useEffect(() => {
    lastRef.current = Date.now();
    const onActivity = () => wake();
    // `capture`: nada de la app puede tragarse la señal de que el usuario
    // está ahí (un stopPropagation en un handler no debe dejar la app
    // congelada). `passive`: cero coste en el hilo de scroll/gestos.
    const entradas = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "wheel",
      "keydown",
      "keyup",
      "touchstart",
      "touchmove",
      "focus",
    ];
    entradas.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true, capture: true }),
    );

    // Volver a la ventana (alt-tab, restaurar) es actividad.
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    arm();

    return () => {
      entradas.forEach((ev) =>
        window.removeEventListener(ev, onActivity, { passive: true, capture: true }),
      );
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [wake, arm]);

  return { idle, wake };
}
