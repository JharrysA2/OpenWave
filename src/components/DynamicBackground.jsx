import React from "react";
import { vignetteOverlay } from "../utils/theme";

export function DynamicBackground({
  enabled,
  hasAccent,
  overlayOpacity,
  cfTransitionSpeed,
  vignette = 100,
}) {
  if (!enabled) return null;
  // vignette (0–200 %): multiplicador del oscurecimiento. 100 = actual,
  // 0 = sin velo, 200 = el doble de oscuro.
  // OJO (bug reportado): `Number(vignette) || 100` convertía el 0 en 100
  // porque 0 es falsy — «Sin velo» aplicaba justo el velo por defecto. El 0
  // explícito se respeta; solo null/undefined/no-numérico caen al 100.
  const num = Number(vignette ?? 100);
  const k = (Number.isFinite(num) ? Math.min(200, Math.max(0, num)) : 100) / 100;
  return (
    <>
      {/* Vignette: subtle depth overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: vignetteOverlay(),
          opacity: (hasAccent ? 0.35 : 0.1) * k,
          transition: `opacity ${cfTransitionSpeed} cubic-bezier(.16,1,.3,1)`,
        }}
      />
    </>
  );
}
