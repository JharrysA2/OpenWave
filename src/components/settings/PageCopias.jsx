import React, { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
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
      a.download = `openwave-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Datos exportados", "success");
    } catch {
      toast("Error al exportar", "error");
    }
    setExporting(false);
  };

  // Selector nativo (plugin-dialog) en vez de <input type="file">: el diálogo
  // WebView2 provocaba el cierre de la app al cancelarlo.
  const handleImport = async () => {
    let path;
    try {
      path = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
    } catch {
      toast("No se pudo abrir el selector", "error");
      return;
    }
    if (!path) return; // cancelado: no pasa nada
    try {
      const text = await readTextFile(path);
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
          onClick={handleImport}
          right={<SettingsChevron />}
        />
      </SettingsSection>
    </div>
  );
}
