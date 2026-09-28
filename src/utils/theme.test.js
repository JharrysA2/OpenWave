import { describe, it, expect } from "vitest";
import * as theme from "./theme";
import {
  GLASS,
  COLORS,
  RADIUS,
  withAlpha,
  getLuminance,
  safeAccentText,
  vignetteOverlay,
  sidebarBgGradient,
} from "./theme";

describe("theme — materiales translúcidos", () => {
  it("exporta UN solo sistema de materiales: GLASS", () => {
    expect(theme.GLASS).toBeDefined();
    // El duplicado `MATERIALS` (mismos usos, valores distintos, 0 consumidores)
    // fue eliminado: no debe volver a colarse.
    expect(theme.MATERIALS).toBeUndefined();
  });

  it("GLASS cubre todas las superficies de la app", () => {
    for (const surface of [
      "player",
      "sidebar",
      "navItem",
      "btn",
      "btnHover",
      "btnHoverSoft",
      "searchbar",
      "card",
      "cardHover",
      "sheet",
      "popup",
      "titleBar",
    ]) {
      expect(GLASS[surface], `falta GLASS.${surface}`).toBeDefined();
    }
  });

  it("los materiales con acento son funciones del color", () => {
    expect(GLASS.navItemActive("#ff0000").background).toContain("#ff0000");
    expect(GLASS.playBtn("#00ff00").background).toContain("#00ff00");
  });

  it("player con liquid glass completo y sidebar/titleBar con blur ligero", () => {
    // Atribución fina (comparación A−C con scripts/measure-perf.ps1): el
    // 1.80% GPU de Letras era la cadena filter:blur() de la capa de fondo,
    // NO los backdrops (medidos ≈0: el compositing cachea los frosted
    // estáticos). Regresión = volver a quitar el glass sin necesidad.
    expect(GLASS.player.backdropFilter).toBe("blur(10px)");
    expect(GLASS.player.WebkitBackdropFilter).toBe("blur(10px)");
    expect(GLASS.player.background).toContain(".18"); // translúcido, no sólido
    expect(GLASS.sidebar.backdropFilter).toBe("blur(8px)");
    expect(GLASS.sidebar.WebkitBackdropFilter).toBe("blur(8px)");
    expect(GLASS.titleBar.backdropFilter).toBe("blur(8px)");
    expect(GLASS.titleBar.WebkitBackdropFilter).toBe("blur(8px)");
    // Sin saturate en superficies permanentes (pase extra de color)
    expect(GLASS.player.backdropFilter).not.toContain("saturate");
    expect(GLASS.sidebar.backdropFilter).not.toContain("saturate");
  });

  it("btn y card siguen sin backdrop-filter (hover/grid sí costaban GPU)", () => {
    // El hover de btn escalaba su región (re-blur por frame) y las grids de
    // card acumulaban área — ahí el backdrop sí costaba.
    expect(GLASS.btn.backdropFilter).toBeUndefined();
    expect(GLASS.card.backdropFilter).toBeUndefined();
  });

  it("los sheets/modales efímeros conservan backdrop-filter", () => {
    expect(GLASS.sheet.backdropFilter).toContain("blur");
  });
});

describe("theme — tokens base", () => {
  it("RADIUS expone el radio signature y los overrides de componente", () => {
    expect(RADIUS.default).toBe("12px");
    expect(RADIUS.card).toBe("14px");
    expect(RADIUS.full).toBe("9999px");
  });

  it("COLORS mantiene la paleta de superficies y texto", () => {
    expect(typeof COLORS.textPrimary).toBe("string");
    expect(typeof COLORS.surface).toBe("string");
    expect(typeof COLORS.progressTrack).toBe("string");
    expect(typeof COLORS.progressTime).toBe("string");
  });

  it("withAlpha concatena el canal alfa en hex", () => {
    expect(withAlpha("#a78bfa", "22")).toBe("#a78bfa22");
  });
});

describe("theme — helpers de color", () => {
  it("getLuminance sigue la fórmula WCAG", () => {
    expect(getLuminance("#000000")).toBe(0);
    expect(getLuminance("#ffffff")).toBeCloseTo(1, 10);
    // El acento por defecto de la app es claramente oscuro (overlay pleno)
    expect(getLuminance("#a78bfa")).toBeLessThan(0.55);
    // Crema casi blanca → overlay mínimo (ver useDynamicTheme)
    expect(getLuminance("#ffeedd")).toBeGreaterThan(0.85);
  });

  it("safeAccentText aclara colores demasiado oscuros sobre fondo negro", () => {
    const dark = "#3a1a5e";
    expect(getLuminance(dark)).toBeLessThan(0.35);
    expect(getLuminance(safeAccentText(dark))).toBeGreaterThan(getLuminance(dark));
  });

  it("safeAccentText deja intactos los acentos ya legibles", () => {
    expect(safeAccentText("#ffd700")).toBe("#ffd700");
    expect(safeAccentText("no-hex")).toBe("no-hex");
  });

  it("los gradientes usan la CSS var --neon (tema dinámico)", () => {
    expect(vignetteOverlay()).toContain("--neon");
    expect(sidebarBgGradient()).toContain("--neon");
  });
});
