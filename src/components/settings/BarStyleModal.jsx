import React from "react";
import { FONT } from "../../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, TYPOGRAPHY, GLASS } from "../../utils/theme";
import { BAR_STYLES } from "../../utils/playerStyles";
import { BarPreview } from "../SettingsComponents";

export function BarStyleModal({ accent, settings, updateSetting, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "rgba(5,5,10,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn .15s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          border: `1px solid ${accent}33`,
          borderRadius: RADIUS.pill,
          padding: "24px",
          width: "min(520px,calc(100vw-48px))",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: COLORS.textPrimary,
            marginBottom: SPACING.gap.xxwide,
            letterSpacing: "-.3px",
          }}
        >
          Estilo de la barra
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {BAR_STYLES.map((s) => {
            const isSel = (settings.playerBarStyle || "line") === s.id;
            return (
              <div
                key={s.id}
                onClick={() => {
                  updateSetting("playerBarStyle", s.id);
                  onClose();
                }}
                style={{
                  padding: "14px 16px",
                  borderRadius: RADIUS.default,
                  cursor: "pointer",
                  background: isSel ? `${accent}18` : COLORS.surfaceCard,
                  border: `1.5px solid ${isSel ? accent : "rgba(255,255,255,.07)"}`,
                  transition: TRANSITIONS.normal,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = "rgba(255,255,255,.07)";
                    e.currentTarget.style.borderColor = `${accent}44`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = COLORS.surfaceCard;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.07)";
                  }
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: SPACING.gap.normal,
                  }}
                >
                  <span
                    style={{
                      ...TYPOGRAPHY.h4,
                      color: isSel ? accent : "rgba(255,255,255,.85)",
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ ...TYPOGRAPHY.small, color: "rgba(255,255,255,.3)" }}>
                    {s.desc}
                  </span>
                </div>
                <BarPreview style={s.id} accent={accent} />
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: SPACING.gap.xwide,
            width: "100%",
            padding: "10px",
            borderRadius: RADIUS.default,
            border: `1px solid ${COLORS.borderLight}`,
            background: "transparent",
            color: COLORS.iconActive,
            fontWeight: "700",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
