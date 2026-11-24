import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsProvider } from "./SettingsContext";
import { useSettings } from "./useSettings";
import { SW_SETTINGS_KEY, DEFAULT_SETTINGS } from "../constants";

function renderUseSettings() {
  return renderHook(() => useSettings(), {
    wrapper: SettingsProvider,
  });
}

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should return default settings when no saved settings exist", () => {
    const { result } = renderUseSettings();

    expect(result.current.settings).toMatchObject(DEFAULT_SETTINGS);
  });

  it("should provide a translation function 't'", () => {
    const { result } = renderUseSettings();

    expect(result.current.t).toBeDefined();
    expect(typeof result.current.t).toBe("object");
  });

  it("should return Spanish translations by default", () => {
    const { result } = renderUseSettings();

    expect(result.current.t.settings).toBe("Ajustes");
    expect(result.current.t.appearance).toBe("Apariencia");
  });

  it("should update a setting and reflect the change", () => {
    const { result } = renderUseSettings();

    act(() => {
      result.current.updateSetting("pureBlack", true);
    });

    expect(result.current.settings.pureBlack).toBe(true);
  });

  it("should preserve other settings when updating one", () => {
    const { result } = renderUseSettings();

    act(() => {
      result.current.updateSetting("pureBlack", true);
    });

    expect(result.current.settings.pureBlack).toBe(true);
    expect(result.current.settings.language).toBe("es");
    expect(result.current.settings.crossfade).toBe(5);
  });

  it("should persist settings to localStorage", () => {
    const { result } = renderUseSettings();

    act(() => {
      result.current.updateSetting("language", "en");
    });

    const saved = JSON.parse(localStorage.getItem(SW_SETTINGS_KEY));
    expect(saved.language).toBe("en");
  });

  it("should load saved settings from localStorage", () => {
    localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify({ language: "en", pureBlack: true }));

    const { result } = renderUseSettings();

    expect(result.current.settings.language).toBe("en");
    expect(result.current.settings.pureBlack).toBe(true);
    // Other defaults should still be present
    expect(result.current.settings.crossfade).toBe(5);
  });

  it("migra el preset antiguo del vidrio (fino/60) a grueso/80 una vez", () => {
    localStorage.setItem(
      SW_SETTINGS_KEY,
      JSON.stringify({
        glassMode: true,
        glassDepth: "thin",
        glassRefraction: 60,
        glassDispersion: 25,
      }),
    );

    const { result } = renderUseSettings();

    expect(result.current.settings.glassDepth).toBe("thick");
    expect(result.current.settings.glassRefraction).toBe(80);
    expect(result.current.settings.glassDispersion).toBe(35);
    expect(result.current.settings.glassPresetMigrated).toBe(true);
  });

  it("respeta el grosor elegido después de la migración", () => {
    localStorage.setItem(
      SW_SETTINGS_KEY,
      JSON.stringify({
        glassMode: true,
        glassDepth: "thin",
        glassRefraction: 60,
        glassDispersion: 25,
        glassPresetMigrated: true,
        glassPresetMigrated2: true,
      }),
    );

    const { result } = renderUseSettings();

    expect(result.current.settings.glassDepth).toBe("thin");
    expect(result.current.settings.glassRefraction).toBe(60);
  });

  it("corrige el preset que quedó en fino/60 pese a la primera migración", () => {
    localStorage.setItem(
      SW_SETTINGS_KEY,
      JSON.stringify({
        glassMode: true,
        glassDepth: "thin",
        glassRefraction: 60,
        glassDispersion: 25,
        glassPresetMigrated: true,
      }),
    );

    const { result } = renderUseSettings();

    expect(result.current.settings.glassDepth).toBe("thick");
    expect(result.current.settings.glassRefraction).toBe(80);
    expect(result.current.settings.glassDispersion).toBe(35);
    expect(result.current.settings.glassPresetMigrated2).toBe(true);
  });

  it("should switch translations when language is changed", () => {
    const { result } = renderUseSettings();

    // Default is Spanish
    expect(result.current.t.settings).toBe("Ajustes");

    act(() => {
      result.current.updateSetting("language", "en");
    });

    expect(result.current.t.settings).toBe("Settings");
  });

  it("should handle updates without throwing", () => {
    const { result } = renderUseSettings();

    expect(() => {
      act(() => {
        result.current.updateSetting("crossfade", 10);
      });
    }).not.toThrow();

    expect(result.current.settings.crossfade).toBe(10);
  });

  it("should throw when used outside SettingsProvider", () => {
    // Suppress console.error from React for this expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSettings());
    }).toThrow();

    spy.mockRestore();
  });
});
