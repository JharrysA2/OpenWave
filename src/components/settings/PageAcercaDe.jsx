import React from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";

export function PageAcercaDe() {
  const { t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.about}>
        <SettingRow icon={Ic.info} label={t.version} desc="1.0.0" border={false} />
      </SettingsSection>
      <SettingsSection title={t.developer}>
        <SettingRow
          icon={Svg.code}
          label={t.sourceCode}
          onClick={() => window.open("https://github.com", "_blank")}
          right={<SettingsChevron />}
        />
      </SettingsSection>
    </div>
  );
}
