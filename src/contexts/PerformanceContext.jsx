import React, { createContext, useContext, useMemo, useEffect } from "react";
import { useVisibility } from "../hooks/useVisibility";
import { useSettings } from "./useSettings";

const PerformanceContext = createContext(null);
export { PerformanceContext };

/**
 * PerformanceProvider — sin humo, solo 3 cosas:
 *
 *  1) ESCUCHA la visibilidad de la ventana (useVisibility). Cuando la ventana
 *     deja de "verse" (minimizada, tapada por otra ventana, en segundo plano,
 *     alt-tab, cubierta por otra app) añade la clase «app-hidden» a <html>.
 *     Esa clase pausa TODOS los efectos visuales (blur, anim, sombras,
 *     aurora) con CSS `!important`. La MÚSICA SIGUE SONANDO siempre; al volver
 *     a ser visible todo se reanuda exactamente donde se quedó (las
 *     animaciones quedan pausadas con animation-play-state, no reiniciadas).
 *
 *  2) Lee el MODO de rendimiento de los ajustes:
 *        perfMode = "balanced"  → todo activo (por defecto)
 *        perfMode = "performance" → todo desactivado (bajo consumo)
 *        perfMode = "custom"    → solo lo que el usuario marque en
 *                                 perfBlur / perfAnim / perfShadow / perfAurora
 *
 *  3) Expone vía contexto los toggles RESUELTOS (blurOn, animOn, shadowOn,
 *     auroraOn, visible) para que la página de rendimiento y los componentes
 *     sepan qué está activo SIN re-leer los ajustes ni re-calcular CSS.
 */
export function PerformanceProvider({ children }) {
  const { settings } = useSettings();
  const visible = useVisibility();

  const mode = settings.perfMode || "balanced";
  const customBlur = settings.perfBlur !== false;
  const customAnim = settings.perfAnim !== false;
  const customShadow = settings.perfShadow !== false;
  const customAurora = settings.perfAurora !== false;

  const flags = useMemo(() => {
    if (mode === "performance")
      return { blurOn: false, animOn: false, shadowOn: false, auroraOn: false };
    if (mode === "custom")
      return {
        blurOn: customBlur,
        animOn: customAnim,
        shadowOn: customShadow,
        auroraOn: customAurora,
      };
    // balanced: todo activo
    return { blurOn: true, animOn: true, shadowOn: true, auroraOn: true };
  }, [mode, customBlur, customAnim, customShadow, customAurora]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("perf-blur-off", !flags.blurOn);
    root.classList.toggle("perf-anim-off", !flags.animOn);
    root.classList.toggle("perf-shadow-off", !flags.shadowOn);
    root.classList.toggle("perf-aurora-off", !flags.auroraOn);
    root.classList.toggle("app-hidden", !visible);
    return () => {
      root.classList.remove(
        "perf-blur-off",
        "perf-anim-off",
        "perf-shadow-off",
        "perf-aurora-off",
        "app-hidden",
      );
    };
  }, [flags, visible]);

  const value = useMemo(
    () => ({ ...flags, visible }),
    [flags, visible],
  );

  return (
    <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>
  );
}

export function usePerformance() {
  return useContext(PerformanceContext);
}
