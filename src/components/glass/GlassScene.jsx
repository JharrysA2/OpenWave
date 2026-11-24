import React, { useEffect, useMemo, useState } from "react";
import { computeSceneCover } from "../../utils/glassEngine";
import { GlassSceneContext } from "./glassSceneContext";

/**
 * Escena del vidrio líquido.
 *
 * Es la única fuente de fondo que puede refractar la lente: la portada
 * actual, recortada como un `background-size: cover` y oscurecida con un
 * velo. `GlassSurface` recibe la misma geometría por contexto y alinea su
 * copia con esta escena, píxel a píxel.
 *
 * Si el modo está apagado, no hay portada o la imagen falla, el contexto
 * queda deshabilitado y el cristal cae al tinte + rim (sin lente).
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
  cover: null,
  veil: "rgba(5,5,10,0.6)",
};

export function GlassScene({ song, enabled, children }) {
  const url = enabled ? songCoverUrl(song) : null;
  const [natural, setNatural] = useState(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      }, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const model = useMemo(() => {
    if (!enabled || !url || !natural || viewport.width <= 0 || viewport.height <= 0) {
      return EMPTY_SCENE;
    }
    return {
      enabled: true,
      url,
      cover: computeSceneCover(natural.width, natural.height, viewport.width, viewport.height),
      veil: EMPTY_SCENE.veil,
    };
  }, [enabled, url, natural, viewport]);

  return (
    <GlassSceneContext.Provider value={model}>
      {model.enabled && (
        <div
          aria-hidden="true"
          className="ow-glass-scene"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            overflow: "hidden",
            pointerEvents: "none",
            background: "#0b0b10",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: `${model.cover.left}px`,
              top: `${model.cover.top}px`,
              width: `${model.cover.width}px`,
              height: `${model.cover.height}px`,
              backgroundImage: `url("${model.url}")`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
          />
          <div style={{ position: "absolute", inset: 0, background: model.veil }} />
        </div>
      )}
      {children}
    </GlassSceneContext.Provider>
  );
}
