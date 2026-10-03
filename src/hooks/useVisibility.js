import { useCallback, useEffect, useState } from "react";

/**
 * useVisibility - detecta si la ventana está realmente OCULTA
 * (minimizada o tapada del todo). NO depende del FOCO: con ventanas
 * divididas la app puede perder el foco pero seguir visible, y en ese
 * caso NADA se congela (blur, animaciones y karaoke siguen vivos).
 *
 * visible = (document.visibilityState !== "hidden")
 *
 * La MUSICA SIGUE SONANDO en todos los casos: si la ventana queda
 * oculta, los efectos visuales pesados se pausan (app-hidden) y a los
 * 15 s PerformanceContext entra en sueño profundo (app-sleep); al
 * volver todo se reanuda exactamente donde quedó.
 */
export function useVisibility() {
  const compute = useCallback(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  }, []);

  const [visible, setVisible] = useState(compute);

  useEffect(() => {
    const sync = () => setVisible(compute());

    const raf = requestAnimationFrame(sync);

    document.addEventListener("visibilitychange", sync);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [compute]);

  return visible;
}
