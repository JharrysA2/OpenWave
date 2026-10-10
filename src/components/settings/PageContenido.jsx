import React from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SegBtn } from "../SettingsComponents";
import { Ic } from "../../icons/Icons";

export function PageContenido() {
  const { settings, t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.searchDefaults}>
        <SettingRow
          border={false}
          icon={Ic.search2}
          label={t.defaultSearchTab}
          desc={t.defaultSearchTabDesc}
          right={
            <SegBtn
              options={[
                ["music", t.tabMusic],
                ["videos", t.tabVideos],
              ]}
              settingKey="defaultSearchTab"
              current={settings.defaultSearchTab || "music"}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
