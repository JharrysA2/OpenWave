import React, { useEffect, useState } from "react";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SettingsChevron } from "../SettingsComponents";
import { Svg } from "./icons";
import { Ic } from "../../icons/Icons";
import { api } from "../../utils/api";

const REPO_URL = "https://github.com/JharrysA2/OpenWave";

export function PageAcercaDe({ toast }) {
  const { t } = useSettings();
  const [identidad, setIdentidad] = useState(null);
  const [reparando, setReparando] = useState(false);

  useEffect(() => {
    let activo = true;
    api
      .get("/settings/identity", { _skipCache: true })
      .then((datos) => activo && setIdentidad(datos || null))
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

  const handleReparar = async () => {
    if (reparando) return;
    setReparando(true);
    try {
      const res = await api.post("/settings/identity/repair", {});
      if (res?.ok) {
        setIdentidad(res.estado || { soportado: true, registrada: true });
        toast?.(t.identityRepaired, "success");
      } else {
        toast?.(res?.error || t.identityRepairError, "error");
      }
    } catch {
      toast?.(t.identityRepairError, "error");
    } finally {
      setReparando(false);
    }
  };

  const descIdentidad = !identidad
    ? t.windowsIdentityUnknown
    : identidad.registrada === true
      ? `${t.windowsIdentityOk}${identidad.paquete ? ` · ${identidad.paquete}` : ""}`
      : identidad.registrada === false
        ? t.windowsIdentityMissing
        : t.windowsIdentityUnknown;

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.about}>
        <SettingRow icon={Ic.info} label={t.version} desc={__APP_VERSION__} />
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

      {identidad?.soportado && (
        <SettingsSection title={t.windowsIntegration}>
          <SettingRow
            border={false}
            icon={identidad.registrada ? Ic.check : Ic.lock()}
            label={t.windowsIdentity}
            desc={descIdentidad}
            onClick={identidad.registrada === false && !reparando ? handleReparar : undefined}
            right={
              identidad.registrada === false ? (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "rgba(255,255,255,.72)",
                  }}
                >
                  {reparando ? t.identityRepairing : t.repair}
                </span>
              ) : identidad.registrada ? (
                <span style={{ color: "#4ade80", display: "flex" }}>{Ic.check}</span>
              ) : null
            }
          />
        </SettingsSection>
      )}
    </div>
  );
}
