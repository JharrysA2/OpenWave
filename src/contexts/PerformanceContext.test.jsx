import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsProvider } from "./SettingsContext";
import { PerformanceProvider } from "./PerformanceContext";
import { SW_SETTINGS_KEY } from "../constants";

// Los tests corren con cwd en la raíz del proyecto (npm test)
const readProjectFile = (rel) => readFileSync(join(process.cwd(), rel), "utf8");

const mockSoftware = vi.hoisted(() => vi.fn(() => true));
vi.mock("../utils/softwareRenderer", () => ({ isSoftwareRenderer: () => mockSoftware() }));

function renderProvider() {
  return render(
    <SettingsProvider>
      <PerformanceProvider>
        <div data-testid="child" />
      </PerformanceProvider>
    </SettingsProvider>,
  );
}

const classes = () => document.documentElement.className;

describe("PerformanceProvider — modo auto con detección de GPU", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSoftware.mockReturnValue(true);
  });

  it("sin settings guardados + sin GPU → bajo consumo (blur/anim/sombras off, sólido on)", () => {
    renderProvider();
    const c = classes();
    expect(c).toContain("perf-blur-off");
    expect(c).toContain("perf-anim-off");
    expect(c).toContain("perf-shadow-off");
    expect(c).toContain("perf-solid");
  });

  it("settings LEGACY con perfMode 'balanced' incidental → se migra a auto → bajo consumo", () => {
    // El usuario antiguo nunca eligió "balanced": se persistió solo porque
    // updateSetting guarda el objeto entero. Sin marcador de migración.
    localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify({ language: "es", perfMode: "balanced" }));
    mockSoftware.mockReturnValue(true);
    renderProvider();
    const c = classes();
    expect(c).toContain("perf-blur-off");
    expect(c).toContain("perf-solid");
  });

  it("auto + GPU real → equilibrado (ninguna clase perf-*)", () => {
    mockSoftware.mockReturnValue(false);
    renderProvider();
    const c = classes();
    expect(c).not.toContain("perf-blur-off");
    expect(c).not.toContain("perf-anim-off");
    expect(c).not.toContain("perf-shadow-off");
    expect(c).not.toContain("perf-solid");
  });

  it("respeta elección EXPLÍCITA 'balanced' (con marcador) aunque no haya GPU", () => {
    localStorage.setItem(
      SW_SETTINGS_KEY,
      JSON.stringify({ perfMode: "balanced", perfModeMigrated: true }),
    );
    mockSoftware.mockReturnValue(true);
    renderProvider();
    const c = classes();
    expect(c).not.toContain("perf-blur-off");
    expect(c).not.toContain("perf-solid");
  });

  it("elección explícita 'performance' con GPU → igualmente bajo consumo", () => {
    localStorage.setItem(
      SW_SETTINGS_KEY,
      JSON.stringify({ perfMode: "performance", perfModeMigrated: true }),
    );
    mockSoftware.mockReturnValue(false);
    renderProvider();
    const c = classes();
    expect(c).toContain("perf-blur-off");
    expect(c).toContain("perf-anim-off");
    expect(c).toContain("perf-shadow-off");
    expect(c).toContain("perf-solid");
  });

  it("no añade 'app-hidden' con la ventana visible", () => {
    // jsdom no tiene foco real: simular la ventana en primer plano.
    const focusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    renderProvider();
    expect(classes()).not.toContain("app-hidden");
    focusSpy.mockRestore();
  });
});

describe("app-hidden — reglas CSS de index.html (presupuesto §4)", () => {
  it("con la ventana sin foco apaga backdrop-filter/filtro/sombras de todo", () => {
    const html = readProjectFile("index.html");
    expect(html).toMatch(/html\.app-hidden \*[^}]*backdrop-filter:\s*none\s*!important/);
    expect(html).toMatch(/html\.app-hidden \*[^}]*filter:\s*none\s*!important/);
  });

  it("excepción: el cristal de modal blur(40px) NO se apaga (vidrio debe conservarse)", () => {
    // Un modal abierto es lo que el usuario está mirando: sin esta exención,
    // perder el foco DOM convertía el vidrio esmerilado en transparente de
    // golpe (bug "los modales no tienen blur", reproducido con foco robado).
    const html = readProjectFile("index.html");
    expect(html).toMatch(
      /html\.app-hidden:not\(\.perf-blur-off\):not\(\.perf-solid\) \[style\*="blur\(40px\)"\]\s*\{\s*backdrop-filter:\s*blur\(40px\)\s*!important/,
    );
    // Solo el cristal de modal: los modos explícitos de Rendimiento siguen
    // ganando (el :not() desactiva la exención si perf-blur-off/perf-solid).
    expect(html).toContain('[style*="blur(40px)"]');
    expect(html).toMatch(/:not\(\.perf-blur-off\):not\(\.perf-solid\)/);
  });
});
