import { useEffect, useRef } from "react";

/**
 * useDragScroll — arrastre horizontal para bandas de tarjetas (home).
 *
 * Convierte un mousedown + mover el ratón en scrollLeft sobre el contenedor,
 * para poder «arrastrar a la derecha» y ver el resto de la fila (escritorio:
 * la rueda del ratón sigue scrolleando la página en vertical; shift+rueda y
 * trackpad ya van en horizontal nativos).
 *
 * Detalles que evitan regresiones:
 *  - Umbral de 5 px: un click normal (con su micro-movimiento) no se convierte
 *    en arrastre ni deja de activar la tarjeta.
 *  - El click que cierra un arrastre se suprime en la fase de captura: arrastrar
 *    encima de una tarjeta NO la reproduce/abre.
 *  - Solo botón izquierdo; la zona de la barra de scroll (Chromium la reporta
 *    dentro del mismo elemento) se ignora para no pelear con el arrastre nativo
 *    de la propia barra.
 *  - `<img>`: el drag nativo de imágenes se anula (fantasma del navegador).
 *
 * Sin estado de React: todo vive en refs, así el arrastre no re-renderiza.
 */
const DRAG_THRESHOLD_PX = 5;

export function useDragScroll() {
  const ref = useRef(null);
  const state = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  useEffect(() => {
    const onMove = (e) => {
      const s = state.current;
      const el = ref.current;
      if (!s.active || !el) return;
      const dx = e.clientX - s.startX;
      // Todavía dentro del umbral: sin scroll y sin «movido» (el click cuenta).
      if (!s.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      s.moved = true;
      // startScroll se congela en el mousedown: el delta se mide contra el
      // origen, no contra el último frame (acumula sin deriva).
      el.scrollLeft = s.startScroll - dx;
    };

    const onUp = () => {
      const s = state.current;
      if (!s.active) return;
      s.active = false;
      // `moved` queda armado hasta el click de cierre (se limpia ahí o en el
      // siguiente mousedown): si el mouseup cae fuera de la ventana y el
      // click nunca llega, el siguiente mousedown lo resetea igualmente.
      ref.current?.classList.remove("is-dragging");
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onMouseDown = (e) => {
    const el = ref.current;
    const s = state.current;
    s.moved = false;
    if (!el || e.button !== 0) return;
    // Zona de scrollbar (existe solo con overflow): la arrastra el propio
    // browser. En jsdom clientWidth es 0 → sin layout → se omite el chequeo.
    if (el.clientWidth > 0) {
      const rect = el.getBoundingClientRect();
      if (e.clientX - rect.left > el.clientWidth || e.clientY - rect.top > el.clientHeight) {
        return;
      }
    }
    s.active = true;
    s.startX = e.clientX;
    s.startScroll = el.scrollLeft;
    el.classList.add("is-dragging");
  };

  // Captura (antes del onClick de la tarjeta): un arrastre no debe activar nada.
  const onClickCapture = (e) => {
    if (!state.current.moved) return;
    state.current.moved = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragStart = (e) => e.preventDefault();

  return { ref, onMouseDown, onClickCapture, onDragStart };
}
