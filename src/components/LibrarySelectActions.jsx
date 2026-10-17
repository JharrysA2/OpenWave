import React, { useState } from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { GLASS, RADIUS, SHADOWS } from "../utils/theme";

/**
 * Botones del modo selección (patrón de PlaylistView) para las vistas de
 * biblioteca: "Seleccionar" y, cuando hay selección, "Eliminar (N)" y
 * "Mover (N)". El hover es declarativo (estado interno) y nunca queda
 * "pegado" en el DOM.
 *
 * Todos van con el material del player bar (cristal + brillo interior +
 * sombra) y SIN contorno: el estado (modo selección, acento) se marca con el
 * relleno y el color, no con un aro de 1px.
 *
 * Props:
 *  - enabled: mostrar el botón "Seleccionar" (la lista tiene canciones)
 *  - selectMode / count: estado del modo selección (useMultiSelect)
 *  - onToggleSelectMode / onDelete / onMove: callbacks del padre
 */
export function LibrarySelectActions({
  accentColor,
  enabled = true,
  selectMode = false,
  count = 0,
  onToggleSelectMode,
  onDelete,
  onMove,
}) {
  const [hover, setHover] = useState(null);
  const hov = (key) => ({
    onMouseEnter: () => setHover(key),
    onMouseLeave: () => setHover((k) => (k === key ? null : k)),
  });

  const hasSelection = selectMode && count > 0;

  const base = {
    borderRadius: RADIUS.pill,
    padding: "9px 16px",
    fontSize: "12.5px",
    fontWeight: "700",
    fontFamily: FONT,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "background .12s, color .12s, box-shadow .12s",
    border: "none",
    boxShadow: SHADOWS.closeBtn,
  };

  return (
    <>
      {enabled && (
        <button
          onClick={onToggleSelectMode}
          style={{
            ...base,
            // Modo selección: relleno del acento. En reposo/hover, el cristal.
            background: selectMode
              ? `${accentColor}22`
              : hover === "select"
                ? GLASS.btnHoverSoft.background
                : GLASS.btn.background,
            color: selectMode ? accentColor : "rgba(255,255,255,.5)",
          }}
          {...hov("select")}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          {selectMode ? `Seleccionar (${count})` : "Seleccionar"}
        </button>
      )}

      {hasSelection && (
        <button
          onClick={onDelete}
          style={{
            ...base,
            // Sin rojo: el borrado se pinta como el resto de acciones de la
            // barra (la selección ya avisa de lo que va a borrarse).
            background: hover === "delete" ? GLASS.btnHoverSoft.background : GLASS.btn.background,
            color: "rgba(255,255,255,.5)",
          }}
          {...hov("delete")}
        >
          {Ic.trash}
          Eliminar ({count})
        </button>
      )}

      {hasSelection && (
        <button
          onClick={onMove}
          style={{
            ...base,
            background:
              hover === "move"
                ? `color-mix(in srgb, ${accentColor} 20%, rgba(255,255,255,.05))`
                : `${accentColor}12`,
            color: accentColor,
          }}
          {...hov("move")}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Mover ({count})
        </button>
      )}
    </>
  );
}
