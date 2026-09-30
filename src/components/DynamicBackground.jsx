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
  const k = Math.max(0, Math.min(200, Number(vignette) || 100)) / 100;
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
