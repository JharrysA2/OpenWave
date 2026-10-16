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
  // confirming: "downloads" | "history" | "cache" | "videos" | "video:<id>" | "reset" | null
  const [confirming, setConfirming] = useState(null);
  // stats: null = cargando, undefined = backend sin endpoint, objeto = OK
  const [stats, setStats] = useState(null);
  // Vídeos de fondo en caché: null = cargando, [] = vacío o sin endpoint
  const [videos, setVideos] = useState(null);
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

  const loadVideos = () => {
    let alive = true;
    api
      .get("/videos", { _skipCache: true })
      .then((d) => alive && setVideos(Array.isArray(d?.videos) ? d.videos : []))
      .catch(() => alive && setVideos([]));
    return () => {
      alive = false;
    };
  };
  useEffect(() => loadVideos(), []);

  const handleClearCache = async () => {
    try {
      await api.post("/cache/clear", {});
      toast?.(`${t.streamCache}: ✓`, "success");
    } catch {
      toast?.("Error al limpiar la caché", "error");
    }
    loadStats();
  };

  const videosSize = useMemo(
    () => fmtBytes((videos || []).reduce((acc, v) => acc + (v.size || 0), 0)),
    [videos],
  );

  const handleClearVideos = async () => {
    try {
      await api.del("/videos");
      toast?.(`${t.bgVideosClear}: ✓`, "success");
    } catch {
      toast?.("Error al borrar los vídeos de fondo", "error");
    }
    loadVideos();
  };

  const handleDeleteVideo = async (videoId) => {
    try {
      await api.del(`/video/${videoId}`);
      toast?.(`${t.clear}: ✓`, "success");
    } catch {
      toast?.("Error al borrar el vídeo", "error");
    }
    loadVideos();
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

      {/* ── Vídeos de fondo de la pantalla de letras: se listan con su
          tamaño y se pueden borrar uno a uno o todos de golpe ── */}
      <SettingsSection title={t.bgVideos}>
        <SettingRow
          border={!!(videos && videos.length > 0)}
          icon={Ic.trash}
          label={t.bgVideosClear}
          desc={videos ? `${videos.length} ${t.bgVideosUnit} · ${videosSize}` : "…"}
          onClick={videos && videos.length > 0 ? () => setConfirming("videos") : null}
          right={videos && videos.length > 0 ? <SettingsChevron /> : null}
        />
        {videos !== null && videos.length === 0 && (
          <SettingRow border={false} icon={Ic.play(16)} label={t.bgVideosEmpty} />
        )}
        {videos && videos.length > 0 && (
          <div style={{ maxHeight: "320px", overflowY: "auto" }}>
            {videos.map((v, i) => (
              <SettingRow
                key={v.videoId}
                border={i < videos.length - 1}
                icon={Ic.play(16)}
                label={v.title || v.videoId}
                desc={[v.artist, fmtBytes(v.size), v.quality ? `${v.quality}p` : null]
                  .filter(Boolean)
                  .join(" · ")}
                right={
                  <button
                    type="button"
                    aria-label={`${t.clear}: ${v.title || v.videoId}`}
                    onClick={() => setConfirming(`video:${v.videoId}`)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,.24)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,.14)";
                    }}
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "9px",
                      border: "none",
                      cursor: "pointer",
                      background: "rgba(239,68,68,.14)",
                      color: "rgba(255,130,130,.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background .15s",
                      flexShrink: 0,
                    }}
                  >
                    {Ic.trash}
                  </button>
                }
              />
            ))}
          </div>
        )}
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
      {confirming === "videos" && (
        <ConfirmPanel
          message="Eliminar todos los vídeos de fondo?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            handleClearVideos();
            setConfirming(null);
          }}
        />
      )}
      {confirming?.startsWith("video:") && (
        <ConfirmPanel
          message="Eliminar el vídeo de esta canción?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            handleDeleteVideo(confirming.slice("video:".length));
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
