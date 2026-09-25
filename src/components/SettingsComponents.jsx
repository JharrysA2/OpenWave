import React, { useState } from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, GLASS } from "../utils/theme";

export function SettingRow({ icon, label, desc, right, onClick, border = true }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "13px 18px",
        cursor: onClick ? "pointer" : "default",
        background: hov && onClick ? GLASS.btnHoverSoft.background : "transparent",
        borderBottom: border ? "1px solid rgba(255,255,255,.05)" : "none",
        transition: TRANSITIONS.fast,
      }}
    >
      {icon && (
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: RADIUS.cover,
            flexShrink: 0,
            ...GLASS.btn,
            // Sin blur propio: ya está dentro del panel difuminado. Un
            // backdrop-filter de 34px no aporta nada visible pero crea otra
            // región que la GPU debe re-blurar en cada repintado (hover).
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,.7)",
            fontSize: "16px",
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: "700", color: "rgba(255,255,255,.9)" }}>
          {label}
        </div>
        {desc && (
          <div
            style={{
              fontSize: "11.5px",
              color: COLORS.progressTime,
              fontWeight: "600",
              marginTop: "1px",
            }}
          >
            {desc}
          </div>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

export function SettingsSection({ title, children }) {
  return (
    <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: "800",
          color: "rgba(255,255,255,.28)",
          letterSpacing: "1.1px",
          textTransform: "uppercase",
          padding: "0 18px 8px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          ...GLASS.card,
          // Sin blur propio: el panel (GLASS.settings) ya difumina el fondo y
          // este backdrop-filter anidado obligaba a re-blurar toda la tarjeta
          // (ancho completo) en cada repintado, incluido cada hover de fila.
          // El degradado y el borde de GLASS.card se conservan intactos.
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          borderRadius: RADIUS.card,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function SettingsToggle({ value, onChange, accent }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: "44px",
        height: "26px",
        borderRadius: "13px",
        cursor: "pointer",
        background: value ? accent || COLORS.accentDefault : "rgba(255,255,255,.15)",
        position: "relative",
        flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "3px",
          left: value ? "21px" : "3px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          // Pista encendida = acento: el knob toma el fg derivado del acento
          background: value ? "var(--neon-fg)" : COLORS.white,
          boxShadow: "0 1px 4px rgba(0,0,0,.4)",
          transition: "left .2s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </div>
  );
}

export function SettingsChevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18L15 12L9 6" />
    </svg>
  );
}

import { useSettings } from "../contexts/useSettings";

export function SegBtn({ options, settingKey, current }) {
  const { updateSetting } = useSettings();
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        background: COLORS.surfaceSearchbar,
        borderRadius: "8px",
        padding: "3px",
      }}
    >
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => updateSetting(settingKey, val)}
          style={{
            padding: "5px 10px",
            borderRadius: "6px",
            border: "none",
            background: current === val ? "rgba(255,255,255,.15)" : "transparent",
            color: current === val ? "rgba(255,255,255,.9)" : COLORS.textTertiary,
            fontWeight: "700",
            fontSize: "11px",
            cursor: "pointer",
            fontFamily: FONT,
            transition: TRANSITIONS.fast,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function BarPreview({ style, accent }) {
  return (
    <div
      style={{
        width: "100%",
        height: "6px",
        background: COLORS.progressTrack,
        borderRadius: RADIUS.progress,
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "40%",
          height: style === "thin" ? "2px" : style === "thick" ? "8px" : "4px",
          background: accent,
          borderRadius: RADIUS.progress,
          transition: "height .15s",
        }}
      />
    </div>
  );
}
