import React, { useState, createContext, useCallback, useMemo } from "react";
import { SW_SETTINGS_KEY, DEFAULT_SETTINGS } from "../constants";
import { TRANSLATIONS } from "../i18n/translations";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SW_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migración de modos: antes el default era "balanced" y se persistía
      // junto a cualquier otro ajuste aunque el usuario nunca lo eligiera.
      // Ahora el default es "auto" (bajo consumo solo sin GPU); ese
      // "balanced" incidental se migra una sola vez. Una elección explícita
      // posterior ya guarda perfModeMigrated y no se toca.
      const stored = parsed && typeof parsed === "object";
      const legacy = stored && !("perfModeMigrated" in parsed);
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (legacy && merged.perfMode === "balanced") merged.perfMode = "auto";
      // El primer preset de vidrio (fino/60) era demasiado sutil en
      // WebKitGTK. Si el usuario lo dejó en esos valores, se sube una vez a
      // grueso/80; una elección posterior ya guarda glassPresetMigrated.
      if (stored && !("glassPresetMigrated" in parsed) && merged.glassMode) {
        if (
          merged.glassDepth === "thin" &&
          merged.glassRefraction === 60 &&
          merged.glassDispersion === 25
        ) {
          merged.glassDepth = "thick";
          merged.glassRefraction = 80;
          merged.glassDispersion = 35;
        }
        merged.glassPresetMigrated = true;
      }
      return merged;
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

const SettingsContext = createContext(null);

export { SettingsContext };

export function SettingsProvider({ children }) {
  const [settings, setSettingsRaw] = useState(loadSettings);

  const updateSetting = useCallback((key, value) => {
    setSettingsRaw((prev) => {
      // No-op con la misma identidad: evita re-renderizar todo el árbol de
      // consumidores (App, LyricsView, 11 páginas…) por un valor que no cambia.
      if (prev[key] === value) return prev;
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const t = useMemo(() => TRANSLATIONS[settings.language] || TRANSLATIONS.es, [settings.language]);

  // Identidad estable: los consumidores solo se re-renderizan cuando algo
  // del triple cambia de verdad (no en cada render del provider).
  const value = useMemo(() => ({ settings, updateSetting, t }), [settings, updateSetting, t]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
