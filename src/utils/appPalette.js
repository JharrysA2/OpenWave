/**
 * Paleta de "Color de la app" (Ajustes → Apariencia).
 *
 * El primer color es el morado histórico de la app (= DEFAULT_SETTINGS.appColor
 * y APP_COLORS[0], lo comprueba appPalette.test.js).
 *
 * Cada hex es el color ELEGIDO; el acento que se aplica es
 * deriveTheme(hex).accent (brillo normalizado al rango visible del tema
 * oscuro → los oscuros se aclaran y los muy claros se oscurecen un poco) y el
 * texto/icono de los botones deriveTheme(hex).onAccent (negro sobre color
 * claro, blanco sobre oscuro, ≥4.5:1). Por eso los swatches se pintan con el
 * acento derivado: lo que ves es lo que se aplica.
 */
export const APP_COLORS = [
  // Púrpuras / violetas (el primero = por defecto)
  "#a78bfa",
  "#8b5cf6",
  "#c084fc",
  "#d946ef",
  "#e879f9",
  // Rosas / fucsias
  "#f472b6",
  "#ec4899",
  // Azules
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
  "#38bdf8",
  // Cian / turquesa
  "#22d3ee",
  "#2dd4bf",
  // Verdes
  "#4ade80",
  "#22c55e",
  "#a3e635",
  // Amarillos
  "#facc15",
  "#fde047",
  // Naranjas
  "#fb923c",
  "#f97316",
  // Rojos
  "#f87171",
  "#ef4444",
  "#dc2626",
  "#7f1d1d",
  // Neutros
  "#ffffff",
  "#94a3b8",
];
