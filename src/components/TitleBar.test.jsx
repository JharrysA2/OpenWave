import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Factory inline por el hoisting de vi.mock.
vi.mock("../utils/windowControls", () => ({
  winCtrl: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
}));

import { winCtrl } from "../utils/windowControls";
import { TitleBar } from "./TitleBar";

describe("TitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("es la zona de arrastre y muestra la marca", () => {
    const { container } = render(<TitleBar />);
    const bar = container.firstChild;
    expect(bar).toHaveAttribute("data-tauri-drag-region");
    expect(bar).toHaveClass("app-titlebar");
    expect(bar).toHaveTextContent("OpenWave");
    expect(screen.getByTestId("titlebar-logo")).toBeInTheDocument();
  });

  it("los tres controles llaman a la ventana", () => {
    render(<TitleBar />);
    fireEvent.click(screen.getByTitle("Minimizar"));
    fireEvent.click(screen.getByTitle("Maximizar"));
    fireEvent.click(screen.getByTitle("Cerrar"));
    expect(winCtrl.minimize).toHaveBeenCalledTimes(1);
    expect(winCtrl.maximize).toHaveBeenCalledTimes(1);
    expect(winCtrl.close).toHaveBeenCalledTimes(1);
  });

  it("los iconos van a trazo (sin relleno) y con nombre accesible", () => {
    render(<TitleBar />);
    ["Minimizar", "Maximizar", "Cerrar"].forEach((title) => {
      const btn = screen.getByTitle(title);
      expect(btn).toHaveAttribute("aria-label", title);
      const svg = btn.querySelector("svg");
      expect(svg).toHaveAttribute("fill", "none");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("1.3");
    });
  });

  it("no difumina: no hay backdrop-filter en la barra", () => {
    const { container } = render(<TitleBar />);
    expect(container.innerHTML).not.toMatch(/backdrop-filter|backdropFilter/);
  });
});
