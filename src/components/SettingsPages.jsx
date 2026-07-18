import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { FONT } from "../constants";
import { COLORS, RADIUS, SPACING, TRANSITIONS, TYPOGRAPHY, GLASS, withAlpha } from "../utils/theme";
import { useSettings } from "../contexts/useSettings";
import { BTN_SHAPES, BAR_STYLES, getBtnShapeStyle } from "../utils/playerStyles";
import {
  SettingRow,
  SettingsSection,
  SettingsToggle,
  SettingsChevron,
  SegBtn,
  BarPreview,
} from "./SettingsComponents";

// ── Page: Apariencia ───────────────────────────────────────────────────────

export function PageApariencia({ neonColor }) {
  const { settings, updateSetting, t } = useSettings();
  const [localRadius, setLocalRadius] = useState(settings.cornerRadius ?? 12);
  const [showBtnModal, setShowBtnModal] = useState(false);
  const [showBarModal, setShowBarModal] = useState(false);
  const accent = neonColor || "#a78bfa";

  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title="Tema">
        <SettingRow
          icon={Svg.sun}
          label={t.dynamicTheme}
          desc={t.dynamicThemeDesc}
          right={
            <SettingsToggle
              value={settings.dynamicTheme}
              onChange={(v) => updateSetting("dynamicTheme", v)}
              accent={accent}
            />
          }
        />
        {settings.dynamicTheme && (
          <SettingRow
            icon={Svg.refresh}
            label={t.colorTransitionSpeed}
            desc={`${(settings.colorTransitionSpeed ?? 0.5) === 0 ? t.instant : (settings.colorTransitionSpeed ?? 0.5) >= 1.5 ? t.slow : `${(settings.colorTransitionSpeed ?? 0.5).toFixed(1)}s`}`}
            border
          />
        )}
        {settings.dynamicTheme && (
          <div
            style={{
              padding: "4px 18px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <input
              type="range"
              min="0"
              max="2"
              step="0.2"
              value={settings.colorTransitionSpeed ?? 0.5}
              onChange={(e) => updateSetting("colorTransitionSpeed", Number(e.target.value))}
              style={{ width: "100%", accentColor: accent, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
                {t.instant}
              </span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
                {t.slow}
              </span>
            </div>
          </div>
        )}
        <SettingRow
          icon={Svg.circle}
          label={t.pureBlack}
          desc="Elimina todos los tintes de color"
          right={
            <SettingsToggle
              value={settings.pureBlack}
              onChange={(v) => updateSetting("pureBlack", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.rectangle}
          label={t.blurStyle}
          desc={t.blurStyleDesc}
          right={
            <SegBtn
              options={[
                ["blur", t.blur],
                ["solid", t.solid],
                ["none", t.none],
              ]}
              settingKey="blurStyle"
              current={settings.blurStyle}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t.defaultTab}>
        {[
          ["home", "Inicio"],
          ["search", "Búsqueda"],
          ["liked", "Me gustas"],
          ["history", "Historial"],
          ["downloads", "Descargas"],
        ].map(([k, label], i, arr) => (
          <SettingRow
            key={k}
            label={label}
            border={i < arr.length - 1}
            right={settings.defaultTab === k ? Svg.check({ stroke: accent }) : null}
            onClick={() => updateSetting("defaultTab", k)}
          />
        ))}
      </SettingsSection>

      <SettingsSection title="Reproductor">
        <SettingRow
          icon={Svg.maximize}
          label={t.cornerRadius}
          desc={`${localRadius}px`}
          border={false}
        />
        <div
          style={{ padding: "4px 18px 14px", display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <input
            type="range"
            min="0"
            max="24"
            step="2"
            value={localRadius}
            onChange={(e) => setLocalRadius(Number(e.target.value))}
            onMouseUp={(e) => updateSetting("cornerRadius", Number(e.target.value))}
            onTouchEnd={(e) => updateSetting("cornerRadius", Number(e.target.value))}
            style={{ width: "100%", accentColor: accent, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              Cuadrado
            </span>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              Redondo
            </span>
          </div>
        </div>
        <SettingRow
          icon={Svg.circle2}
          label="Forma del botón de play"
          desc={
            BTN_SHAPES.find((b) => b.id === (settings.playerBtnShape || "circle"))?.label ||
            "Círculo"
          }
          onClick={() => setShowBtnModal(true)}
          right={<SettingsChevron />}
        />
        <SettingRow
          border={false}
          icon={Svg.line}
          label="Estilo de la barra de progreso"
          desc={
            BAR_STYLES.find((b) => b.id === (settings.playerBarStyle || "line"))?.label || "Línea"
          }
          onClick={() => setShowBarModal(true)}
          right={<SettingsChevron />}
        />
      </SettingsSection>

      <SettingsSection title="Letras">
        <SettingRow
          icon={Svg.clock}
          label={t.lyricsRotateBg}
          desc={t.lyricsRotateBgDesc}
          right={
            <SettingsToggle
              value={settings.lyricsRotateBg || false}
              onChange={(v) => updateSetting("lyricsRotateBg", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          icon={Svg.lines}
          label={t.lyricsTextPos}
          right={
            <SegBtn
              options={[
                ["left", t.alignLeft],
                ["center", t.alignCenter],
              ]}
              settingKey="lyricsTextPos"
              current={settings.lyricsTextPos}
            />
          }
        />
        <SettingRow
          icon={Svg.music2}
          label={t.lyricsAnimate}
          desc={t.lyricsAnimateDesc}
          right={
            <SettingsToggle
              value={settings.lyricsAnimate ?? true}
              onChange={(v) => updateSetting("lyricsAnimate", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          icon={Svg.expand}
          label={t.lyricsClickSeek}
          desc={t.lyricsClickSeekDesc}
          right={
            <SettingsToggle
              value={settings.lyricsClickSeek ?? true}
              onChange={(v) => updateSetting("lyricsClickSeek", v)}
              accent={accent}
            />
          }
        />
        <SettingRow
          icon={Svg.pen}
          label={t.lyricsFontSize}
          right={
            <SegBtn
              options={[
                ["small", t.small],
                ["medium", t.medium],
                ["large", t.large],
              ]}
              settingKey="lyricsFontSize"
              current={settings.lyricsFontSize || "medium"}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.clock2}
          label={t.lyricsScrollResume}
          desc={`${settings.lyricsScrollResume ?? 3}s`}
        />
        <div
          style={{ padding: "4px 18px 14px", display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={settings.lyricsScrollResume ?? 3}
            onChange={(e) => updateSetting("lyricsScrollResume", Number(e.target.value))}
            style={{ width: "100%", accentColor: accent, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              1s
            </span>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,.3)", fontWeight: "700" }}>
              10s
            </span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="General">
        <SettingRow
          icon={Svg.clock}
          label={t.showProgressTime}
          desc="Muestra 0:00 a los lados de la barra"
          right={
            <SettingsToggle
              value={settings.showProgressTime ?? true}
              onChange={(v) => updateSetting("showProgressTime", v)}
              accent={accent}
            />
          }
        />
      </SettingsSection>

      {showBtnModal &&
        createPortal(
          <BtnShapeModal
            accent={accent}
            settings={settings}
            updateSetting={updateSetting}
            onClose={() => setShowBtnModal(false)}
          />,
          document.body,
        )}
      {showBarModal &&
        createPortal(
          <BarStyleModal
            accent={accent}
            settings={settings}
            updateSetting={updateSetting}
            onClose={() => setShowBarModal(false)}
          />,
          document.body,
        )}
    </div>
  );
}

function BtnShapeModal({ accent, settings, updateSetting, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "rgba(5,5,10,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn .15s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          border: `1px solid ${accent}33`,
          borderRadius: RADIUS.pill,
          padding: "24px",
          width: "min(500px,calc(100vw-48px))",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: COLORS.textPrimary,
            marginBottom: SPACING.gap.xxwide,
            letterSpacing: "-.3px",
          }}
        >
          Forma del botón
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: SPACING.gap.wide }}
        >
          {BTN_SHAPES.map((shape) => {
            const isSel = (settings.playerBtnShape || "circle") === shape.id;
            return (
              <div
                key={shape.id}
                onClick={() => {
                  updateSetting("playerBtnShape", shape.id);
                  onClose();
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  padding: "16px 8px",
                  borderRadius: RADIUS.card,
                  cursor: "pointer",
                  background: isSel ? `${accent}22` : COLORS.surfaceCard,
                  border: `1.5px solid ${isSel ? accent : "rgba(255,255,255,.07)"}`,
                  transition: TRANSITIONS.normal,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = COLORS.surfaceCardHover;
                    e.currentTarget.style.borderColor = `${accent}55`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = COLORS.surfaceCard;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.07)";
                  }
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    background: isSel ? accent : "rgba(255,255,255,.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background .15s",
                    ...getBtnShapeStyle(shape.id),
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isSel ? "#000" : "rgba(255,255,255,.8)"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <span
                  style={{
                    ...TYPOGRAPHY.small,
                    color: isSel ? accent : COLORS.iconActive,
                    textAlign: "center",
                  }}
                >
                  {shape.label}
                </span>
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: SPACING.gap.xxwide,
            width: "100%",
            padding: "10px",
            borderRadius: RADIUS.default,
            border: `1px solid ${COLORS.borderLight}`,
            background: "transparent",
            color: COLORS.iconActive,
            fontWeight: "700",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function BarStyleModal({ accent, settings, updateSetting, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "rgba(5,5,10,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn .15s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.sheet,
          border: `1px solid ${accent}33`,
          borderRadius: RADIUS.pill,
          padding: "24px",
          width: "min(520px,calc(100vw-48px))",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: COLORS.textPrimary,
            marginBottom: SPACING.gap.xxwide,
            letterSpacing: "-.3px",
          }}
        >
          Estilo de la barra
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {BAR_STYLES.map((s) => {
            const isSel = (settings.playerBarStyle || "line") === s.id;
            return (
              <div
                key={s.id}
                onClick={() => {
                  updateSetting("playerBarStyle", s.id);
                  onClose();
                }}
                style={{
                  padding: "14px 16px",
                  borderRadius: RADIUS.default,
                  cursor: "pointer",
                  background: isSel ? `${accent}18` : COLORS.surfaceCard,
                  border: `1.5px solid ${isSel ? accent : "rgba(255,255,255,.07)"}`,
                  transition: TRANSITIONS.normal,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = "rgba(255,255,255,.07)";
                    e.currentTarget.style.borderColor = `${accent}44`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSel) {
                    e.currentTarget.style.background = COLORS.surfaceCard;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.07)";
                  }
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: SPACING.gap.normal,
                  }}
                >
                  <span
                    style={{
                      ...TYPOGRAPHY.h4,
                      color: isSel ? accent : "rgba(255,255,255,.85)",
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ ...TYPOGRAPHY.small, color: "rgba(255,255,255,.3)" }}>
                    {s.desc}
                  </span>
                </div>
                <BarPreview style={s.id} accent={accent} />
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: SPACING.gap.xwide,
            width: "100%",
            padding: "10px",
            borderRadius: RADIUS.default,
            border: `1px solid ${COLORS.borderLight}`,
            background: "transparent",
            color: COLORS.iconActive,
            fontWeight: "700",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Page: Reproductor ──────────────────────────────────────────────────────

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

// ── Page: Contenido ─────────────────────────────────────────────────────────

export function PageContenido({ neonColor }) {
  const { settings, updateSetting, t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.content}>
        <SettingRow
          icon={Svg.globe}
          label={t.lrcLib}
          right={
            <SettingsToggle
              value={settings.lrcLib ?? true}
              onChange={(v) => updateSetting("lrcLib", v)}
              accent={neonColor}
            />
          }
        />
        <SettingRow
          border={false}
          icon={Svg.github}
          label={t.kuGou}
          right={
            <SettingsToggle
              value={settings.kuGou ?? true}
              onChange={(v) => updateSetting("kuGou", v)}
              accent={neonColor}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}

// ── Page: Privacidad ────────────────────────────────────────────────────────

export function PagePrivacidad({ neonColor, onClearHistory, toast }) {
  const { settings, updateSetting, t } = useSettings();
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.privacy}>
        <SettingRow
          icon={Svg.refresh}
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
          border={false}
          icon={Svg.trash}
          label={t.clearHistory}
          onClick={() => setConfirming(true)}
          right={<SettingsChevron />}
        />
      </SettingsSection>
      {confirming && (
        <div
          style={{
            background: withAlpha(COLORS.errorColor, "14"),
            border: `1px solid ${withAlpha(COLORS.errorColor, "33")}`,
            borderRadius: RADIUS.card,
            padding: "16px 18px",
            marginTop: "-8px",
          }}
        >
          <div
            style={{
              ...TYPOGRAPHY.body,
              color: COLORS.settingsIcon,
              marginBottom: SPACING.gap.wide,
            }}
          >
            {t.clearHistory}?
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setConfirming(false)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: RADIUS.cover,
                border: "1px solid rgba(255,255,255,.12)",
                background: "transparent",
                color: COLORS.textSecondary,
                cursor: "pointer",
                fontWeight: "700",
                fontFamily: "inherit",
              }}
            >
              {t.cancel}
            </button>
            <button
              onClick={() => {
                onClearHistory();
                setConfirming(false);
                toast("Historial eliminado", "info");
              }}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: RADIUS.cover,
                border: "none",
                background: withAlpha(COLORS.errorColor, "cc"),
                color: COLORS.white,
                cursor: "pointer",
                fontWeight: "700",
                fontFamily: "inherit",
              }}
            >
              {t.clear}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page: Almacenamiento ────────────────────────────────────────────────────

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
          icon={Svg.image}
          label={t.imageCache}
          desc="Portadas de álbumes descargadas"
        />
      </SettingsSection>
      {confirming && (
        <div
          style={{
            background: withAlpha(COLORS.errorColor, "14"),
            border: `1px solid ${withAlpha(COLORS.errorColor, "33")}`,
            borderRadius: RADIUS.card,
            padding: "16px 18px",
            marginTop: "-8px",
          }}
        >
          <div
            style={{
              ...TYPOGRAPHY.body,
              color: COLORS.settingsIcon,
              marginBottom: SPACING.gap.wide,
            }}
          >
            Eliminar todas las descargas?
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setConfirming(false)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: RADIUS.cover,
                border: "1px solid rgba(255,255,255,.12)",
                background: "transparent",
                color: COLORS.textSecondary,
                cursor: "pointer",
                fontWeight: "700",
                fontFamily: "inherit",
              }}
            >
              {t.cancel}
            </button>
            <button
              onClick={() => {
                onClearDownloads();
                setConfirming(false);
              }}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: RADIUS.cover,
                border: "none",
                background: withAlpha(COLORS.errorColor, "cc"),
                color: COLORS.white,
                cursor: "pointer",
                fontWeight: "700",
                fontFamily: "inherit",
              }}
            >
              {t.clear}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page: Copias de seguridad ───────────────────────────────────────────────

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
          icon={Svg.download}
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

// ── Page: Acerca de ─────────────────────────────────────────────────────────

export function PageAcercaDe() {
  const { t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.about}>
        <SettingRow icon={Svg.info} label={t.version} desc="1.0.0" border={false} />
      </SettingsSection>
      <SettingsSection title={t.developer}>
        <SettingRow
          icon={Svg.code}
          label={t.sourceCode}
          onClick={() => window.open("https://github.com", "_blank")}
          right={<SettingsChevron />}
        />
      </SettingsSection>
    </div>
  );
}

// ── Page: Traducción ────────────────────────────────────────────────────────

export function PageTraduccion() {
  const { settings, t } = useSettings();
  return (
    <div style={{ padding: "20px 16px" }}>
      <SettingsSection title={t.translation}>
        <SettingRow
          icon={Svg.globe2}
          label={t.language}
          desc={t.languageDesc}
          right={
            <SegBtn
              options={[
                ["es", "Español"],
                ["en", "English"],
              ]}
              settingKey="language"
              current={settings.language}
            />
          }
          border={false}
        />
      </SettingsSection>
    </div>
  );
}

// ── SVG icon helpers (inline Phosphor-style) ────────────────────────────────

const Svg = {
  sun: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  circle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  rectangle: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  ),
  maximize: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" />
    </svg>
  ),
  circle2: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  line: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  clock: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l3 3" />
    </svg>
  ),
  lines: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  ),
  music2: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  expand: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  ),
  pen: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  clock2: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  wave: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 8c1.5 0 3 1 4 3s2.5 3 4 3 2.5-1 4-3 2.5-3 4-3" />
      <path d="M2 16c1.5 0 3-1 4-3s2.5-3 4-3 2.5 1 4 3 2.5 3 4 3" />
    </svg>
  ),
  globe: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z" />
      <path d="M15 9H9M15 12H9M15 15h-3" />
    </svg>
  ),
  github: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  ),
  refresh: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  trash: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  database: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  image: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  download: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  info: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  code: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3l4 4-4 4" />
      <path d="M3 7l4-4 4 4" />
      <path d="M11 21h2" />
      <path d="M15 21a3 3 0 0 0 3-3v-6" />
      <path d="M9 21a3 3 0 0 1-3-3v-6" />
    </svg>
  ),
  globe2: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  check: ({ stroke = "currentColor" } = {}) => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};
