import React from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, TRANSITIONS, GLASS, withAlpha } from "../utils/theme";

export function Toasts({ toasts }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "90px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "10px 16px",
            borderRadius: RADIUS.card,
            fontSize: "13.5px",
            fontWeight: "700",
            fontFamily: FONT,
            ...GLASS.popup,
            background:
              t.type === "error"
                ? "rgba(69,10,10,.88)"
                : t.type === "success"
                  ? "rgba(5,46,22,.88)"
                  : GLASS.popup.background,
            color:
              t.type === "error"
                ? "#fca5a5"
                : t.type === "success"
                  ? "#86efac"
                  : COLORS.textPlayerTitle,
            border: `1px solid ${
              t.type === "error"
                ? withAlpha(COLORS.errorColor, "4d")
                : t.type === "success"
                  ? withAlpha(COLORS.successColor, "4d")
                  : GLASS.popup.borderColor
            }`,
            animation: `toastIn .18s ${TRANSITIONS.spring}`,
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
