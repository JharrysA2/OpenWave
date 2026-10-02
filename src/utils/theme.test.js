import { describe, it, expect } from "vitest";
import * as theme from "./theme";
import {
  GLASS,
  COLORS,
  RADIUS,
  withAlpha,
  getLuminance,
  safeAccentText,
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

  it("solo hay blur donde hay movimiento detrás o es modal (player sí; shell no)", () => {
    // Regla de presupuesto (docs/PERFORMANCE.md §1/§7): backdrop-filter solo
    // donde hay movimiento real por detrás (player: scroll de vistas y
    // karaoke) o en superficies de modal (sheet/settings). Las superficies
    // estáticas de la shell (sidebar/titleBar/searchbar) no llevan: detrás
    // no pasa ni se anima nada, y el sidebar lo tapaba además con su
    // gradiente opaca. Regresión = reintroducir blur puro coste invisible.
    expect(GLASS.player.backdropFilter).toBe("blur(10px)");
    expect(GLASS.player.WebkitBackdropFilter).toBe("blur(10px)");
    expect(GLASS.player.background).toContain(".18"); // translúcido, no sólido
    expect(GLASS.player.backdropFilter).not.toContain("saturate");
    expect(GLASS.sidebar.backdropFilter).toBeUndefined();
    expect(GLASS.sidebar.WebkitBackdropFilter).toBeUndefined();
    expect(GLASS.titleBar.backdropFilter).toBeUndefined();
    expect(GLASS.titleBar.WebkitBackdropFilter).toBeUndefined();
    expect(GLASS.searchbar.backdropFilter).toBeUndefined();
    expect(GLASS.searchbar.WebkitBackdropFilter).toBeUndefined();
  });

  it("btn y card siguen sin backdrop-filter (hover/grid sí costaban GPU)", () => {
    // El hover de btn escalaba su región (re-blur por frame) y las grids de
    // card acumulaban área — ahí el backdrop sí costaba.
    expect(GLASS.btn.backdropFilter).toBeUndefined();
    expect(GLASS.card.backdropFilter).toBeUndefined();
  });

  it("los modales difuminan con su cristal (blur(40px)); popup transitorio en 6px", () => {
    // Presupuesto de overlays (docs/PERFORMANCE.md §7): la superficie de
    // cristal de los MODALES (sheet =12 hojas, settings = panel de Ajustes)
    // difumina con `blur(40px)` — el desenfoque visible que el diseño pide
    // y que el congelado de `overlay-open` mantiene ≈0 en reposo. Sin
    // saturate (pasada extra de color). El popup (toast/volumen/crossfade),
    // que no es modal y es transitorio, se queda en el mínimo `blur(6px)`.
    for (const key of ["sheet", "settings"]) {
      expect(`${key}: ${GLASS[key].backdropFilter ?? "undefined"}`).toBe(`${key}: blur(40px)`);
      expect(`${key} webkit: ${GLASS[key].WebkitBackdropFilter ?? "undefined"}`).toBe(
        `${key} webkit: blur(40px)`,
      );
      expect(GLASS[key].backdropFilter).not.toContain("saturate");
    }
    expect(`${GLASS.popup.backdropFilter ?? "undefined"}`).toBe("blur(6px)");
    expect(`${GLASS.popup.WebkitBackdropFilter ?? "undefined"}`).toBe("blur(6px)");
    expect(GLASS.popup.backdropFilter).not.toContain("saturate");
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
    expect(sidebarBgGradient()).toContain("--neon");
  });
});
