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

// Doble de la ventana de Tauri: isMinimized (IsIconic vía IPC) y eventos
// onResized/onFocusChanged. Sin este mock, el módulo real lanza en jsdom y
// minimized resolvería siempre false → imposible simular «minimizar», que
// WebView2 NO reporta por document.visibilityState (verificado en vivo).
const tauri = vi.hoisted(() => ({
  minimized: false,
  isMinCalls: 0,
  resizeHandlers: [],
  focusHandlers: [],
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMinimized: async () => {
      tauri.isMinCalls += 1;
      return tauri.minimized;
    },
    onResized: async (h) => {
      tauri.resizeHandlers.push(h);
      return () => {};
    },
    onFocusChanged: async (h) => {
      tauri.focusHandlers.push(h);
      return () => {};
    },
  }),
}));

/** Dispara los listeners de ventana Tauri registrados por useVisibility. */
const fireTauri = (kind) =>
  (kind === "resize" ? tauri.resizeHandlers : tauri.focusHandlers).forEach((h) => h());

beforeEach(() => {
  tauri.minimized = false;
  tauri.isMinCalls = 0;
  tauri.resizeHandlers.length = 0;
  tauri.focusHandlers.length = 0;
});

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

  it("no añade 'app-hidden' con la ventana visible (aunque pierda el foco)", async () => {
    // El foco NO decide nada (ventanas divididas deben seguir vivas): el
    // blur solo dispara una reconsulta de IsIconic, que aqui es false.
    renderProvider();
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(classes()).not.toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });
});

// ── Minimizado: la senal que visibilityState NO da (IsIconic de Win32) ───────
//  Verificado en vivo el 2026-10-02: con ShowWindow(SW_MINIMIZE) el documento
//  seguia "visible" (focus=false) -> con solo visibilitychange la app nunca se
//  congelaria. Senales: blur/focus (DOM) + onResized/onFocusChanged (Tauri).

describe("minimizar (IsIconic) — congelado sin visibilityState", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSoftware.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blur con IsIconic=true → 'app-hidden' (el documento sigue visible)", async () => {
    await act(async () => {
      renderProvider();
    });
    tauri.minimized = true;
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(document.visibilityState).toBe("visible");
    expect(classes()).toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });

  it("blur con IsIconic=false (ventanas divididas) → NO congela nada", async () => {
    await act(async () => {
      renderProvider();
    });
    tauri.minimized = false;
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(classes()).not.toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });

  it("≥15 s minimizado → 'app-sleep'; restaurar SOLO por onResized (sin foco) → normal", async () => {
    vi.useFakeTimers();
    await act(async () => {
      renderProvider();
    });
    tauri.minimized = true;
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(classes()).toContain("app-hidden");
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(classes()).toContain("app-sleep");
    // Restore sin activacion: el foco NO vuelve, solo llega WM_SIZE -> Resized
    // (tao lo emite en minimize y restore aunque el foco no cambie).
    tauri.minimized = false;
    await act(async () => {
      fireTauri("resize");
    });
    expect(classes()).not.toContain("app-sleep");
    expect(classes()).not.toContain("app-hidden");
  });

  it("onFocusChanged tambien reconcilia (refuerzo de la senal blur)", async () => {
    await act(async () => {
      renderProvider();
    });
    tauri.minimized = true;
    await act(async () => {
      fireTauri("focus");
    });
    expect(classes()).toContain("app-hidden");
  });

  it("watchdog: SIN ninguna senal de restauracion → despierta en <=1 s (y luego, cero IPC)", async () => {
    // Medido en vivo el 2026-10-03: la ventana se restauró pero las senales
    // (resize/focus) llegaron tarde o no llegaron y app-sleep quedo CLAVADO
    // con la ventana a la vista (bug real de la primera version del esquema).
    // El watchdog consulta IsIconic mientras este congelado: el despertar
    // no depende de que llegue evento alguno.
    vi.useFakeTimers();
    await act(async () => {
      renderProvider();
    });
    tauri.minimized = true;
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(classes()).toContain("app-hidden");
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(classes()).toContain("app-sleep");
    // Restaurada la ventana SIN disparar ni resize ni focus: solo el
    // watchdog puede verlo — y lo hace en su primer tick (<=1 s).
    tauri.minimized = false;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(classes()).not.toContain("app-sleep");
    expect(classes()).not.toContain("app-hidden");
    // Con la app viva el efecto del watchdog ya no existe: ni un IPC más.
    const calls = tauri.isMinCalls;
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(tauri.isMinCalls).toBe(calls);
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

  /**
   * Simula ocultar (hidden) o restaurar (visible) el documento.
   * Async: el paso «visible» reconcilia contra IsIconic (microtask) y hay
   * que drenarlo DENTRO de act() para no emitir warnings de React.
   */
  const setVisibility = async (value) => {
    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => value,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };

  it("minimizar → 'app-hidden' al instante (congelado t=0), sin 'app-sleep'", async () => {
    renderProvider();
    await setVisibility("hidden");
    expect(classes()).toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });

  it("15 s oculta → 'app-sleep' (antes de los 15 s solo pausa)", async () => {
    vi.useFakeTimers();
    renderProvider();
    await setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(14999);
    });
    expect(classes()).not.toContain("app-sleep");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(classes()).toContain("app-sleep");
  });

  it("restaurar tras el sueño → limpia app-sleep y app-hidden al instante", async () => {
    vi.useFakeTimers();
    renderProvider();
    await setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(classes()).toContain("app-sleep");
    await setVisibility("visible");
    expect(classes()).not.toContain("app-sleep");
    expect(classes()).not.toContain("app-hidden");
  });

  it("visible otra vez ANTES de 15 s → nunca llega a 'app-sleep'", async () => {
    vi.useFakeTimers();
    renderProvider();
    await setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(14000);
    });
    await setVisibility("visible");
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(classes()).not.toContain("app-sleep");
    expect(classes()).not.toContain("app-hidden");
  });

  it("con «Pausar efectos al ocultar» OFF → la ventana oculta no congela ni duerme", async () => {
    vi.useFakeTimers();
    localStorage.setItem(SW_SETTINGS_KEY, JSON.stringify({ pauseEffectsHidden: false }));
    renderProvider();
    await setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(classes()).not.toContain("app-hidden");
    expect(classes()).not.toContain("app-sleep");
  });

  it("expone visible/sleeping por contexto (LyricsView y usePlayer lo consumen)", async () => {
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
    await setVisibility("hidden");
    expect(probe().dataset.visible).toBe("false");
    expect(probe().dataset.sleeping).toBe("false");
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(probe().dataset.sleeping).toBe("true");
    await setVisibility("visible");
    expect(probe().dataset.sleeping).toBe("false");
  });
});

/** Sonda del contexto: refleja visible/sleeping en atributos de test. */
function PerfProbe() {
  const { visible, sleeping } = usePerformance();
  return (
    <div data-testid="perf-probe" data-visible={String(visible)} data-sleeping={String(sleeping)} />
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
