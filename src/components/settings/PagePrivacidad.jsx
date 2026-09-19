import { useState } from "react";
import { useSettings } from "../../contexts/useSettings";
import {
  SettingsSection,
  SettingRow,
  SettingsToggle,
  SettingsChevron,
} from "../SettingsComponents";
import { Ic } from "../../icons/Icons";
import { ConfirmPanel } from "./ConfirmPanel";

export function PagePrivacidad({ neonColor, onClearHistory, toast }) {
  const { settings, updateSetting, t } = useSettings();
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.privacy}>
        <SettingRow
          icon={Ic.reload}
          label={t.pauseHistory}
          right={
            <SettingsToggle
              value={settings.pauseHistory}
              onChange={(v) => updateSetting("pauseHistory", v)}
              accent={neonColor}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Ic.trash}
          label={t.clearHistory}
          onClick={() => setConfirming(true)}
          right={<SettingsChevron />}
        />
      </SettingsSection>
      {confirming && (
        <ConfirmPanel
          message={`${t.clearHistory}?`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            onClearHistory();
            setConfirming(false);
            toast("Historial eliminado", "info");
          }}
        />
      )}
    </div>
  );
}
