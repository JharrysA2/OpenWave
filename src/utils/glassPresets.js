/**
 * Catálogo de estilos de luz de ventana del vidrio líquido.
 * Los ids son estables (se guardan en ajustes); las etiquetas viven en
 * i18n/translations para que el panel y el modal compartan la misma verdad.
 */
export const GLASS_LIGHT_STYLES = [
  { id: "off", labelKey: "glassLightOff" },
  { id: "comet", labelKey: "glassLightComet" },
  { id: "twin", labelKey: "glassLightTwin" },
  { id: "halo", labelKey: "glassLightHalo" },
  { id: "outline", labelKey: "glassLightOutline" },
  { id: "aura", labelKey: "glassLightAura" },
  { id: "prism", labelKey: "glassLightPrism" },
];

export function glassLightStyle(id) {
  return (
    GLASS_LIGHT_STYLES.find((style) => style.id === id) ||
    GLASS_LIGHT_STYLES.find((style) => style.id === "outline") ||
    GLASS_LIGHT_STYLES[0]
  );
}

export function glassLightLabel(t, id) {
  return t[glassLightStyle(id).labelKey] || "Outline";
}

/**
 * El vidrio líquido es una elección explícita: solo se bloquea cuando el
 * usuario apagó los filtros a mano (Color sólido / Ninguno) o eligió Bajo
 * consumo. El modo «auto» puede resolver a bajo consumo por una detección
 * conservadora de GPU (WebKitGTK informa «Apple GPU»), y eso no debe anular
 * un interruptor que el usuario acaba de encender.
 */
export function isGlassBlocked(settings = {}) {
  return (
    settings.blurStyle === "solid" ||
    settings.blurStyle === "none" ||
    settings.perfMode === "performance" ||
    (settings.perfMode === "custom" && (settings.perfBlur === false || settings.perfSolid === true))
  );
}
