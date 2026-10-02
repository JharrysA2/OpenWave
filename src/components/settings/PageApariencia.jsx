import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../contexts/useSettings";
import { BTN_SHAPES, BAR_STYLES } from "../../utils/playerStyles";
import { deriveTheme } from "../../utils/colorTheme";
import {
  SettingRow,
  SettingsSection,
  SettingsToggle,
  SettingsChevron,
  SegBtn,
  Slider,
} from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";
import { BtnShapeModal } from "./BtnShapeModal";
import { BarStyleModal } from "./BarStyleModal";
import { AppColorModal } from "./AppColorModal";

export function PageApariencia({ neonColor }) {
  const { settings, updateSetting, t } = useSettings();
  const [showBtnModal, setShowBtnModal] = useState(false);
  const [showBarModal, setShowBarModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const accent = neonColor || "#a78bfa";
  const appColor = settings.appColor || "#a78bfa";

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title="Tema">
        <SettingRow
          icon={Ic.paintBrush}
          label={t.appColor}
          desc={t.appColorDesc}
          onClick={() => setShowColorModal(true)}
          right={
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Vista previa: el color APLICADO (acento derivado) */}
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: deriveTheme(appColor).accent,
                  boxShadow: "0 0 0 1.5px rgba(255,255,255,.25)",
                }}
              />
              <SettingsChevron />
            </span>
          }
        />
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
            desc={`${t.colorTransitionSpeedDesc} (${
              (settings.colorTransitionSpeed ?? 0.5) === 0
                ? t.instant
                : (settings.colorTransitionSpeed ?? 0.5) >= 1.5
                  ? t.slow
                  : `${(settings.colorTransitionSpeed ?? 0.5).toFixed(1)}s`
            })`}
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
            <Slider
              min={0}
              max={2}
              step={0.2}
              value={settings.colorTransitionSpeed ?? 0.5}
              onChange={(v) => updateSetting("colorTransitionSpeed", v)}
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
          desc={t.pureBlackDesc}
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
        <div
          style={{
            fontSize: "11.5px",
            color: "rgba(255,255,255,.45)",
            fontWeight: "600",
            padding: "12px 18px 6px",
          }}
        >
          {t.defaultTabDesc}
        </div>
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
          icon={Svg.line}
          label="Estilo de la barra de progreso"
          desc={
            BAR_STYLES.find((b) => b.id === (settings.playerBarStyle || "line"))?.label || "Línea"
          }
          onClick={() => setShowBarModal(true)}
          right={<SettingsChevron />}
        />
        <SettingRow
          icon={Ic.play(16)}
          label={t.playerBtnStyle}
          right={
            <SegBtn
              options={[
                ["color", t.playerBtnColor],
                ["white", t.playerBtnWhite],
              ]}
              settingKey="playerBtnTone"
              current={settings.playerBtnTone || "color"}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.lines}
          label={t.playerTextAlign}
          right={
            <SegBtn
              options={[
                ["left", t.alignLeft],
                ["center", t.alignCenter],
              ]}
              settingKey="playerTextAlign"
              current={settings.playerTextAlign || "left"}
            />
          }
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
          desc={`${t.lyricsScrollResumeDesc} (${settings.lyricsScrollResume ?? 3}s)`}
        />
        <div
          style={{ padding: "4px 18px 14px", display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <Slider
            min={1}
            max={10}
            value={settings.lyricsScrollResume ?? 3}
            onChange={(v) => updateSetting("lyricsScrollResume", v)}
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
          desc={t.showProgressTimeDesc}
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
      {showColorModal &&
        createPortal(
          <AppColorModal
            accent={accent}
            settings={settings}
            updateSetting={updateSetting}
            onClose={() => setShowColorModal(false)}
            title={t.appColor}
            customLabel={t.appColorCustom}
          />,
          document.body,
        )}
    </div>
  );
}
