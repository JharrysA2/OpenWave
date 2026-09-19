import React, { useState } from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow } from "../SettingsComponents";
import { Svg } from "./icons";

export function PageReproductor({ neonColor, crossfadeDuration, setCrossfadeDuration }) {
  const { t } = useSettings();
  const [localCf, setLocalCf] = useState(crossfadeDuration);
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
          <input
            type="range"
            min="0"
            max="12"
            step="1"
            value={localCf}
            onChange={(e) => setLocalCf(Number(e.target.value))}
            onMouseUp={(e) => setCrossfadeDuration(Number(e.target.value))}
            onTouchEnd={(e) => setCrossfadeDuration(Number(e.target.value))}
            style={{ width: "100%", accentColor: neonColor || "#a78bfa", cursor: "pointer" }}
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
    </div>
  );
}
