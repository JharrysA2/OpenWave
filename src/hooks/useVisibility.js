import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * ¿Está la ventana minimizada (Win32 IsIconic) vía IPC de Tauri?
 *
 * CLAVE: WebView2 NO cambia `document.visibilityState` al minimizar
 * (verificado en vivo el 2026-10-02: tras ShowWindow(SW_MINIMIZE) el
 * documento seguía "visible" con focus=false). Sin esta señal la app
 * nunca se congelaría al minimizar. Fuera de Tauri (tests/jsdom) la
 * llamada lanza y se resuelve en false.
 */
export async function isWindowMinimized() {
  try {
    return !!(await getCurrentWindow().isMinimized());
  } catch {
    return false;
  }
}

/**
 * useVisibility - detecta si la ventana está realmente OCULTA
 * (minimizada o con el documento hidden). NO depende del FOCO: con
 * ventanas divididas la app puede perder el foco pero seguir visible, y en
 * ese caso NADA se congela (blur, animaciones y karaoke siguen vivos).
 *
 *   visible = document.visibilityState !== "hidden"  &&  !IsIconic(window)
 *
 * El foco solo dispara una RECONSULTA de IsIconic, no decide nada:
 * blur con la ventana no minimizada → sigue visible.
 *
 * Señales que reconcilian el estado:
 *   - `visibilitychange` (documento oculto: congelado síncrono, sin IPC)
 *   - `blur`/`focus` del window (DOM): el minimizado pierde foco siempre
 *   - `onResized` de Tauri (tao emite Resized en el WM_SIZE tanto del
 *     minimize como del restore → única señal que llega al restaurar
 *     SIN que vuelva el foco)
 *   - `onFocusChanged` de Tauri (refuerzo)
 *   - WATCHDOG: en vivo el 2026-10-03 se midió que las señales de
 *     restauración pueden llegar RETARDADAS o no llegar y la ventana
 *     quedó restaurada con app-sleep clavado (letras sin fondo y
 *     animaciones muertas con la ventana a la vista). Mientras `visible`
 *     siga false, un timer consulta IsIconic cada segundo → el despertar
 *     no puede quedar atrapado. Solo corre CONGELADO (al despertar el
 *     efecto se destruye): 1 IPC/s como máximo, cero con la app viva.
 *
 * La MUSICA SIGUE SONANDO en todos los casos: si la ventana queda
 * oculta, los efectos visuales pesados se pausan (app-hidden) y a los
 * 15 s PerformanceContext entra en sueño profundo (app-sleep); al
 * volver todo se reanuda exactamente donde quedó.
 */
export function useVisibility() {
  /** Última consulta IsIconic en vuelo: solo el resultado más reciente manda. */
  const seqRef = useRef(0);
  /** Último estado de minimizado ya conocido (para el paso síncrono). */
  const minimizedRef = useRef(false);

  const [visible, setVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });

  const reconcile = useCallback(() => {
    const seq = ++seqRef.current;
    const docVisible = typeof document === "undefined" || document.visibilityState !== "hidden";

    if (!docVisible) {
      // Documento oculto: congelado YA y sin IPC (la música no depende de esto).
      setVisible(false);
      return;
    }

    // Documento visible: paso síncrono con el último estado conocido…
    setVisible(!minimizedRef.current);
    // …y consulta autoritativa a Win32 (IsIconic) — WebView2 no reporta
    // hidden al minimizar, ver nota en isWindowMinimized().
    isWindowMinimized().then((min) => {
      if (seq !== seqRef.current) return; // otra reconciliación más reciente manda
      minimizedRef.current = min;
      const nowVisible =
        typeof document === "undefined" || (document.visibilityState !== "hidden" && !min);
      setVisible(nowVisible);
    });
  }, []);

  useEffect(() => {
    const onDoc = () => reconcile();
    const onWin = () => reconcile(); // blur/focus: solo RECONSULTA IsIconic

    document.addEventListener("visibilitychange", onDoc);
    window.addEventListener("blur", onWin);
    window.addEventListener("focus", onWin);
    reconcile(); // estado inicial (por si arranca minimizada)

    // Eventos de ventana de Tauri: fuera de Tauri (tests) lanza y se omite.
    let cancelled = false;
    const unsubs = [];
    (async () => {
      try {
        const w = getCurrentWindow();
        const subs = await Promise.all([
          w.onResized(() => reconcile()),
          w.onFocusChanged(() => reconcile()),
        ]);
        if (cancelled) {
          subs.forEach((u) => u());
        } else {
          unsubs.push(...subs);
        }
      } catch {
        /* sin runtime Tauri: visibilitychange + blur/focus bastan */
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onDoc);
      window.removeEventListener("blur", onWin);
      window.removeEventListener("focus", onWin);
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ya desuscripto */
        }
      });
    };
  }, [reconcile]);

  // ── Watchdog de despertar ────────────────────────────────────────────────
  // Mientras la app esté CONGELADA (visible=false con el documento a la
  // vista — WebView2 nunca reporta hidden), consulta IsIconic cada segundo:
  // si la señal de restauración no llega (o llega tarde), el despertar pasa
  // en ≤1 s igualmente. Con la app viva no existe (visible=true → sin
  // efecto), así que ni un timer ni un IPC sobran.
  useEffect(() => {
    if (visible) return undefined;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return undefined; // oculto de verdad: visibilitychange manda, sin IPC
    }
    const wd = setInterval(() => reconcile(), 1000);
    return () => clearInterval(wd);
  }, [visible, reconcile]);

  return visible;
}
