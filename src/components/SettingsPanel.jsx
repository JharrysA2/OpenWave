import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { COLORS, RADIUS, SPACING, SHADOWS, TRANSITIONS, GLASS } from "../utils/theme";
import { Ic } from "../icons/Icons";
import { useSettings } from "../contexts/useSettings";
import { SettingRow, SettingsSection, SettingsChevron } from "./SettingsComponents";
import {
  PageApariencia,
  PageReproductor,
  PageContenido,
  PagePrivacidad,
  PageAlmacenamiento,
  PageCopias,
  PageAcercaDe,
  PageTraduccion,
  PageRendimiento,
} from "./SettingsPages";
import {
  PaintBrush,
  MusicNote,
  BookOpen,
  Lock,
  HardDrive,
  Cloud,
  Info,
  Globe,
  Lightning,
} from "@phosphor-icons/react";

export default function SettingsPanel({
  open,
  onClose,
  neonColor,
  crossfadeDuration,
  setCrossfadeDuration,
  downloads,
  onClearDownloads,
  onClearHistory,
  liked,
  history,
  playlists,
  toast,
}) {
  const { t } = useSettings();
  const [page, setPage] = useState(null);

  useEffect(() => {
    if (open) setPage(null);
  }, [open]);

  if (!open) return null;

  const iconStyle = { fontSize: "18px", display: "flex", alignItems: "center" };
  const PAGES = {
    appearance: {
      label: t.appearance,
      icon: <PaintBrush style={iconStyle} weight="fill" />,
      comp: <PageApariencia neonColor={neonColor} />,
    },
    player: {
      label: t.playerSound,
      icon: <MusicNote style={iconStyle} weight="fill" />,
      comp: (
        <PageReproductor
          neonColor={neonColor}
          crossfadeDuration={crossfadeDuration}
          setCrossfadeDuration={setCrossfadeDuration}
        />
      ),
    },
    content: {
      label: t.content,
      icon: <BookOpen style={iconStyle} />,
      comp: <PageContenido neonColor={neonColor} />,
    },
    privacy: {
      label: t.privacy,
      icon: <Lock style={iconStyle} weight="fill" />,
      comp: <PagePrivacidad neonColor={neonColor} onClearHistory={onClearHistory} toast={toast} />,
    },
    storage: {
      label: t.storage,
      icon: <HardDrive style={iconStyle} />,
      comp: (
        <PageAlmacenamiento
          neonColor={neonColor}
          downloads={downloads}
          onClearDownloads={onClearDownloads}
        />
      ),
    },
    backup: {
      label: t.backup,
      icon: <Cloud style={iconStyle} weight="fill" />,
      comp: (
        <PageCopias
          neonColor={neonColor}
          liked={liked}
          history={history}
          playlists={playlists}
          toast={toast}
        />
      ),
    },
    about: {
      label: t.about,
      icon: <Info style={iconStyle} weight="fill" />,
      comp: <PageAcercaDe />,
    },
    translation: {
      label: t.translation,
      icon: <Globe style={iconStyle} weight="fill" />,
      comp: <PageTraduccion />,
    },
    performance: {
      label: t.performance,
      icon: <Lightning style={iconStyle} weight="fill" />,
      comp: <PageRendimiento neonColor={neonColor} />,
    },
  };

  const currentPage = page ? PAGES[page] : null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: "0px",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        ...GLASS.settings,
        fontFamily: FONT,
        animation: "fadeIn .12s ease both",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: SPACING.settings.headerPad,
          display: "flex",
          alignItems: "center",
          gap: SPACING.gap.wide,
          borderBottom: `1px solid ${COLORS.borderSubtle}`,
          flexShrink: 0,
        }}
      >
        {currentPage ? (
          <button
            onClick={() => setPage(null)}
            style={{
              background: "none",
              border: "none",
              color: COLORS.textPrimary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: SPACING.gap.tight,
              fontSize: "14px",
              fontWeight: "700",
              fontFamily: FONT,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M15 18L9 12L15 6" />
            </svg>
            {t.back}
          </button>
        ) : (
          <>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: RADIUS.cover,
                ...GLASS.btn,
                // Sin blur propio: el panel ya difumina el fondo (ver GLASS.settings)
                backdropFilter: "none",
                WebkitBackdropFilter: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: COLORS.settingsIcon }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: "900",
                color: COLORS.textPrimary,
                letterSpacing: "-.3px",
                flex: 1,
              }}
            >
              {t.settings}
            </div>
            <button
              data-testid="close-settings"
              onClick={onClose}
              style={{
                ...GLASS.btn,
                // Sin blur propio: el panel ya difumina el fondo (ver GLASS.settings)
                backdropFilter: "none",
                WebkitBackdropFilter: "none",
                color: "rgba(255,255,255,.55)",
                cursor: "pointer",
                width: "34px",
                height: "34px",
                borderRadius: RADIUS.settingsClose,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0",
                boxShadow: SHADOWS.settingsClose,
                transition: TRANSITIONS.normal,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textPlayerTitle)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.iconDim)}
            >
              {Ic.close}
            </button>
          </>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {currentPage ? (
          currentPage.comp
        ) : (
          <div style={{ padding: SPACING.settings.sectionPad }}>
            <SettingsSection title={t.generalSettings}>
              {[
                [
                  "appearance",
                  <PaintBrush key="appearance" style={iconStyle} weight="fill" />,
                  t.appearance,
                ],
                [
                  "player",
                  <MusicNote key="player" style={iconStyle} weight="fill" />,
                  t.playerSound,
                ],
                ["content", <BookOpen key="content" style={iconStyle} />, t.content],
                [
                  "translation",
                  <Globe key="translation" style={iconStyle} weight="fill" />,
                  t.translation,
                ],
                [
                  "performance",
                  <Lightning key="performance" style={iconStyle} weight="fill" />,
                  t.performance,
                ],
              ].map(([key, icon, label], i, arr) => (
                <SettingRow
                  key={key}
                  label={label}
                  icon={icon}
                  border={i < arr.length - 1}
                  onClick={() => setPage(key)}
                  right={<SettingsChevron />}
                />
              ))}
            </SettingsSection>
            <SettingsSection title={t.account}>
              {[
                ["privacy", <Lock key="privacy" style={iconStyle} weight="fill" />, t.privacy],
                ["backup", <Cloud key="backup" style={iconStyle} weight="fill" />, t.backup],
              ].map(([key, icon, label], i, arr) => (
                <SettingRow
                  key={key}
                  label={label}
                  icon={icon}
                  border={i < arr.length - 1}
                  onClick={() => setPage(key)}
                  right={<SettingsChevron />}
                />
              ))}
            </SettingsSection>
            <SettingsSection title={t.storage}>
              {[["storage", <HardDrive key="storage" style={iconStyle} />, t.storage]].map(
                ([key, icon, label]) => (
                  <SettingRow
                    key={key}
                    label={label}
                    icon={icon}
                    onClick={() => setPage(key)}
                    right={<SettingsChevron />}
                  />
                ),
              )}
            </SettingsSection>
            <SettingsSection title={t.appInfo}>
              {[["about", <Info key="about" style={iconStyle} weight="fill" />, t.about]].map(
                ([key, icon, label]) => (
                  <SettingRow
                    key={key}
                    label={label}
                    icon={icon}
                    onClick={() => setPage(key)}
                    right={<SettingsChevron />}
                  />
                ),
              )}
            </SettingsSection>
          </div>
        )}
      </div>
    </div>
  );
}
