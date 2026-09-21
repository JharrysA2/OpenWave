import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../contexts/useSettings";
import { BTN_SHAPES, BAR_STYLES } from "../../utils/playerStyles";
import {
  SettingRow,
  SettingsSection,
  SettingsToggle,
  SettingsChevron,
  SegBtn,
} from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";
import { BtnShapeModal } from "./BtnShapeModal";
import { BarStyleModal } from "./BarStyleModal";

export function PageApariencia({ neonColor }) {
  const { settings, updateSetting, t } = useSettings();
  const [showBtnModal, setShowBtnModal] = useState(false);
  const [showBarModal, setShowBarModal] = useState(false);
  const accent = neonColor || "#a78bfa";

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title="Tema">
        <SettingRow
          icon={Ic.sun(16)}
          label={t.dynamicTheme}
          desc={t.dynamicThemeDesc}
          right={
            <SettingsToggle
              value={settings.dynamicTheme}
              onChange={(v) => updateSetting("dynamicTheme", v)}
              accent={accent}
            />
          }
        />
        {settings.dynamicTheme && (
          <SettingRow
            icon={Ic.reload}
            label={t.colorTransitionSpeed}
            desc={`${(settings.colorTransitionSpeed ?? 0.5) === 0 ? t.instant : (settings.colorTransitionSpeed ?? 0.5) >= 1.5 ? t.slow : `${(settings.colorTransitionSpeed ?? 0.5).toFixed(1)}s`}`}
            border
          />
        )}
        {settings.dynamicTheme && (
          <div
            style={{
              padding: "4px 18px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <input
              type="range"
              min="0"
              max="2"
              step="0.2"
              value={settings.colorTransitionSpeed ?? 0.5}
              onChange={(e) => updateSetting("colorTransitionSpeed", Number(e.target.value))}
              style={{ width: "100%", accentColor: accent, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
                {t.instant}
              </span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
                {t.slow}
              </span>
            </div>
          </div>
        )}
        <SettingRow
          icon={Svg.circle}
          label={t.pureBlack}
          desc="Elimina todos los tintes de color"
          right={
            <SettingsToggle
              value={settings.pureBlack}
              onChange={(v) => updateSetting("pureBlack", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.rectangle}
          label={t.blurStyle}
          desc={t.blurStyleDesc}
          right={
            <SegBtn
              options={[
                ["blur", t.blur],
                ["solid", t.solid],
                ["none", t.none],
              ]}
              settingKey="blurStyle"
              current={settings.blurStyle}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t.defaultTab}>
        {[
          ["home", "Inicio"],
          ["search", "Búsqueda"],
          ["liked", "Me gustas"],
          ["history", "Historial"],
          ["downloads", "Descargas"],
        ].map(([k, label], i, arr) => (
          <SettingRow
            key={k}
            label={label}
            border={i < arr.length - 1}
            right={
              settings.defaultTab === k ? (
                <span style={{ color: accent, display: "flex" }}>{Ic.check}</span>
              ) : null
            }
            onClick={() => updateSetting("defaultTab", k)}
          />
        ))}
      </SettingsSection>

      <SettingsSection title="Reproductor">
        <SettingRow
          icon={Svg.circle2}
          label="Forma del botón de play"
          desc={
            BTN_SHAPES.find((b) => b.id === (settings.playerBtnShape || "circle"))?.label ||
            "Círculo"
          }
          onClick={() => setShowBtnModal(true)}
          right={<SettingsChevron />}
        />
        <SettingRow
          border={false}
          icon={Svg.line}
          label="Estilo de la barra de progreso"
          desc={
            BAR_STYLES.find((b) => b.id === (settings.playerBarStyle || "line"))?.label || "Línea"
          }
          onClick={() => setShowBarModal(true)}
          right={<SettingsChevron />}
        />
      </SettingsSection>

      <SettingsSection title="Letras">
        <SettingRow
          icon={Svg.clock}
          label={t.lyricsRotateBg}
          desc={t.lyricsRotateBgDesc}
          right={
            <SettingsToggle
              value={settings.lyricsRotateBg || false}
              onChange={(v) => updateSetting("lyricsRotateBg", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          icon={Svg.lines}
          label={t.lyricsTextPos}
          right={
            <SegBtn
              options={[
                ["left", t.alignLeft],
                ["center", t.alignCenter],
              ]}
              settingKey="lyricsTextPos"
              current={settings.lyricsTextPos}
            />
          }
        />
        <SettingRow
          icon={Ic.music}
          label={t.lyricsAnimate}
          desc={t.lyricsAnimateDesc}
          right={
            <SettingsToggle
              value={settings.lyricsAnimate ?? true}
              onChange={(v) => updateSetting("lyricsAnimate", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          icon={Svg.expand}
          label={t.lyricsClickSeek}
          desc={t.lyricsClickSeekDesc}
          right={
            <SettingsToggle
              value={settings.lyricsClickSeek ?? true}
              onChange={(v) => updateSetting("lyricsClickSeek", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          icon={Ic.edit}
          label={t.lyricsFontSize}
          right={
            <SegBtn
              options={[
                ["small", t.small],
                ["medium", t.medium],
                ["large", t.large],
              ]}
              settingKey="lyricsFontSize"
              current={settings.lyricsFontSize || "medium"}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.clock2}
          label={t.lyricsScrollResume}
          desc={`${settings.lyricsScrollResume ?? 3}s`}
        />
        <div
          style={{ padding: "4px 18px 14px", display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={settings.lyricsScrollResume ?? 3}
            onChange={(e) => updateSetting("lyricsScrollResume", Number(e.target.value))}
            style={{ width: "100%", accentColor: accent, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              1s
            </span>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              10s
            </span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="General">
        <SettingRow
          icon={Svg.clock}
          label={t.showProgressTime}
          desc="Muestra 0:00 a los lados de la barra"
          right={
            <SettingsToggle
              value={settings.showProgressTime ?? true}
              onChange={(v) => updateSetting("showProgressTime", v)}
              accent={accent}
            />
          }
        />
      </SettingsSection>

      {showBtnModal &&
        createPortal(
          <BtnShapeModal
            accent={accent}
            settings={settings}
            updateSetting={updateSetting}
            onClose={() => setShowBtnModal(false)}
          />,
          document.body,
        )}
      {showBarModal &&
        createPortal(
          <BarStyleModal
            accent={accent}
            settings={settings}
            updateSetting={updateSetting}
            onClose={() => setShowBarModal(false)}
          />,
          document.body,
        )}
    </div>
  );
}
