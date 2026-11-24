import React, {
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GLASS } from "../../utils/theme";
import { SettingsContext } from "../../contexts/SettingsContext";
import { isGlassBlocked } from "../../utils/glassPresets";
import { clamp, getLensMap, glassGeometry, sceneOffsetForRect } from "../../utils/glassEngine";
import { GlassMagnifiedLens } from "./GlassMagnifiedLens";
import { GlassRim } from "./GlassRim";
import { useGlassScene } from "./glassSceneContext";

let filterSeq = 0;

// WebKitGTK no rasteriza `feImage` con data URLs dentro de un filtro SVG:
// la capa filtrada sale en blanco. En WebKit se usa la lente geométrica
// (copia ampliada en el anillo); en Chromium/WebView2, el desplazamiento
// real por píxeles.
const IS_WEBKIT =
  typeof navigator !== "undefined" &&
  /AppleWebKit/i.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg/i.test(navigator.userAgent);

function useElementRect(ref) {
  const [rect, setRect] = useState({ width: 0, height: 0, left: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let timer = 0;
    const read = () => {
      timer = 0;
      const next = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev.width === next.width &&
          prev.height === next.height &&
          prev.left === next.left &&
          prev.top === next.top
        ) {
          return prev;
        }
        return { width: next.width, height: next.height, left: next.left, top: next.top };
      });
    };
    // setTimeout y no rAF: la regla del repo prohíbe pedir fotogramas
    // permanentes; esto solo corre al montar/redimensionar.
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(read, 50);
    };
    read();
    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(schedule);
      observer.observe(el);
    }
    window.addEventListener("resize", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [ref]);
  return rect;
}

/**
 * Fondo de vidrio líquido de una superficie.
 *
 * Capas, de abajo arriba:
 *   1. escena recortada con el SVG de refracción (solo si hay portada);
 *   2. tinte ahumado + rim Fresnel/especular (SVG inline);
 *   3. contenido, que pinta el padre por encima.
 *
 * Sin escena, sin GPU o en bajo consumo se degrada a tinte + rim. Con el
 * modo apagado devuelve exactamente el material anterior (`GLASS.player` o
 * `GLASS.sheet`) para no cambiar nada.
 */
export const GlassBackground = forwardRef(function GlassBackground(
  {
    radius = 20,
    borderRadius,
    variant = "shell",
    frost,
    hovered = false,
    className,
    style,
    "aria-hidden": ariaHidden = true,
  },
  ref,
) {
  const rootRef = useRef(null);
  useImperativeHandle(ref, () => rootRef.current, []);
  const rect = useElementRect(rootRef);
  // Contexto directo con fallback: el fondo se usa también en tests y en
  // piezas aisladas; sin provider debe degradar al material plano, no romper.
  const settingsCtx = useContext(SettingsContext);
  const settings = settingsCtx?.settings || {};
  const scene = useGlassScene();

  const glassOn = !!settings.glassMode;
  const shell = variant !== "sheet";
  // El modo auto puede resolver a bajo consumo por la detección conservadora
  // de WebKitGTK («Apple GPU»); el interruptor explícito del vidrio manda.
  const fallback = !glassOn || isGlassBlocked(settings);
  const lowPower = !!settings.glassLowPower;
  const frostMode =
    frost || (shell ? settings.glassFrostShell : settings.glassFrostMenus) || "auto";
  const frosted = frostMode === "frosted" || (frostMode === "auto" && !shell);
  const frostBlur = frosted ? clamp(Number(settings.glassBlur) || 20, 0, 40) : 0;

  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const radiusPx = typeof radius === "number" ? radius : parseFloat(radius) || 0;
  const effectiveRadius = settings.glassRound
    ? Math.min(height / 2 || radiusPx, Math.max(radiusPx, 26))
    : radiusPx;
  const { glassDepth, glassIor, glassRefraction } = settings;

  const lens = useMemo(() => {
    if (
      !glassOn ||
      fallback ||
      lowPower ||
      !shell ||
      !scene?.enabled ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    const geometry = glassGeometry({ glassDepth, glassIor, glassRefraction }, width, height);
    return {
      width,
      height,
      radius: effectiveRadius,
      rim: geometry.rim,
      maxDisp: geometry.maxDisp,
      margin: geometry.margin,
    };
  }, [
    glassOn,
    fallback,
    lowPower,
    shell,
    scene?.enabled,
    width,
    height,
    effectiveRadius,
    glassDepth,
    glassIor,
    glassRefraction,
  ]);

  const lensMap = useMemo(() => {
    if (!lens || IS_WEBKIT) return null;
    const map = getLensMap(lens);
    return map?.url ? map : null;
  }, [lens]);

  // La escena forma parte de la clave: al cambiar de canción el filtro se
  // recrea y no reutiliza la caché de la portada anterior. El hash evita
  // depender del callback sin usar el valor.
  const sceneTag = useMemo(() => {
    if (!scene?.url) return "none";
    let hash = 0;
    for (let i = 0; i < scene.url.length; i += 1) {
      hash = (hash * 31 + scene.url.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }, [scene?.url]);

  const filterId = useMemo(() => {
    if (!lensMap) return null;
    filterSeq += 1;
    return `ow-lens-${filterSeq}-${sceneTag}`;
  }, [lensMap, sceneTag]);

  const renderFallback = fallback;
  const renderMagnified = !!lens && IS_WEBKIT;
  const renderFilter = !!lensMap && !!filterId && !IS_WEBKIT;
  const renderLens = renderMagnified || renderFilter;
  const offset = scene?.cover ? sceneOffsetForRect(scene.cover, rect, lens?.margin || 0) : null;
  const frostOffset = scene?.cover ? sceneOffsetForRect(scene.cover, rect, 0) : null;
  const renderFrost = !!scene?.enabled && shell && frosted && frostBlur > 0;

  const fallbackMaterial = shell ? GLASS.player : GLASS.sheet;
  const fallbackStyle = {
    ...fallbackMaterial,
    ...(hovered && shell
      ? {
          background: "rgba(16,16,22,.24)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.10), 0 6px 18px rgba(0,0,0,.28)",
        }
      : {}),
  };

  const tintAlpha = shell
    ? 0.14 + clamp(Number(settings.glassTint) || 0.35, 0, 1) * 0.38
    : 0.55 + clamp(Number(settings.glassTint) || 0.35, 0, 1) * 0.35;
  const dark = settings.glassDark !== false;
  const tint = dark
    ? `linear-gradient(180deg, rgba(255,255,255,${hovered ? 0.15 : 0.11}), rgba(255,255,255,.02) 34%, rgba(0,0,0,.16)), rgba(6,6,12,${tintAlpha})`
    : `linear-gradient(180deg, rgba(255,255,255,${hovered ? 0.2 : 0.16}), rgba(255,255,255,.05) 34%, rgba(0,0,0,.12)), rgba(18,18,28,${tintAlpha * 0.6})`;

  const filterParams = {
    saturate: clamp(Number(settings.glassSaturation) || 1.15, 0.4, 2),
    brightness: clamp(Number(settings.glassBrightness) || 1, 0.5, 1.8),
    contrast: clamp(Number(settings.glassContrast) || 1, 0.5, 1.8),
    dispersionFactor: clamp(Number(settings.glassDispersion) || 0, 0, 100) * 0.0008,
    blur: frostBlur > 0 ? frostBlur / 2 : 0,
  };
  const displacement = lens ? lens.maxDisp * 2 : 0;
  const rimSettings = lowPower ? { ...settings, glassLightStyle: "off" } : settings;

  return (
    <div
      ref={rootRef}
      aria-hidden={ariaHidden}
      className={className}
      data-glass={renderFallback ? "fallback" : renderLens ? "lens" : "low"}
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: borderRadius || `${effectiveRadius}px`,
        pointerEvents: "none",
        zIndex: 0,
        // La lente (shell) recorta su margen; las hojas y el fallback no lo
        // necesitan y así el backdrop-filter no queda bajo un clip con radio.
        overflow: renderFallback || !shell ? "visible" : "hidden",
        boxShadow: renderFallback
          ? undefined
          : "inset 0 1px 0 rgba(255,255,255,.14), 0 10px 30px rgba(0,0,0,.38)",
        ...style,
      }}
    >
      {renderFallback && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            borderRadius: "inherit",
            ...fallbackStyle,
          }}
        />
      )}

      {renderFrost && (
        <div
          className="ow-glass-frost"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            overflow: "hidden",
            backgroundImage: `url("${scene.url}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: frostOffset?.backgroundSize,
            backgroundPosition: frostOffset?.backgroundPosition,
            filter: `blur(${frostBlur}px)`,
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: scene.veil }} />
        </div>
      )}

      {renderMagnified && (
        <GlassMagnifiedLens
          width={lens.width}
          height={lens.height}
          radius={lens.radius}
          margin={lens.margin}
          rim={lens.rim}
          maxDisp={lens.maxDisp}
          scene={scene}
          rect={rect}
          settings={settings}
          frostBlur={frosted ? frostBlur : 0}
        />
      )}

      {renderFilter && (
        <div
          className="ow-glass-lens"
          style={{
            position: "absolute",
            inset: `-${lens.margin}px`,
            filter: `url(#${filterId})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url("${scene.url}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: offset?.backgroundSize,
              backgroundPosition: offset?.backgroundPosition,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: scene.lensVeil || scene.veil,
            }}
          />
        </div>
      )}
      {renderFilter &&
        typeof document !== "undefined" &&
        createPortal(
          <svg
            width="0"
            height="0"
            aria-hidden="true"
            style={{ position: "absolute", left: 0, top: 0 }}
          >
            <defs>
              <filter
                id={filterId}
                x="0"
                y="0"
                width={lensMap.field.width}
                height={lensMap.field.height}
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feImage
                  href={lensMap.url}
                  xlinkHref={lensMap.url}
                  x="0"
                  y="0"
                  width={lensMap.field.width}
                  height={lensMap.field.height}
                  preserveAspectRatio="none"
                  result="map"
                />
                {filterParams.dispersionFactor > 0 ? (
                  <>
                    <feDisplacementMap
                      in="SourceGraphic"
                      in2="map"
                      scale={displacement * (1 + filterParams.dispersionFactor)}
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result="lensR"
                    />
                    <feColorMatrix
                      in="lensR"
                      type="matrix"
                      values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                      result="red"
                    />
                    <feDisplacementMap
                      in="SourceGraphic"
                      in2="map"
                      scale={displacement}
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result="lensG"
                    />
                    <feColorMatrix
                      in="lensG"
                      type="matrix"
                      values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                      result="green"
                    />
                    <feDisplacementMap
                      in="SourceGraphic"
                      in2="map"
                      scale={displacement * (1 - filterParams.dispersionFactor)}
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result="lensB"
                    />
                    <feColorMatrix
                      in="lensB"
                      type="matrix"
                      values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                      result="blue"
                    />
                    <feBlend in="red" in2="green" mode="screen" result="rg" />
                    <feBlend in="rg" in2="blue" mode="screen" result="disp" />
                  </>
                ) : (
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={displacement}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="disp"
                  />
                )}
                {filterParams.blur > 0 && (
                  <feGaussianBlur in="disp" stdDeviation={filterParams.blur} result="frost" />
                )}
                <feColorMatrix
                  in={filterParams.blur > 0 ? "frost" : "disp"}
                  type="saturate"
                  values={filterParams.saturate}
                  result="sat"
                />
                <feComponentTransfer in="sat">
                  <feFuncR
                    type="linear"
                    slope={filterParams.contrast * filterParams.brightness}
                    intercept={(1 - filterParams.contrast) / 2}
                  />
                  <feFuncG
                    type="linear"
                    slope={filterParams.contrast * filterParams.brightness}
                    intercept={(1 - filterParams.contrast) / 2}
                  />
                  <feFuncB
                    type="linear"
                    slope={filterParams.contrast * filterParams.brightness}
                    intercept={(1 - filterParams.contrast) / 2}
                  />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>,
          document.body,
        )}

      {!renderFallback && (
        <>
          {!shell && (
            <div
              className="ow-glass-backdrop"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                borderRadius: "inherit",
                backdropFilter: frosted ? "blur(40px)" : "none",
                WebkitBackdropFilter: frosted ? "blur(40px)" : "none",
                background: "transparent",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              background: tint,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(0,0,0,.28)",
            }}
          />
          <GlassRim width={width} height={height} radius={effectiveRadius} settings={rimSettings} />
        </>
      )}
    </div>
  );
});
