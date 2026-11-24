import React, { useId, useMemo } from "react";

/**
 * Lente geométrica para WebKitGTK.
 *
 * WebKitGTK no rasteriza `feImage` con data URLs dentro de un filtro SVG
 * (la capa filtrada sale en blanco). En lugar de abandonar la refracción,
 * se dibuja una copia ampliada de la escena recortada al anillo del borde:
 * el centro queda intacto y el canto muestra la imagen magnificada, que es
 * el efecto visual de la lente. No usa `feImage` ni filtros de imagen, así
 * que funciona también en Chromium y mantiene el coste estático.
 *
 * La transición del anillo se suaviza con un `feGaussianBlur` sobre la
 * máscara (filtros SVG sobre elementos SVG, soportados en ambos motores).
 */
export function GlassMagnifiedLens({
  width,
  height,
  radius = 20,
  margin = 0,
  rim = 14,
  maxDisp = 0,
  scene,
  cover,
  settings = {},
  frostBlur = 0,
}) {
  const reactId = useId();
  const uid = useMemo(() => `ow-mag-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [reactId]);

  if (!cover || !scene?.url || width <= 0 || height <= 0) return null;

  const w = width + margin * 2;
  const h = height + margin * 2;
  const cx = margin + width / 2;
  const cy = margin + height / 2;
  const imageX = cover.left + margin;
  const imageY = cover.top + margin;
  const innerW = width - rim * 2;
  const innerH = height - rim * 2;
  const innerR = Math.max(0, radius - rim);
  const feather = Math.max(1, rim * 0.22);
  // En una barra de 94 px, maxDisp≈28: 1 + 28/(47)*0.75 ≈ 1.45. En una hoja
  // alta el factor baja solo porque el centro está más lejos del canto.
  const scale = Math.min(1.8, Math.max(1.04, 1 + (maxDisp / Math.max(1, height / 2)) * 0.75));
  // WebKit pierde la imagen si el <g> que la contiene lleva transform y el
  // grupo padre una máscara. Se pre-escala el rectángulo de la imagen en vez
  // de usar transform: mismo resultado y funciona en WebKitGTK.
  const scaledX = cx + (imageX - cx) * scale;
  const scaledY = cy + (imageY - cy) * scale;
  const scaledW = cover.width * scale;
  const scaledH = cover.height * scale;

  if (innerW <= 2 || innerH <= 2) return null;

  const sat = Math.min(2, Math.max(0.4, Number(settings.glassSaturation) || 1.15));
  const bright = Math.min(1.8, Math.max(0.5, Number(settings.glassBrightness) || 1));
  const contrast = Math.min(1.8, Math.max(0.5, Number(settings.glassContrast) || 1));
  const blur = frostBlur > 0 ? `blur(${Number(frostBlur)}px) ` : "";

  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="ow-glass-lens ow-glass-lens--magnified"
      style={{
        position: "absolute",
        inset: `-${margin}px`,
        width: `${w}px`,
        height: `${h}px`,
        pointerEvents: "none",
        overflow: "hidden",
        filter: `${blur}saturate(${sat}) brightness(${bright}) contrast(${contrast})`,
      }}
    >
      <defs>
        <mask id={`${uid}-ring`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
          <rect x={margin} y={margin} width={width} height={height} rx={radius} fill="#ffffff" />
          <rect
            x={margin + rim}
            y={margin + rim}
            width={innerW}
            height={innerH}
            rx={innerR}
            fill="#000000"
            filter={`url(#${uid}-feather)`}
          />
        </mask>
        <filter id={`${uid}-feather`} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation={feather} />
        </filter>
      </defs>

      <g mask={`url(#${uid}-ring)`}>
        <image
          href={scene.url}
          x={scaledX}
          y={scaledY}
          width={scaledW}
          height={scaledH}
          preserveAspectRatio="none"
        />
        <rect
          x={margin}
          y={margin}
          width={width}
          height={height}
          rx={radius}
          fill={scene.lensVeil || scene.veil}
        />
      </g>
    </svg>
  );
}
