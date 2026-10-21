import React, { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useSettings } from "../../contexts/useSettings";
import { SettingsSection, SettingRow, SegBtn } from "../SettingsComponents";
import { ConfirmPanel } from "./ConfirmPanel";
import { Ic } from "../../icons/Icons";
import { api } from "../../utils/api";

// yt-dlp puede tardar en abrir «Watch Later» (red lenta, 429 puntual). El
// timeout por defecto de la API son 10 s: aquí se sube para no abortar una
// verificación que el backend está haciendo de verdad.
const COOKIES_TIMEOUT = 90_000;

const fmtBytes = (bytes) => {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const fmtFecha = (iso) => {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

function BotonCookies({ children, onClick, disabled = false, primary = false, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 12px",
        borderRadius: "8px",
        border: primary ? "none" : "1px solid rgba(255,255,255,.14)",
        background: primary ? accent || "rgba(255,255,255,.9)" : "rgba(255,255,255,.06)",
        color: primary ? "#0b0b0f" : "rgba(255,255,255,.82)",
        fontWeight: "700",
        fontSize: "12px",
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function PageContenido({ neonColor, toast }) {
  const { settings, t } = useSettings();
  const [estado, setEstado] = useState(null); // null cargando | false error | objeto
  const [contenido, setContenido] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const cargarEstado = useCallback(async () => {
    try {
      const datos = await api.get("/settings/cookies", { _skipCache: true });
      setEstado(datos && typeof datos === "object" ? datos : false);
    } catch {
      setEstado(false);
    }
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  const handleArchivo = async () => {
    try {
      const ruta = await openDialog({
        multiple: false,
        filters: [{ name: "cookies.txt", extensions: ["txt"] }],
      });
      if (!ruta) return;
      const texto = await readTextFile(ruta);
      if (texto.length > 512 * 1024) {
        toast?.(t.cookiesTooLarge, "error");
        return;
      }
      setContenido(texto);
    } catch {
      toast?.(t.cookiesReadError, "error");
    }
  };

  const handleGuardar = async () => {
    if (!contenido.trim() || guardando) return;
    setGuardando(true);
    try {
      const res = await api.put(
        "/settings/cookies",
        { content: contenido },
        { timeout: COOKIES_TIMEOUT },
      );
      if (res?.ok) {
        toast?.(t.cookiesSaved, "success");
        setContenido("");
      } else {
        toast?.(res?.error || t.cookiesVerifyError, "error");
      }
      await cargarEstado();
    } catch {
      toast?.(t.cookiesVerifyError, "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleComprobar = async () => {
    if (comprobando || guardando) return;
    setComprobando(true);
    try {
      const res = await api.post("/settings/cookies/check", {}, { timeout: COOKIES_TIMEOUT });
      toast?.(
        res?.ok ? t.cookiesCheckOk : res?.error || t.cookiesCheckFail,
        res?.ok ? "success" : "error",
      );
      await cargarEstado();
    } catch {
      toast?.(t.cookiesVerifyError, "error");
    } finally {
      setComprobando(false);
    }
  };

  const handleQuitar = async () => {
    setConfirmarQuitar(false);
    try {
      const res = await api.del("/settings/cookies");
      if (res?.ok) {
        toast?.(t.cookiesRemoved, "info");
        await cargarEstado();
      } else {
        toast?.(res?.error || t.cookiesCheckFail, "error");
      }
    } catch {
      toast?.(t.cookiesCheckFail, "error");
    }
  };

  const configurado = Boolean(estado && estado !== true && estado.configurado);
  const verificacion = estado && typeof estado === "object" ? estado.verificacion : null;
  const textoEstado =
    estado === null
      ? t.cookiesCheckingStatus
      : estado === false
        ? t.cookiesStatusUnknown
        : configurado
          ? `${t.cookiesConfigured} · ${fmtBytes(estado.bytes || 0)}`
          : t.cookiesNotConfigured;

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.searchDefaults}>
        <SettingRow
          border={false}
          icon={Ic.search2}
          label={t.defaultSearchTab}
          desc={t.defaultSearchTabDesc}
          right={
            <SegBtn
              options={[
                ["music", t.tabMusic],
                ["videos", t.tabVideos],
              ]}
              settingKey="defaultSearchTab"
              current={settings.defaultSearchTab || "music"}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t.youtubeSession}>
        <div style={{ padding: "14px 18px 16px" }}>
          <div
            style={{
              fontSize: "11.5px",
              color: "rgba(255,255,255,.5)",
              fontWeight: "600",
              lineHeight: 1.5,
            }}
          >
            {t.youtubeSessionDesc}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "12px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                flexShrink: 0,
                background: configurado ? "#4ade80" : "rgba(255,255,255,.28)",
              }}
            />
            <span
              style={{
                fontSize: "12.5px",
                fontWeight: "700",
                color: "rgba(255,255,255,.82)",
              }}
            >
              {textoEstado}
            </span>
            {configurado && verificacion?.ok && (
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,.42)" }}>
                · {t.cookiesVerifiedAt} {fmtFecha(verificacion.validado_en)}
              </span>
            )}
          </div>

          {configurado && verificacion && !verificacion.ok && (
            <div
              style={{
                marginTop: "7px",
                padding: "8px 10px",
                borderRadius: "8px",
                background: "rgba(239,68,68,.12)",
                border: "1px solid rgba(239,68,68,.22)",
                color: "rgba(254,202,202,.95)",
                fontSize: "11px",
                lineHeight: 1.45,
              }}
            >
              <strong>{t.cookiesInvalid}.</strong> {verificacion.error}
            </div>
          )}

          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder={t.cookiesPaste}
            aria-label={t.cookiesPaste}
            spellCheck={false}
            rows={5}
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
              padding: "10px 12px",
              resize: "vertical",
              background: "rgba(0,0,0,.26)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: "8px",
              color: "rgba(255,255,255,.84)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "11px",
              lineHeight: 1.5,
              outline: "none",
            }}
          />

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "10px",
            }}
          >
            <BotonCookies onClick={handleArchivo} disabled={guardando} accent={neonColor}>
              {t.cookiesLoadFile}
            </BotonCookies>
            <BotonCookies
              primary
              onClick={handleGuardar}
              disabled={!contenido.trim() || guardando}
              accent={neonColor}
            >
              {guardando ? t.cookiesSaving : t.cookiesSave}
            </BotonCookies>
            {configurado && (
              <BotonCookies
                onClick={handleComprobar}
                disabled={comprobando || guardando}
                accent={neonColor}
              >
                {comprobando ? t.cookiesCheckingStatus : t.cookiesCheck}
              </BotonCookies>
            )}
            {configurado && (
              <BotonCookies onClick={() => setConfirmarQuitar(true)} disabled={guardando}>
                {t.cookiesRemove}
              </BotonCookies>
            )}
          </div>

          <div
            style={{
              marginTop: "10px",
              fontSize: "10.5px",
              color: "rgba(255,255,255,.34)",
              lineHeight: 1.5,
            }}
          >
            {t.cookiesHelp}
          </div>
        </div>
      </SettingsSection>

      {confirmarQuitar && (
        <ConfirmPanel
          message={t.cookiesRemoveConfirm}
          onCancel={() => setConfirmarQuitar(false)}
          onConfirm={handleQuitar}
        />
      )}
    </div>
  );
}
