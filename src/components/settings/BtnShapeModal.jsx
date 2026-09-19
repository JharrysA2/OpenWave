import React from "react";
import { FONT } from "../../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, TYPOGRAPHY, GLASS } from "../../utils/theme";
import { BTN_SHAPES, getBtnShapeStyle } from "../../utils/playerStyles";

export function BtnShapeModal({ accent, settings, updateSetting, onClose }) {
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
          width: "min(500px,calc(100vw-48px))",
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
          Forma del botón
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: SPACING.gap.wide }}
        >
          {BTN_SHAPES.map((shape) => {
            const isSel = (settings.playerBtnShape || "circle") === shape.id;
            return (
              <div
                key={shape.id}
                onClick={() => {
                  updateSetting("playerBtnShape", shape.id);
                  onClose();
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  padding: "16px 8px",
                  borderRadius: RADIUS.card,
                  cursor: "pointer",
                  background: isSel ? `${accent}22` : COLORS.surfaceCard,
                  border: `1.5px solid ${isSel ? accent : "rgba(255,255,255,.07)"}`,
                  transition: TRANSITIONS.normal,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = COLORS.surfaceCardHover;
                    e.currentTarget.style.borderColor = `${accent}55`;
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
                    width: "44px",
                    height: "44px",
                    background: isSel ? accent : "rgba(255,255,255,.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background .15s",
                    ...getBtnShapeStyle(shape.id),
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isSel ? "#000" : "rgba(255,255,255,.8)"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <span
                  style={{
                    ...TYPOGRAPHY.small,
                    color: isSel ? accent : COLORS.iconActive,
                    textAlign: "center",
                  }}
                >
                  {shape.label}
                </span>
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: SPACING.gap.xxwide,
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
