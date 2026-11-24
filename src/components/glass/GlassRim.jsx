import React, { useId, useMemo } from "react";
import { angleToUnitVector, clamp } from "../../utils/glassEngine";

const LIGHT_CONFIG = {
  comet: { dash: "16 84", duration: "4.5s", width: 2.2, opacity: 0.9, blur: 1.2 },
  twin: { dash: "12 38 12 38", duration: "6.5s", width: 2, opacity: 0.85, blur: 1.2 },
  halo: { dash: "42 58", duration: "7s", width: 3, opacity: 0.6, blur: 2.2 },
  outline: { width: 1.6, opacity: 0.5 },
  aura: { dash: "28 72", duration: "8s", width: 3.4, opacity: 0.5, blur: 3 },
  prism: { width: 2, opacity: 0.75, prism: true },
};

/**
 * Rim del vidrio: Fresnel + especular + bisel + luz de ventana.
 *
 * Es SVG inline (no CSS mask) para que el mismo dibujo funcione en WebView2 y
 * WebKitGTK. La luz en movimiento es un `stroke-dashoffset` sobre un trazo
 * normalizado a 100 unidades: el compositor mueve el dash sin recalcular la
 * geometría. Las animaciones viven en index.html (CSP con nonce).
 */
export function GlassRim({ width, height, radius = 20, settings = {} }) {
  const reactId = useId();
  const uid = useMemo(() => `ow-glass-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [reactId]);

  if (!(width > 0) || !(height > 0)) return null;

  const w = Math.round(width * 100) / 100;
  const h = Math.round(height * 100) / 100;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const stroke = 1.5;
  const rx = Math.max(0, r - stroke / 2);
  const fresnel = clamp(Number(settings.glassFresnel ?? 0.6), 0, 1);
  const bevel = clamp(Number(settings.glassBevel ?? 0.35), 0, 1);
  const lightStyle = settings.glassLightStyle || "outline";
  const light = LIGHT_CONFIG[lightStyle];
  const angle = angleToUnitVector(settings.glassSpecularAngle ?? 40);
  const rimOpacity = 0.25 + fresnel * 0.45;

  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 2,
      }}
    >
      <defs>
        <linearGradient id={`${uid}-rim`} x1={angle.x1} y1={angle.y1} x2={angle.x2} y2={angle.y2}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.62" />
          <stop offset="0.38" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="0.68" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.42" />
        </linearGradient>
        <linearGradient id={`${uid}-light`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-prism`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b6b" stopOpacity="0.85" />
          <stop offset="0.28" stopColor="#ffd93d" stopOpacity="0.8" />
          <stop offset="0.52" stopColor="#6bcb77" stopOpacity="0.8" />
          <stop offset="0.76" stopColor="#4d96ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#c77dff" stopOpacity="0.85" />
        </linearGradient>
        {light?.blur && (
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={light.blur} />
          </filter>
        )}
      </defs>

      <rect
        x={stroke / 2}
        y={stroke / 2}
        width={Math.max(0, w - stroke)}
        height={Math.max(0, h - stroke)}
        rx={rx}
        fill="none"
        stroke={`url(#${uid}-rim)`}
        strokeWidth={stroke}
        opacity={rimOpacity}
      />

      {bevel > 0.01 && (
        <rect
          x={stroke + 1.25}
          y={stroke + 1.25}
          width={Math.max(0, w - (stroke + 1.25) * 2)}
          height={Math.max(0, h - (stroke + 1.25) * 2)}
          rx={Math.max(0, rx - 1.25)}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.14 * bevel}
          strokeWidth={1}
        />
      )}

      {light && (
        <rect
          x={stroke / 2}
          y={stroke / 2}
          width={Math.max(0, w - stroke)}
          height={Math.max(0, h - stroke)}
          rx={rx}
          fill="none"
          stroke={
            light.prism
              ? `url(#${uid}-prism)`
              : lightStyle === "outline"
                ? `url(#${uid}-rim)`
                : `url(#${uid}-light)`
          }
          strokeWidth={light.width}
          strokeLinecap="round"
          strokeDasharray={light.dash}
          pathLength="100"
          opacity={light.opacity * (0.55 + fresnel * 0.45)}
          filter={light.blur ? `url(#${uid}-glow)` : undefined}
          className={light.dash || light.prism ? "ow-glass-light" : undefined}
          style={
            light.dash
              ? { animation: `ow-glass-dash ${light.duration} linear infinite` }
              : undefined
          }
        />
      )}
    </svg>
  );
}
