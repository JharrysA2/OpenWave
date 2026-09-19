import React from "react";
import { GLASS } from "../utils/theme";
import { winCtrl } from "../utils/windowControls";

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      style={{
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        height: "32px",
        flexShrink: 0,
        padding: "0 0 0 14px",
        userSelect: "none",
        WebkitUserSelect: "none",
        position: "relative",
        zIndex: 100000,
        ...GLASS.titleBar,
        borderBottom: `1px solid color-mix(in srgb, var(--neon) 25%, rgba(255,255,255,.06))`,
      }}
    >
      <span
        style={{
          fontSize: "12px",
          fontWeight: "800",
          color: "rgba(255,255,255,.45)",
          letterSpacing: ".5px",
          alignSelf: "center",
        }}
      >
        SoundWave
      </span>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* ── Window controls — square, flush, full title-bar height like Windows ── */}
        {[
          {
            onClick: winCtrl.minimize,
            title: "Minimizar",
            svg: (
              <svg width="10" height="10" viewBox="0 0 12 12">
                <rect x="1" y="9.5" width="10" height="1.5" fill="currentColor" rx="1" />
              </svg>
            ),
          },
          {
            onClick: winCtrl.maximize,
            title: "Maximizar",
            svg: (
              <svg width="10" height="10" viewBox="0 0 12 12">
                <rect
                  x="2"
                  y="2.5"
                  width="8"
                  height="8"
                  rx="1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
            ),
          },
          {
            onClick: winCtrl.close,
            title: "Cerrar",
            svg: (
              <svg width="10" height="10" viewBox="0 0 12 12">
                <path
                  d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            ),
            close: true,
          },
        ].map(({ onClick, title, svg, close }) => (
          <button
            key={title}
            onClick={onClick}
            title={title}
            style={{
              width: "46px",
              minWidth: "46px",
              height: "100%",
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,.45)",
              cursor: "pointer",
              borderRadius: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .1s cubic-bezier(.16,1,.3,1)",
              flexShrink: 0,
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,.06)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = close
                ? "rgba(239,68,68,.85)"
                : "rgba(255,255,255,.14)";
              e.currentTarget.style.color = close ? "#fff" : "rgba(255,255,255,.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,.45)";
            }}
          >
            {svg}
          </button>
        ))}
      </div>
    </div>
  );
}
