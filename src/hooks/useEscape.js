import { useEffect, useRef } from "react";
import { isOverlayActive } from "./useOverlayLayer";

/**
 * useEscape — la tecla ESC repartida en dos capas que no se pisan:
 *
 *  - `useEscClose(active, close)`: capas descartables (modales, sheets,
 *    paneles). Mantienen una pila global y SOLO el overlay más alto recibe
 *    ESC: un modal abierto sobre Ajustes o sobre la pantalla de letras cierra
 *    el de arriba y deja el de abajo intacto. Al cerrarse/desmontarse la capa
 *    se retira de la pila y el ESC siguiente baja un nivel.
 *
 *  - `useEscBack(onBack)`: navegación «atrás» de la app (vista actual →
 *    anterior). No actúa mientras haya cualquier overlay montado — ni siquiera
 *    uno que no use ESC (pila + respaldo de `html.overlay-open`) — para nunca
 *    navegar debajo de un modal. Si el foco está en un campo editable, la
 *    primera ESC solo sale del campo (blur) y la segunda navega: así no se
 *    pierden ediciones in-situ (renombrar playlist, escribir en el buscador).
 */

// Pila de capas con ESC: la última en montar es la que está encima.
const escStack = [];

/** ¿El elemento enfocado es un campo donde el usuario puede estar escribiendo? */
function isEditable(el) {
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true
  );
}

/**
 * Cierra `close()` con ESC mientras `active` sea true, pero SOLO si esta capa
 * es la más alta de la pila. `close` se lee en cada pulsación (ref): los
 * handlers inline del padre no reinician el listener en cada render.
 */
export function useEscClose(active = true, close) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!active) return undefined;

    const entry = { close: () => closeRef.current() };
    escStack.push(entry);

    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Otro overlay está encima: él se encarga (o no hay ESC para nosotros).
      if (escStack[escStack.length - 1] !== entry) return;
      e.preventDefault();
      entry.close();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      const i = escStack.lastIndexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [active]);
}

/**
 * Navegación «atrás» con ESC. `onBack` se lee en cada pulsación (ref).
 * Requiere `useOverlayLayer` exportando `isOverlayActive` como respaldo por si
 * una capa monta el overlay sin registrarse en la pila de ESC.
 */
export function useEscBack(onBack) {
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Hay una capa encima: que la cierre ella (ESC = «salir de lo de arriba»).
      if (escStack.length > 0) return;
      if (isOverlayActive()) return;
      // Foco en un campo editable: primero se sale del campo, después se
      // navega (el blur además dispara el guardado de ediciones tipo
      // onBlur como el renombrado de playlist).
      const el = document.activeElement;
      if (isEditable(el)) {
        el.blur();
        e.preventDefault();
        return;
      }
      e.preventDefault();
      backRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
