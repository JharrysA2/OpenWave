import { createContext, useContext } from "react";

/**
 * Contexto de la escena del vidrio líquido. Separado del componente para
 * que el refresco rápido de Vite no se queje de exports mixtos.
 */
export const GlassSceneContext = createContext(null);

export function useGlassScene() {
  return useContext(GlassSceneContext);
}
