import React from "react";
import { render, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useOverlayLayer, useOverlayActive } from "./useOverlayLayer";

// Sonda mínima: solo monta el hook con el `active` que le pases.
function Probe({ active = true }) {
  useOverlayLayer(active);
  return <div data-testid="probe" />;
}

// Sonda con el estado React que consumen PlayerBar y el reloj de karaoke.
function ActiveProbe({ active = true }) {
  useOverlayLayer(active);
  const overlayActive = useOverlayActive();
  return <span data-testid="active">{String(overlayActive)}</span>;
}

const isOverlayOpen = () => document.documentElement.classList.contains("overlay-open");

// Los tests corren con cwd en la raíz del proyecto (npm test)
const readProjectFile = (rel) => readFileSync(join(process.cwd(), rel), "utf8");

describe("useOverlayLayer — pausa de animaciones detrás de un overlay", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("overlay-open");
  });

  afterEach(() => {
    document.documentElement.classList.remove("overlay-open");
  });

  it("añade html.overlay-open al montar y lo quita al desmontar", () => {
    const { unmount } = render(<Probe />);
    expect(isOverlayOpen()).toBe(true);
    unmount();
    expect(isOverlayOpen()).toBe(false);
  });

  it("no toca la clase si el overlay está inactivo", () => {
    const { unmount } = render(<Probe active={false} />);
    expect(isOverlayOpen()).toBe(false);
    unmount();
    expect(isOverlayOpen()).toBe(false);
  });

  it("alterna con `active` sin duplicar (cerrado → abierto → cerrado)", () => {
    const { rerender, unmount } = render(<Probe active={false} />);
    expect(isOverlayOpen()).toBe(false);
    rerender(<Probe active />);
    expect(isOverlayOpen()).toBe(true);
    rerender(<Probe active={false} />);
    expect(isOverlayOpen()).toBe(false);
    rerender(<Probe active />);
    expect(isOverlayOpen()).toBe(true);
    unmount();
    expect(isOverlayOpen()).toBe(false);
  });

  it("ref-count: solo lo quita cuando el ÚLTIMO overlay se cierra", () => {
    // Caso real: panel de Ajustes + modal de letras montados a la vez.
    const first = render(<Probe />);
    const second = render(<Probe />);
    expect(isOverlayOpen()).toBe(true);

    first.unmount();
    expect(isOverlayOpen()).toBe(true); // aún queda uno abierto

    second.unmount();
    expect(isOverlayOpen()).toBe(false);
  });

  it("index.html pausa las animaciones infinitas mientras hay overlay", () => {
    const html = readProjectFile("index.html");
    // Las tres fuentes de repintado continuo detrás de los modales: shimmer
    // de skeletons, punto de conexión y pulse del "sonando ahora".
    expect(html).toContain("html.overlay-open .skeleton,");
    expect(html).toContain("html.overlay-open .connection-dot,");
    expect(html).toContain("html.overlay-open .now-playing-pulse");
    expect(html).toMatch(/html\.overlay-open[^}]*animation-play-state:\s*paused\s*!important/);
  });

  it("index.html apaga los blurs de la shell mientras hay overlay", () => {
    // Superficies con backdrop-filter que quedan DETRÁS del overlay: sin
    // esta regla cada repintado de detrás (progreso a 5 Hz, karaoke) les
    // cuesta un re-blur por frame para un resultado tapado por el scrim.
    const html = readProjectFile("index.html");
    for (const sel of [".app-sidebar", ".app-titlebar", ".app-searchbar", ".player-bar"]) {
      expect(html).toContain(`html.overlay-open ${sel}`);
    }
    expect(html).toMatch(
      /html\.overlay-open \.app-sidebar,[^}]*backdrop-filter:\s*none\s*!important/,
    );
    expect(html).toMatch(
      /html\.overlay-open \.player-bar \{\s*backdrop-filter:\s*none\s*!important/,
    );
  });

  it("las superficies de la shell llevan la clase que apaga html.overlay-open", () => {
    // Si alguien quita la clase, la regla CSS no encuentra el elemento y el
    // blur de la shell vuelve a re-ejecutarse bajo cada overlay.
    expect(readProjectFile("src/components/Sidebar.jsx")).toContain('className="app-sidebar"');
    expect(readProjectFile("src/components/TitleBar.jsx")).toContain('className="app-titlebar"');
    expect(readProjectFile("src/components/SearchBar.jsx")).toContain('className="app-searchbar"');
    expect(readProjectFile("src/components/PlayerBar.jsx")).toContain('className="player-bar"');
  });

  it("el pulse del home lleva la clase que pausa html.overlay-open", () => {
    // Si alguien quita className="now-playing-pulse", el pulso vuelve a
    // repintar la iGPU cada 1.5s con el modal abierto.
    const home = readProjectFile("src/components/HomeView.jsx");
    expect(home).toContain('className="now-playing-pulse"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  useOverlayActive — congela los repaints programados bajo el overlay
// ═══════════════════════════════════════════════════════════════════════════

describe("useOverlayActive — estado React del overlay", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("overlay-open");
  });

  afterEach(() => {
    document.documentElement.classList.remove("overlay-open");
  });

  it("false sin overlay, true mientras está montado y false al cerrarlo", () => {
    const { getByTestId, rerender, unmount } = render(<ActiveProbe active={false} />);
    expect(getByTestId("active").textContent).toBe("false");

    rerender(<ActiveProbe active />);
    expect(getByTestId("active").textContent).toBe("true");
    expect(isOverlayOpen()).toBe(true);

    rerender(<ActiveProbe active={false} />);
    expect(getByTestId("active").textContent).toBe("false");
    expect(isOverlayOpen()).toBe(false);
    unmount();
  });

  it("ref-count: sigue true mientras quede UN overlay montado", () => {
    // Caso real: panel de Ajustes + modal de letras a la vez — el progreso
    // del player no debe reanudarse hasta que no se cierre el último.
    const first = render(<ActiveProbe />);
    const second = render(<ActiveProbe />);
    const active = (result) => within(result.container).getByTestId("active").textContent;
    expect(active(first)).toBe("true");
    expect(active(second)).toBe("true");

    first.unmount();
    expect(active(second)).toBe("true");
    expect(isOverlayOpen()).toBe(true);

    second.unmount();
    expect(isOverlayOpen()).toBe(false);
  });
});
