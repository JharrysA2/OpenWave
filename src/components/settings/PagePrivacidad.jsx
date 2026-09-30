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
import { clearAllLyricsOverrides } from "../../utils/lyricsOverrides";

export function PagePrivacidad({ neonColor, onClearHistory, toast }) {
  const { settings, updateSetting, t } = useSettings();
  // null | "history" | "lyrics" — qué acción espera confirmación
  const [confirming, setConfirming] = useState(null);
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
          icon={Ic.edit}
          label={t.resetCustomLyrics}
          desc={t.resetCustomLyricsDesc}
          onClick={() => setConfirming("lyrics")}
          right={<SettingsChevron />}
        />
        <SettingRow
          border={false}
          icon={Ic.trash}
          label={t.clearHistory}
          onClick={() => setConfirming("history")}
          right={<SettingsChevron />}
        />
      </SettingsSection>
      {confirming === "history" && (
        <ConfirmPanel
          message={`${t.clearHistory}?`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            onClearHistory();
            setConfirming(null);
            toast("Historial eliminado", "info");
          }}
        />
      )}
      {confirming === "lyrics" && (
        <ConfirmPanel
          message={`${t.resetCustomLyrics}?`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const n = clearAllLyricsOverrides();
            setConfirming(null);
            toast?.(n > 0 ? t.resetCustomLyricsDone : t.noCustomLyrics, "info");
          }}
        />
      )}
    </div>
  );
}
