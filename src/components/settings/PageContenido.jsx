import React from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsToggle } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";

export function PageContenido({ neonColor }) {
  const { settings, updateSetting, t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.content}>
        <SettingRow
          icon={Ic.globe}
          label={t.lrcLib}
          right={
            <SettingsToggle
              value={settings.lrcLib ?? true}
              onChange={(v) => updateSetting("lrcLib", v)}
              accent={neonColor}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.github}
          label={t.kuGou}
          right={
            <SettingsToggle
              value={settings.kuGou ?? true}
              onChange={(v) => updateSetting("kuGou", v)}
              accent={neonColor}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
