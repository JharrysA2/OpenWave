import React, { createContext, useContext, useMemo, useEffect } from "react";
import { useVisibility } from "../hooks/useVisibility";
import { useSettings } from "./useSettings";
import { isSoftwareRenderer } from "../utils/softwareRenderer";

// Default «balanced» (todo activo): si un componente se usa fuera del provider
// (tests unitarios, aislado) recibe un objeto válido en vez de null, para no
// reventar al desestructurar ({ visible, ... }).
const PerformanceContext = createContext({
  blurOn: true,
  animOn: true,
  shadowOn: true,
  solidOn: false,
  visible: true,
});

/**
 * PerformanceProvider — sin humo, solo 3 cosas:
 *
 *  1) ESCUCHA la visibilidad de la ventana (useVisibility). Cuando la ventana
 *     deja de "verse" (minimizada, tapada por otra ventana, en segundo plano,
 *     alt-tab, cubierta por otra app) añade la clase «app-hidden» a <html>.
 *     Esa clase pausa TODOS los efectos visuales (blur, anim, sombras)
 *     con CSS `!important`. La MÚSICA SIGUE SONANDO siempre; al volver
 *     a ser visible todo se reanuda exactamente donde se quedó (las
 *     animaciones quedan pausadas con animation-play-state, no reiniciadas).
 *
 *  2) Lee el MODO de rendimiento de los ajustes:
 *        perfMode = "auto"        → detecta la GPU (utils/softwareRenderer):
 *                                    sin GPU usable → bajo consumo,
 *                                    con GPU → equilibrado. (por defecto)
 *        perfMode = "balanced"    → todo activo
 *        perfMode = "performance" → todo desactivado (bajo consumo)
 *        perfMode = "custom"      → solo lo que el usuario marque en
 *                                   perfBlur / perfAnim / perfShadow
 *
 *  3) Expone vía contexto los toggles RESUELTOS (blurOn, animOn, shadowOn,
 *     visible) para que la página de rendimiento y los componentes
 *     sepan qué está activo SIN re-leer los ajustes ni re-calcular CSS.
 */
export function PerformanceProvider({ children }) {
  const { settings } = useSettings();
  const visible = useVisibility();

  const mode = settings.perfMode || "auto";
  const customBlur = settings.perfBlur !== false;
  const customAnim = settings.perfAnim !== false;
  const customShadow = settings.perfShadow !== false;
  const customSolid = settings.perfSolid !== false;

  const flags = useMemo(() => {
    if (mode === "auto") {
      return isSoftwareRenderer()
        ? { blurOn: false, animOn: false, shadowOn: false, solidOn: true }
        : { blurOn: true, animOn: true, shadowOn: true, solidOn: false };
    }
    if (mode === "performance")
      return { blurOn: false, animOn: false, shadowOn: false, solidOn: true };
    if (mode === "custom")
      return {
        blurOn: customBlur,
        animOn: customAnim,
        shadowOn: customShadow,
        solidOn: customSolid,
      };
    // balanced: todo activo
    return { blurOn: true, animOn: true, shadowOn: true, solidOn: false };
  }, [mode, customBlur, customAnim, customShadow, customSolid]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("perf-blur-off", !flags.blurOn);
    root.classList.toggle("perf-anim-off", !flags.animOn);
    root.classList.toggle("perf-shadow-off", !flags.shadowOn);
    root.classList.toggle("perf-solid", !!flags.solidOn);
    root.classList.toggle("app-hidden", !visible);
    return () => {
      root.classList.remove(
        "perf-blur-off",
        "perf-anim-off",
        "perf-shadow-off",
        "perf-solid",
        "app-hidden",
      );
    };
  }, [flags, visible]);

  const value = useMemo(() => ({ ...flags, visible }), [flags, visible]);

  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance() {
  return useContext(PerformanceContext);
}
