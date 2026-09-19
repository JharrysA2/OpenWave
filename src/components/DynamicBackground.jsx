import React from "react";
import { vignetteOverlay } from "../utils/theme";

export function DynamicBackground({ enabled, hasAccent, overlayOpacity, cfTransitionSpeed }) {
  if (!enabled) return null;
  return (
    <>
      {/* ── Aurora Mesh Gradient — animated background blobs ──────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
          opacity: hasAccent ? overlayOpacity * 0.5 : overlayOpacity * 0.25,
          transition: `opacity 1.5s cubic-bezier(.16,1,.3,1)`,
        }}
      >
        <div
          className="aurora-layer aurora-1"
          style={{ opacity: 0.45, transition: `background 2s cubic-bezier(.16,1,.3,1)` }}
        />
        <div
          className="aurora-layer aurora-2"
          style={{ opacity: 0.3, transition: `background 2s cubic-bezier(.16,1,.3,1)` }}
        />
        <div
          className="aurora-layer aurora-3"
          style={{ opacity: 0.18, transition: `background 2s cubic-bezier(.16,1,.3,1)` }}
        />
      </div>

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
          willChange: "opacity",
        }}
      />
    </>
  );
}
