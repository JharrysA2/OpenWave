import React from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SegBtn } from "../SettingsComponents";
import { Ic } from "../../icons/Icons";

export function PageTraduccion() {
  const { settings, t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.translation}>
        <SettingRow
          icon={Ic.globe}
          label={t.language}
          desc={t.languageDesc}
          right={
            <SegBtn
              options={[
                ["es", "Español"],
                ["en", "English"],
              ]}
              settingKey="language"
              current={settings.language}
            />
          }
          border={false}
        />
      </SettingsSection>
    </div>
  );
}
