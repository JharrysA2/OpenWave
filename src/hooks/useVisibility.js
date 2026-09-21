import { useCallback, useEffect, useState } from "react";

/**
 * useVisibility - detecta si la ventana sigue siendo percibida por el usuario
 * (no minimizada, no cubierta, no en segundo plano, no en otra pestana).
 *
 * La MUSICA SIGUE SONANDO en todos los casos: esto solo pausa los EFECTOS
 * VISUALES pesados (blur, animaciones, sombras, aurora) y los reanuda
 * exactamente donde quedaron al volver a ser visible.
 *
 * visible = (document.visibilityState !== "hidden") && document.hasFocus()
 */
export function useVisibility() {
  const compute = useCallback(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden" && document.hasFocus();
  }, []);

  const [visible, setVisible] = useState(compute);

  useEffect(() => {
    const sync = () => setVisible(compute());

    const raf = requestAnimationFrame(sync);

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, [compute]);

  return visible;
}
