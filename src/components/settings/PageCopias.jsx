import React, { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { TYPOGRAPHY } from "../../utils/theme";
import { api } from "../../utils/api";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";

/**
 * Copias de seguridad COMPLETAS (v1):
 *
 * - Exporta «Me gusta» (localStorage), historial y playlists CON sus
 *   canciones (antes se exportaban solo metadatos: la copia prometía
 *   restaurar y no podía).
 * - Importa de verdad: «Me gusta» a localStorage; historial y playlists al
 *   backend (SQLite) vía POST /history/import y POST /playlists/import, que
 *   hacen FUSIÓN idempotente — reimportar no duplica nada.
 * - Tras importar se refresca la biblioteca: sin «Recarga la app».
 */
export function PageCopias({ neonColor, liked, history, playlists, toast, refreshLibrary }) {
  const { t } = useSettings();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Cada playlist se exporta CON sus canciones (n=peticiones en paralelo
      // al backend local — imperceptible).
      const withSongs = await Promise.all(
        (playlists || []).map(async (pl) => ({
          id: pl.id,
          name: pl.name || "",
          color: pl.color || null,
          cover: pl.cover || null,
          songs: await api.fetchPlaylistSongs(pl.id).catch(() => []),
        })),
      );
      const data = JSON.stringify({
        liked: [...liked],
        history,
        playlists: withSongs,
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
  // de la WebView2 provocaba el cierre de la app al cancelarlo.
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

    let data;
    try {
      const text = await readTextFile(path);
      data = JSON.parse(text);
    } catch {
      toast("Archivo inválido", "error");
      return;
    }

    try {
      //1) Historial → SQLite del backend (fusión: conserva los conteos máximos)
      if (Array.isArray(data.history) && data.history.length > 0) {
        await api.importHistory(data.history);
      }
      // 2) Playlists (+ canciones) → SQLite, fusionando por nombre
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        await api.importPlaylists(data.playlists);
      }
      // 3) «Me gusta» → localStorage (local por diseño, funciona sin backend)
      if (Array.isArray(data.liked)) {
        localStorage.setItem("sw_liked_v2", JSON.stringify(data.liked));
      }
      refreshLibrary?.();
      toast("Datos importados", "success");
    } catch {
      // Todo es reintentable (endpoints idempotentes): avisa y listo.
      toast("No se pudo importar. ¿Está activo el backend?", "error");
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
