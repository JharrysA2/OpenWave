// ── Botones de reproducción ──────────────────────────────────────────────────
export const BTN_SHAPES = [
  { id: "circle", label: "Círculo", style: { borderRadius: "50%", width: "44px", height: "44px" } },
  {
    id: "rounded",
    label: "Redondo",
    style: { borderRadius: "14px", width: "44px", height: "44px" },
  },
  {
    id: "square",
    label: "Cuadrado",
    style: { borderRadius: "6px", width: "44px", height: "44px" },
  },
  { id: "pill", label: "Píldora", style: { borderRadius: "22px", width: "52px", height: "36px" } },
];

export function getBtnShapeStyle(id) {
  return BTN_SHAPES.find((b) => b.id === id)?.style || BTN_SHAPES[0].style;
}

// ── Estilos de barra de progreso ─────────────────────────────────────────────
export const BAR_STYLES = [
  { id: "thin", label: "Delgada", desc: "Sutil, 2px" },
  { id: "line", label: "Línea", desc: "Estándar, 4px" },
  { id: "thick", label: "Gruesa", desc: "8px de grosor" },
];
