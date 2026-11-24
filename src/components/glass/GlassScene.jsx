import React, { useEffect, useMemo, useState } from "react";
import { GlassSceneContext } from "./glassSceneContext";

/**
 * Escena del vidrio líquido.
 *
 * Solo carga la portada de la pista actual y publica su URL y tamaño natural
 * por contexto. No pinta ningún fondo de pantalla: la portada se recorta
 * localmente dentro de cada superficie de cristal, así que el fondo de la app
 * sigue siendo el oscuro normal y no hay una opción de «portada de fondo».
 *
 * Si no hay portada o la imagen falla, el contexto queda deshabilitado y el
 * cristal cae al tinte + rim.
 */
function songCoverUrl(song) {
  const thumbs = song?.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    return thumbs[thumbs.length - 1]?.url || null;
  }
  return song?.thumbnail || null;
}

const EMPTY_SCENE = {
  enabled: false,
  url: null,
  natural: null,
  veil: "rgba(5,5,10,0.6)",
  // El cristal deja ver la portada más limpia que el fondo de contenido:
  // el velo de la escena protege la lectura de la app, no el canto de la
  // lente. Un velo claro hace visible la refracción.
  lensVeil: "rgba(5,5,10,0.16)",
};

export function GlassScene({ song, enabled, children }) {
  const url = enabled ? songCoverUrl(song) : null;
  const [natural, setNatural] = useState(null);

  useEffect(() => {
    if (!url) {
      setNatural(null);
      return undefined;
    }
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      setNatural(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => {
      if (alive) setNatural(null);
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  const model = useMemo(() => {
    if (!enabled || !url || !natural) return EMPTY_SCENE;
    return {
      enabled: true,
      url,
      natural,
      veil: EMPTY_SCENE.veil,
      lensVeil: EMPTY_SCENE.lensVeil,
    };
  }, [enabled, url, natural]);

  return <GlassSceneContext.Provider value={model}>{children}</GlassSceneContext.Provider>;
}
