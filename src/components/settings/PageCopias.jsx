import React, { useState } from "react";
import { TYPOGRAPHY } from "../../utils/theme";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";

export function PageCopias({ neonColor, liked, history, playlists, toast }) {
  const { t } = useSettings();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = JSON.stringify({
        liked: [...liked],
        history,
        playlists,
        exportedAt: new Date().toISOString(),
      });
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soundwave-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Datos exportados", "success");
    } catch {
      toast("Error al exportar", "error");
    }
    setExporting(false);
  };

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.backup}>
        <SettingRow
          icon={Ic.download(18)}
          label={t.exportData}
          onClick={handleExport}
          right={
            exporting ? (
              <span style={{ ...TYPOGRAPHY.small, color: neonColor }}>Exportando...</span>
            ) : (
              <SettingsChevron />
            )
          }
        />
        <SettingRow
          border={false}
          icon={Svg.upload}
          label={t.importData}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.liked) {
                  localStorage.setItem("sw_liked_v2", JSON.stringify(data.liked));
                }
                if (data.history) {
                  localStorage.setItem("sw_history_v2", JSON.stringify(data.history));
                }
                if (data.playlists) {
                  localStorage.setItem("sw_playlists_v2", JSON.stringify(data.playlists));
                }
                toast("Datos importados. Recarga la app.", "success");
              } catch {
                toast("Archivo inválido", "error");
              }
            };
            input.click();
          }}
          right={<SettingsChevron />}
        />
      </SettingsSection>
    </div>
  );
}
