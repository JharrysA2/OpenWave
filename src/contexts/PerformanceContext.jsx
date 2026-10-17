import React, { createContext, useContext, useMemo, useEffect, useState } from "react";
import { useVisibility } from "../hooks/useVisibility";
import { useIdle } from "../hooks/useIdle";
import { useLiveRenderActive } from "../hooks/useLiveRender";
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
  sleeping: false,
  idle: false,
  wake: () => {},
});

/** Sueño profundo: ms que la ventana debe llevar OCULTA antes de apagar
 *  todo (animaciones off + liberación de recursos). Spec: con solo perder
 *  el foco (ventanas divididas) NO se congela nada; el congelado inmediato
 *  es al minimizar/ocultar, y a los 15 s se entra en app-sleep. */
export const APP_SLEEP_MS = 15000;

/** Reposo: ms sin NINGUNA entrada del usuario antes de dejar de dibujar con
 *  la ventana a la vista (app-idle). Ver docs/PERFORMANCE.md §4. */
export const APP_IDLE_MS = 10000;

/**
 * PerformanceProvider — sin humo, solo 4 cosas:
 *
 *  1) ESCUCHA la visibilidad de la ventana (useVisibility: visibilitychange,
 *     SIN foco). Si la ventana queda OCULTA (minimizada/tapada) añade la
 *     clase «app-hidden» a <html> → congela todo menos la música (blur,
 *     animaciones, sombras apagados con CSS `!important`, rAF de karaoke y
 *     progreso parados por `visible`). Si solo pierde el foco pero sigue
 *     visible (ventanas divididas), NO pasa nada: la app funciona normal.
 *     Si la ventana sigue oculta APP_SLEEP_MS (15 s) → «app-sleep»: las
 *     animaciones se APAGAN (no pausan) y los componentes liberan recursos
 *     pesados (fondo de Letras). Al volver, todo se reanuda al instante.
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
 *     Además aplica el ESTILO DE FONDO de Apariencia (blurStyle):
 *     "solid" fuerza el modo sólido y "none" apaga todo filtro; "blur"
 *     no toca nada. Solo restringe (nunca reenciende lo que el modo de
 *     rendimiento apagó).
 *
 *  3) Expone vía contexto los toggles RESUELTOS (blurOn, animOn, shadowOn,
 *     visible, sleeping, idle) para que la página de rendimiento y los
 *     componentes sepan qué está activo SIN re-leer los ajustes ni
 *     re-calcular CSS.
 *
 *  4) REPOSO (app-idle): con la ventana a la vista, si el usuario lleva
 *     APP_IDLE_MS sin tocar nada y no hay contenido en vivo (useLiveRender:
 *     vídeo de fondo, karaoke, carga en curso), la app deja de dibujar:
 *     animaciones CSS pausadas y bucles JS parados por el flag `idle`. Es el
 *     comportamiento de un navegador con la página quieta — el compositor no
 *     produce fotogramas y la iGPU queda a cero. Cualquier entrada levanta el
 *     reposo al instante (`wake`) y los relojes re-sincronizan solos desde el
 *     audio (audio.currentTime / progressRef), sin deriva.
 */
export function PerformanceProvider({ children }) {
  const { settings } = useSettings();
  const visible = useVisibility();
  const [sleeping, setSleeping] = useState(false);

  // Reposo por inactividad del usuario + contenido en vivo (vídeo, karaoke,
  // carga): mientras haya algo de eso en pantalla, la app debe seguir
  // dibujando aunque el usuario no toque nada.
  const { idle: userInactive, wake } = useIdle(APP_IDLE_MS);
  const live = useLiveRenderActive();
  const idle = visible && !live && userInactive;

  const mode = settings.perfMode || "auto";
  const customBlur = settings.perfBlur !== false;
  const customAnim = settings.perfAnim !== false;
  const customShadow = settings.perfShadow !== false;
  const customSolid = settings.perfSolid !== false;
  // Estilo de fondo (Apariencia): refuerza el modo de rendimiento, nunca lo
  // relaja — si Rendimiento ya apagó el blur, "Desenfoque" no lo reenciende.
  //   blur   → cristal con backdrop-filter (comportamiento normal)
  //   solid  → colores sólidos sin velo translúcido (html.perf-solid)
  //   none   → sin ningún filtro detrás de la UI (html.perf-blur-off)
  const blurStyle = settings.blurStyle || "blur";
  // pauseEffectsHidden (Rendimiento): al apagarlo la app conserva blur/anim
  // aunque la ventana esté oculta (por defecto se pausan para ahorrar GPU).
  const pauseHidden = settings.pauseEffectsHidden !== false;

  // Sueño profundo: la ventana lleva OCULTA (no «sin foco») APP_SLEEP_MS →
  // app-sleep (animaciones apagadas + liberación de recursos). Visible otra
  // vez → se sale al instante. Con pauseHidden off el usuario pidió no
  // tocar efectos, así que tampoco se duerme.
  useEffect(() => {
    if (visible || !pauseHidden) {
      setSleeping(false);
      return undefined;
    }
    const timer = setTimeout(() => setSleeping(true), APP_SLEEP_MS);
    return () => clearTimeout(timer);
  }, [visible, pauseHidden]);

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
    root.classList.toggle("perf-blur-off", !flags.blurOn || blurStyle === "none");
    root.classList.toggle("perf-anim-off", !flags.animOn);
    root.classList.toggle("perf-shadow-off", !flags.shadowOn);
    root.classList.toggle("perf-solid", !!flags.solidOn || blurStyle === "solid");
    // Congelado inmediato al quedar la ventana oculta (música sigue).
    root.classList.toggle("app-hidden", !visible && pauseHidden);
    // Sueño profundo a los 15 s de oculta: animaciones apagadas y
    // recursos pesados liberados (LyricsView descarga su fondo).
    root.classList.toggle("app-sleep", sleeping && pauseHidden);
    // Reposo con la ventana a la vista: sin entradas del usuario y sin
    // contenido en vivo → animaciones pausadas y bucles JS parados (`idle`).
    // El compositor deja de producir fotogramas (iGPU a cero) hasta la
    // siguiente entrada.
    root.classList.toggle("app-idle", idle);
    return () => {
      root.classList.remove(
        "perf-blur-off",
        "perf-anim-off",
        "perf-shadow-off",
        "perf-solid",
        "app-hidden",
        "app-sleep",
        "app-idle",
      );
    };
  }, [flags, visible, sleeping, blurStyle, pauseHidden, idle]);

  const value = useMemo(
    () => ({ ...flags, visible, sleeping, idle, wake }),
    [flags, visible, sleeping, idle, wake],
  );

  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance() {
  return useContext(PerformanceContext);
}
