import React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsProvider } from "./SettingsContext";
import { PerformanceProvider, usePerformance } from "./PerformanceContext";
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

  it("no añade 'app-hidden' con la ventana visible (aunque pierda el foco)", () => {
    // El foco ya NO decide nada (ventanes divididas deben seguir vivas):
    // solo manda document.visibilityState.
    const focusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    renderProvider();
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(classes()).not.toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
    focusSpy.mockRestore();
  });
});

// ── Congelado por visibilidad REAL (spec §4): foco irrelevante ──────────────
//  t=0 oculta  → app-hidden (pausa; música sigue)
//  t=15 s      → app-sleep (animaciones apagadas + componentes liberan RAM)
//  restaurar   → ambas fuera al instante

describe("app-hidden → app-sleep — ciclo de congelado por visibilidad", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSoftware.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restaura el getter original de jsdom para el resto de tests.
    delete document.visibilityState;
  });

  /** Simula minimizar (hidden) o restaurar (visible) la ventana. */
  const setVisibility = (value) => {
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => value,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };

  it("minimizar → 'app-hidden' al instante (congelado t=0), sin 'app-sleep'", () => {
    renderProvider();
    setVisibility("hidden");
    expect(classes()).toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });

  it("15 s oculta → 'app-sleep' (antes de los 15 s solo pausa)", () => {
    vi.useFakeTimers();
    renderProvider();
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(14999);
    });
    expect(classes()).not.toContain("app-sleep");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(classes()).toContain("app-sleep");
  });

  it("restaurar tras el sueño → limpia app-sleep y app-hidden al instante", () => {
    vi.useFakeTimers();
    renderProvider();
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(classes()).toContain("app-sleep");
    setVisibility("visible");
    expect(classes()).not.toContain("app-sleep");
    expect(classes()).not.toContain("app-hidden");
  });

  it("visible otra vez ANTES de 15 s → nunca llega a 'app-sleep'", () => {
    vi.useFakeTimers();
    renderProvider();
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(14000);
    });
    setVisibility("visible");
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(classes()).not.toContain("app-sleep");
    expect(classes()).not.toContain("app-hidden");
  });

  it("con «Pausar efectos al ocultar» OFF → la ventana oculta no congela ni duerme", () => {
    vi.useFakeTimers();
    localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify({ pauseEffectsHidden: false }));
    renderProvider();
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(classes()).not.toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });

  it("expone visible/sleeping por contexto (LyricsView y usePlayer lo consumen)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <SettingsProvider>
        <PerformanceProvider>
          <PerfProbe />
        </PerformanceProvider>
      </SettingsProvider>,
    );
    const probe = () => container.querySelector('[data-testid="perf-probe"]');
    expect(probe().dataset.visible).toBe("true");
    expect(probe().dataset.sleeping).toBe("false");
    setVisibility("hidden");
    expect(probe().dataset.visible).toBe("false");
    expect(probe().dataset.sleeping).toBe("false");
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(probe().dataset.sleeping).toBe("true");
    setVisibility("visible");
    expect(probe().dataset.sleeping).toBe("false");
  });
});

/** Sonda del contexto: refleja visible/sleeping en atributos de test. */
function PerfProbe() {
  const { visible, sleeping } = usePerformance();
  return (
    <div
      data-testid="perf-probe"
      data-visible={String(visible)}
      data-sleeping={String(sleeping)}
    />
  );
}

describe("app-hidden — reglas CSS de index.html (presupuesto §4)", () => {
  it("con la ventana OCULTA apaga backdrop-filter/filtro/sombras de todo", () => {
    const html = readProjectFile("index.html");
    expect(html).toMatch(/html\.app-hidden \*[^}]*backdrop-filter:\s*none\s*!important/);
    expect(html).toMatch(/html\.app-hidden \*[^}]*filter:\s*none\s*!important/);
  });

  it("excepción: el cristal de modal blur(40px) NO se apaga (vidrio debe conservarse)", () => {
    // Regla de seguridad heredada del bug "los modales no tienen blur": al
    // entrar en app-hidden el vidrio esmerilado se volvía transparente de
    // golpe. Hoy app-hidden solo se activa con la ventana invisible, pero la
    // exención se mantiene por si el motor reporta oculto con ventana a la vista.
    const html = readProjectFile("index.html");
    expect(html).toMatch(
      /html\.app-hidden:not\(\.perf-blur-off\):not\(\.perf-solid\) \[style\*="blur\(40px\)"\]\s*\{\s*backdrop-filter:\s*blur\(40px\)\s*!important/,
    );
    // Solo el cristal de modal: los modos explícitos de Rendimiento siguen
    // ganando (el :not() desactiva la exención si perf-blur-off/perf-solid).
    expect(html).toContain('[style*="blur(40px)"]');
    expect(html).toMatch(/:not\(\.perf-blur-off\):not\(\.perf-solid\)/);
  });

  it("«Sombras» apaga también el glow drop-shadow del relleno (paridad box-shadow)", () => {
    // El glow del player vive en filter: drop-shadow (para que scaleX no lo
    // aplaste) y ya no es un box-shadow: sin esta regla, perf-shadow-off
    // («Sombras» de Rendimiento) dejaría el neon encendido.
    const html = readProjectFile("index.html");
    expect(html).toMatch(
      /html\.perf-shadow-off \[style\*="drop-shadow"\]\s*\{\s*filter:\s*none\s*!important/,
    );
  });
});

describe("app-sleep — reglas CSS de index.html (sueño profundo ≥15 s)", () => {
  it("APAGA (no pausa) animaciones y transiciones de todos los elementos", () => {
    // Diferencia clave con app-hidden (animation-play-state: paused): en
    // sueño profundo las animaciones se destruyen para que el compositor
    // no mantenga estados vivos con la ventana oculta.
    const html = readProjectFile("index.html");
    expect(html).toMatch(/html\.app-sleep \*[^}]*animation:\s*none\s*!important/);
    expect(html).toMatch(/html\.app-sleep \*[^}]*transition:\s*none\s*!important/);
  });

  it("mantiene apagados backdrop-filter/filtro/sombras y libera will-change", () => {
    const html = readProjectFile("index.html");
    expect(html).toMatch(/html\.app-sleep \*[^}]*backdrop-filter:\s*none\s*!important/);
    expect(html).toMatch(/html\.app-sleep \*[^}]*filter:\s*none\s*!important/);
    expect(html).toMatch(/html\.app-sleep \*[^}]*box-shadow:\s*none\s*!important/);
    expect(html).toMatch(/html\.app-sleep \*[^}]*will-change:\s*auto\s*!important/);
  });
});
