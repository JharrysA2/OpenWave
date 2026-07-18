import React, { useState, createContext, useCallback, useMemo } from "react";
import { SW_SETTINGS_KEY, DEFAULT_SETTINGS } from "../constants";
import { TRANSLATIONS } from "../i18n/translations";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SW_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
