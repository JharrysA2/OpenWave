import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { COLORS, RADIUS, TRANSITIONS, GLASS } from "../utils/theme";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000010,
        background: "rgba(0,0,0,.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "sw-fade-in .15s ease both",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          borderRadius: RADIUS.card,
          width: "380px",
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
          animation: "sw-fade-slide-up .2s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <span
            style={{
              fontSize: "16px",
              fontWeight: "800",
              color: COLORS.textPrimary,
              letterSpacing: "-.3px",
            }}
          >
            {title}
          </span>
          <button
            onClick={onCancel}
            style={{
              ...GLASS.btn,
              borderRadius: RADIUS.full,
              width: "32px",
              height: "32px",
              cursor: "pointer",
              color: COLORS.winCtrlDefault,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: TRANSITIONS.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.surfaceCardHover;
              e.currentTarget.style.color = COLORS.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.surfaceNav;
              e.currentTarget.style.color = COLORS.winCtrlDefault;
            }}
          >
            {Ic.close}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: danger ? "rgba(239,68,68,.15)" : "rgba(255,255,255,.06)",
                color: danger ? "#ef4444" : COLORS.textSecondary,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            {/* Message */}
            <div>
              <p
                style={{
                  fontSize: "13.5px",
                  fontWeight: "600",
                  color: COLORS.textPrimary,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "12px 20px 16px",
            borderTop: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              ...GLASS.btn,
              borderRadius: "10px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: "700",
              color: "rgba(255,255,255,.6)",
              cursor: "pointer",
              transition: TRANSITIONS.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,.08)";
              e.currentTarget.style.color = "rgba(255,255,255,.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
              e.currentTarget.style.color = "rgba(255,255,255,.6)";
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: danger ? "#ef4444" : "var(--neon)",
              border: "none",
              borderRadius: "10px",
              padding: "8px 20px",
              fontSize: "13px",
              fontWeight: "700",
              // Peligro (rojo fijo) → blanco; acento dinámico → fg derivado
              color: danger ? "#fff" : "var(--neon-fg)",
              cursor: "pointer",
              transition: TRANSITIONS.fast,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.85";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            {Ic.trash}
            {confirmLabel || "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
