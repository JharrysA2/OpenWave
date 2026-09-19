import React from "react";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, withAlpha } from "../../utils/theme";
import { useSettings } from "../../contexts/useSettings";

export function ConfirmPanel({ message, onCancel, onConfirm }) {
  const { t } = useSettings();
  return (
    <div
      style={{
        background: withAlpha(COLORS.errorColor, "14"),
        border: `1px solid ${withAlpha(COLORS.errorColor, "33")}`,
        borderRadius: RADIUS.card,
        padding: "16px 18px",
        marginTop: "-8px",
      }}
    >
      <div
        style={{
          ...TYPOGRAPHY.body,
          color: COLORS.settingsIcon,
          marginBottom: SPACING.gap.wide,
        }}
      >
        {message}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "8px",
            borderRadius: RADIUS.cover,
            border: "1px solid rgba(255,255,255,.12)",
            background: "transparent",
            color: COLORS.textSecondary,
            cursor: "pointer",
            fontWeight: "700",
            fontFamily: "inherit",
          }}
        >
          {t.cancel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: "8px",
            borderRadius: RADIUS.cover,
            border: "none",
            background: withAlpha(COLORS.errorColor, "cc"),
            color: COLORS.white,
            cursor: "pointer",
            fontWeight: "700",
            fontFamily: "inherit",
          }}
        >
          {t.clear}
        </button>
      </div>
    </div>
  );
}
