import React, { useState, useMemo } from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";
import { ConfirmPanel } from "./ConfirmPanel";

export function PageAlmacenamiento({ downloads, onClearDownloads }) {
  const { t } = useSettings();
  const [confirming, setConfirming] = useState(false);
  const dlSize = useMemo(() => {
    const bytes = downloads.reduce((acc, d) => acc + (d.size || 0), 0);
    if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return "0 B";
  }, [downloads]);

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.storage}>
        <SettingRow
          icon={Svg.database}
          label={t.downloads}
          desc={`${downloads.length} canciones · ${dlSize}`}
          onClick={downloads.length > 0 ? () => setConfirming(true) : null}
          right={downloads.length > 0 ? <SettingsChevron /> : null}
        />
        <SettingRow
          border={false}
          icon={Ic.img}
          label={t.imageCache}
          desc="Portadas de álbumes descargadas"
        />
      </SettingsSection>
      {confirming && (
        <ConfirmPanel
          message="Eliminar todas las descargas?"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            onClearDownloads();
            setConfirming(false);
          }}
        />
      )}
    </div>
  );
}
