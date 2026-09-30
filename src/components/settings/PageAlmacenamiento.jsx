import React, { useState, useMemo, useEffect } from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";
import { ConfirmPanel } from "./ConfirmPanel";
import { api } from "../../utils/api";
import { SW_SETTINGS_KEY } from "../../constants";

const fmtBytes = (bytes) => {
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

export function PageAlmacenamiento({
  downloads,
  onClearDownloads,
  history,
  onClearHistory,
  toast,
}) {
  const { t } = useSettings();
  // confirming: "downloads" | "history" | "cache" | "reset" | null
  const [confirming, setConfirming] = useState(null);
  // stats: null = cargando, undefined = backend sin endpoint, objeto = OK
  const [stats, setStats] = useState(null);
  const historyCount = history?.length || 0;

  const dlSize = useMemo(() => {
    const bytes = downloads.reduce((acc, d) => acc + (d.size || 0), 0);
    return fmtBytes(bytes);
  }, [downloads]);

  // Uso real de localStorage (ajustes, biblioteca, cola, historial…).
  // JS strings = UTF-16 → 2 bytes por unidad de código.
  const localBytes = useMemo(() => {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        const v = localStorage.getItem(k) || "";
        total += (k.length + v.length) * 2;
      }
    } catch {}
    return total;
  }, []);

  const loadStats = () => {
    let alive = true;
    api
      .get("/cache/stats", { _skipCache: true })
      .then((d) => alive && setStats(d))
      .catch(() => alive && setStats(undefined));
    return () => {
      alive = false;
    };
  };
  useEffect(() => loadStats(), []);

  const handleClearCache = async () => {
    try {
      await api.post("/cache/clear", {});
      toast?.(`${t.streamCache}: ✓`, "success");
    } catch {
      toast?.("Error al limpiar la caché", "error");
    }
    loadStats();
  };

  const cacheEntries = stats
    ? `${stats.stream + stats.api + stats.disk} entradas · ${fmtBytes(stats.bytes || 0)}`
    : stats === undefined
      ? "No disponible"
      : "…";

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.storage}>
        <SettingRow
          icon={Svg.database}
          label={t.downloads}
          desc={`${downloads.length} canciones · ${dlSize}`}
          onClick={downloads.length > 0 ? () => setConfirming("downloads") : null}
          right={downloads.length > 0 ? <SettingsChevron /> : null}
        />
        <SettingRow
          icon={Ic.hardDrive}
          label={t.localData}
          desc={`${fmtBytes(localBytes)} · ${t.localDataDesc}`}
        />
        <SettingRow
          border={false}
          icon={Svg.clock}
          label={t.streamCache}
          desc={`${t.streamCacheDesc} — ${cacheEntries}`}
          onClick={stats ? () => setConfirming("cache") : null}
          right={stats ? <SettingsChevron /> : null}
        />
      </SettingsSection>

      <SettingsSection title={t.maintenance}>
        <SettingRow
          icon={Ic.history(16)}
          label={t.clearHistory}
          desc={`${historyCount} escuchas`}
          onClick={historyCount > 0 ? () => setConfirming("history") : null}
          right={historyCount > 0 ? <SettingsChevron /> : null}
        />
        <SettingRow
          border={false}
          icon={Ic.reload}
          label={t.resetSettings}
          desc={t.resetSettingsDesc}
          onClick={() => setConfirming("reset")}
          right={<SettingsChevron />}
        />
      </SettingsSection>

      {confirming === "downloads" && (
        <ConfirmPanel
          message="Eliminar todas las descargas?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            onClearDownloads();
            setConfirming(null);
          }}
        />
      )}
      {confirming === "history" && (
        <ConfirmPanel
          message="Eliminar el historial de escuchas?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            onClearHistory?.();
            toast?.(`${t.clearHistory}: ✓`, "success");
            setConfirming(null);
          }}
        />
      )}
      {confirming === "cache" && (
        <ConfirmPanel
          message="Limpiar la caché del reproductor?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            handleClearCache();
            setConfirming(null);
          }}
        />
      )}
      {confirming === "reset" && (
        <ConfirmPanel
          message="Restablecer todos los ajustes?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            try {
              localStorage.removeItem(SW_SETTINGS_KEY);
            } catch {}
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
