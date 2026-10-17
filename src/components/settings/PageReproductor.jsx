import React, { useState, useEffect } from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SegBtn, Slider, SettingsToggle } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";

const SLEEP_PRESETS = [15, 30, 45, 60];
const QUALITY_OPTS = [
  ["128", "128k"],
  ["192", "192k"],
  ["320", "320k"],
];

export function PageReproductor({
  neonColor,
  crossfadeDuration,
  setCrossfadeDuration,
  sleep,
  setSleep,
}) {
  const { t, settings, updateSetting } = useSettings();
  const accent = neonColor || "#a78bfa";
  const [localCf, setLocalCf] = useState(crossfadeDuration);

  // ── Temporizador de apagado ──────────────────────────────────────────────
  // `sleep` vive en App ({ at, minutes }) → sigue corriendo aunque esta
  // página se desmonte. Aquí solo se refresca el contador cada segundo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sleep) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleep]);

  const remainingMs = sleep ? Math.max(0, sleep.at - now) : 0;
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${mm}:${String(ss).padStart(2, "0")}`;
  const activePreset = sleep ? sleep.minutes : 0;

  const setSleepPreset = (minutes) => {
    if (!minutes) {
      setSleep(null);
      return;
    }
    setSleep({ at: Date.now() + minutes * 60000, minutes });
  };

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.playerSound}>
        <SettingRow
          icon={Svg.wave}
          label={t.crossfade}
          desc={`${t.crossfadeDesc} — ${localCf === 0 ? t.off : `${localCf}${t.seconds}`}`}
          border={false}
        />
        <div
          style={{ padding: "4px 18px 16px", display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <Slider
            min={0}
            max={12}
            value={localCf}
            onChange={setLocalCf}
            onCommit={setCrossfadeDuration}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              {t.off}
            </span>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              12{t.seconds}
            </span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t.sleepTimer}>
        <SettingRow
          icon={Svg.clock}
          label={t.sleepTimer}
          desc={sleep ? `${t.sleepPausesIn} ${countdown}` : t.sleepTimerDesc}
          border={false}
          right={
            <SegBtn
              options={[
                // "OFF" (no t.off) para no colisionar con el "Off" del
                // crossfade en tests de texto exacto.
                [0, "OFF"],
                ...SLEEP_PRESETS.map((m) => [m, `${m}m`]),
              ]}
              current={activePreset}
              onChange={setSleepPreset}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t.audioQuality}>
        <SettingRow
          icon={Ic.radio}
          label={t.playbackQuality}
          desc={t.playbackQualityDesc}
          right={
            <SegBtn
              options={[
                ["low", t.qualityLow],
                ["standard", t.qualityStandard],
                ["high", t.qualityHigh],
              ]}
              settingKey="playbackQuality"
              current={settings.playbackQuality || "standard"}
            />
          }
        />
        <SettingRow
          icon={Ic.download(16)}
          label={t.downloadQuality}
          desc={t.downloadQualityDesc}
          border={false}
          right={
            <SegBtn
              options={QUALITY_OPTS}
              settingKey="downloadQuality"
              current={settings.downloadQuality || "192"}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t.queueSection}>
        <SettingRow
          icon={Ic.music}
          label={t.queueRecommendations}
          desc={t.queueRecommendationsDesc}
          border={false}
          right={
            <SettingsToggle
              value={settings.queueRecommendations ?? false}
              onChange={(v) => updateSetting("queueRecommendations", v)}
              accent={accent}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
