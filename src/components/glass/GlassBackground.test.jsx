import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SettingsProvider } from "../../contexts/SettingsContext";
import { GlassBackground } from "./GlassBackground";
import { SW_SETTINGS_KEY } from "../../constants";

function renderGlass() {
  return render(
    <SettingsProvider>
      <div style={{ position: "relative", width: 680, height: 84 }}>
        <GlassBackground radius={20} variant="shell" />
      </div>
    </SettingsProvider>,
  );
}

function setSettings(partial) {
  localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify({ language: "es", ...partial }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("GlassBackground — degradación y opt-in", () => {
  it("sin glassMode devuelve el material plano anterior", () => {
    const { container } = renderGlass();
    const root = container.querySelector("[data-glass]");
    expect(root).toHaveAttribute("data-glass", "fallback");
    // El fallback conserva el blur del player (GLASS.player).
    expect(root.firstElementChild.style.backdropFilter).toBe("blur(10px)");
  });

  it("con glassMode y sin escena pinta tinte + rim, sin lente", () => {
    setSettings({ glassMode: true, glassScene: true });
    const { container } = renderGlass();
    const root = container.querySelector("[data-glass]");
    expect(root).toHaveAttribute("data-glass", "low");
    expect(root.querySelector(".ow-glass-lens")).toBeNull();
    // El backdrop-filter de hoja no debe aparecer en la barra.
    expect(root.querySelector(".ow-glass-backdrop")).toBeNull();
  });

  it("en bajo consumo no monta la lente aunque haya escena", () => {
    setSettings({ glassMode: true, glassLowPower: true });
    const { container } = renderGlass();
    const root = container.querySelector("[data-glass]");
    expect(root).toHaveAttribute("data-glass", "low");
    expect(root.querySelector(".ow-glass-lens")).toBeNull();
  });
});
