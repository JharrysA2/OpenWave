import React from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";

const REPO_URL = "https://github.com/JharrysA2/OpenWave";

export function PageAcercaDe() {
  const { t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.about}>
        <SettingRow icon={Ic.info} label={t.version} desc="1.0.0" />
        <SettingRow icon={Svg.code} label={t.developer} desc="JharrysA2" border={false} />
      </SettingsSection>
      <SettingsSection title={t.sourceCode}>
        <SettingRow
          icon={Svg.github}
          label="GitHub"
          desc="github.com/JharrysA2/OpenWave"
          onClick={() => window.open(REPO_URL, "_blank")}
          right={<SettingsChevron />}
          border={false}
        />
      </SettingsSection>
    </div>
  );
}
