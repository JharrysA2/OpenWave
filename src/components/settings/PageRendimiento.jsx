import React from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../contexts/useSettings";
import { isSoftwareRenderer } from "../../utils/softwareRenderer";
import { SettingRow, SettingsSection, SettingsToggle } from "../SettingsComponents";

export function PageRendimiento({ neonColor }) {
  const { settings, updateSetting, t } = useSettings();
  const accent = neonColor || "#a78bfa";
  const mode = settings.perfMode || "auto";
  // Modo efectivo para mostrar el resumen: "auto" resuelve según la GPU.
  const effective =
    mode === "auto" ? (isSoftwareRenderer() ? "performance" : "balanced") : mode;

  const toggleRow = (label, desc, key) => (
    <SettingRow
      icon={
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: settings[key] !== false ? accent : "rgba(255,255,255,.2)",
            boxShadow: settings[key] !== false ? `0 0 8px ${accent}` : "none",
          }}
        />
      }
      label={label}
      desc={desc}
      right={
        <SettingsToggle
          value={settings[key] !== false}
          onChange={(v) => updateSetting(key, v)}
          accent={accent}
        />
      }
    />
  );

  return (
    <div style={{ padding: "20px 16px" }}>
      <div
        style={{
          fontSize: "11.5px",
          color: "rgba(255,255,255,.5)",
          fontWeight: "600",
          margin: "-4px 0 16px",
          padding: "0 2px",
        }}
      >
        {t.perfHiddenNote}
      </div>

      <SettingsSection title={t.perfMode}>
        {[
          ["auto", t.perfModeAuto, t.perfModeAutoDesc],
          ["balanced", t.perfModeBalanced, t.perfModeBalancedDesc],
          ["performance", t.perfModePerformance, t.perfModePerformanceDesc],
          ["custom", t.perfModeCustom, t.perfModeCustomDesc],
        ].map(([value, label, desc], i, arr) => (
          <SettingRow
            key={value}
            label={label}
            desc={desc}
            border={i < arr.length - 1}
            right={
              mode === value ? (
                <span style={{ color: accent, display: "flex" }}>
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
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              ) : null
            }
            onClick={() => updateSetting("perfMode", value)}
          />
        ))}
      </SettingsSection>

      {mode === "custom" && (
        <SettingsSection title={t.performanceDesc}>
          {toggleRow(t.perfBlur, t.perfBlurDesc, "perfBlur")}
          {toggleRow(t.perfAnim, t.perfAnimDesc, "perfAnim")}
          {toggleRow(t.perfShadow, t.perfShadowDesc, "perfShadow")}
          {toggleRow(t.perfSolid, t.perfSolidDesc, "perfSolid")}
        </SettingsSection>
      )}

      {mode !== "custom" && (
        <SettingsSection title={t.performanceDesc}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "13px 18px",
            }}
          >
            <span
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "12px",
                flexShrink: 0,
                background: "rgba(255,255,255,.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: accent,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </span>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,.5)", fontWeight: "600" }}>
              {effective === "performance"
                ? t.perfModePerformanceDesc
                : t.perfModeBalancedDesc}
            </div>
          </div>
        </SettingsSection>
      )}
    </div>
  );
}
