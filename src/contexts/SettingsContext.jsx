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
      const legacy = parsed && typeof parsed === "object" && !("perfModeMigrated" in parsed);
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (legacy && merged.perfMode === "balanced") merged.perfMode = "auto";
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
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const t = useMemo(() => TRANSLATIONS[settings.language] || TRANSLATIONS.es, [settings.language]);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, t }}>
      {children}
    </SettingsContext.Provider>
  );
}
