import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useOverlayLayer } from "./useOverlayLayer";

// Sonda mínima: solo monta el hook con el `active` que le pases.
function Probe({ active = true }) {
  useOverlayLayer(active);
  return <div data-testid="probe" />;
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

  it("el pulse del home lleva la clase que pausa html.overlay-open", () => {
    // Si alguien quita className="now-playing-pulse", el pulso vuelve a
    // repintar la iGPU cada 1.5s con el modal abierto.
    const home = readProjectFile("src/components/HomeView.jsx");
    expect(home).toContain('className="now-playing-pulse"');
  });
});
