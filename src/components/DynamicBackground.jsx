import React from "react";
import { vignetteOverlay } from "../utils/theme";

export function DynamicBackground({ enabled, hasAccent, overlayOpacity, cfTransitionSpeed }) {
  if (!enabled) return null;
  return (
    <>
      {/* ── Vignette sutil para profundidad ──────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: vignetteOverlay(),
          opacity: hasAccent ? 0.35 : 0.1,
          transition: `opacity ${cfTransitionSpeed} cubic-bezier(.16,1,.3,1)`,
        }}
      />
    </>
  );
}
