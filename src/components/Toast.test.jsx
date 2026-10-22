import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Toasts } from "./Toast";

// ── Sample toasts ─────────────────────────────────────────────────────────────

const infoToast = { id: 1, msg: "Información", type: "info" };
const errorToast = { id: 2, msg: "Error crítico", type: "error" };
const successToast = { id: 3, msg: "Operación exitosa", type: "success" };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Toasts", () => {
  // ── Render vacío ────────────────────────────────────────────────────────────

  it("should render an empty container when toasts array is empty", () => {
    const { container } = render(<Toasts toasts={[]} />);
    const outerDiv = container.firstChild;
    expect(outerDiv).toBeInTheDocument();
    expect(outerDiv.childNodes.length).toBe(0);
  });

  // ── Render con toasts ───────────────────────────────────────────────────────

  it("should render a single info toast with its message", () => {
    render(<Toasts toasts={[infoToast]} />);
    expect(screen.getByText("Información")).toBeInTheDocument();
  });

  it("should render multiple toasts simultaneously", () => {
    render(<Toasts toasts={[infoToast, errorToast, successToast]} />);
    expect(screen.getByText("Información")).toBeInTheDocument();
    expect(screen.getByText("Error crítico")).toBeInTheDocument();
    expect(screen.getByText("Operación exitosa")).toBeInTheDocument();
  });

  // ── Estilos (blanco y negro, sin contorno) ────────────────────────────────

  it("should use the same neutral liquid-glass background for every toast type", () => {
    render(<Toasts toasts={[infoToast, errorToast, successToast]} />);
    const backgrounds = ["Información", "Error crítico", "Operación exitosa"].map(
      (msg) => screen.getByText(msg).closest("div").style.background,
    );
    for (const bg of backgrounds) {
      // Material del player: color plano translúcido, sin gradiente
      // (jsdom normaliza el color: espacios y "0.18")
      expect(bg.replace(/\s/g, "")).toContain("rgba(10,10,18,0.18)");
    }
    // Los tres tipos comparten EXACTAMENTE el mismo estilo
    expect(backgrounds[0]).toBe(backgrounds[1]);
    expect(backgrounds[1]).toBe(backgrounds[2]);
  });

  it("should never tint a success toast green (todo en blanco y negro)", () => {
    render(<Toasts toasts={[successToast]} />);
    const toastDiv = screen.getByText("Operación exitosa").closest("div");
    expect(toastDiv.style.background).not.toContain("5,46,22");
    expect(toastDiv.style.background).not.toContain("74,222,128");
    expect(toastDiv).toHaveStyle({ color: "#ffffff" });
  });

  it("should render error toasts with white text and without any border", () => {
    render(<Toasts toasts={[errorToast]} />);
    const toastDiv = screen.getByText("Error crítico").closest("div");
    expect(toastDiv).toHaveStyle({ color: "#ffffff" });
    // jsdom vacía la declaración cuando el borde vale "none": cssText sin
    // "border:" equivale a sin contorno (un borde real, "1px solid …",
    // SÍ quedaría registrado).
    expect(toastDiv.style.border).toBe("");
    expect(toastDiv.style.cssText).not.toContain("border:");
    // Ni rastro de rojos antiguos
    expect(toastDiv.style.background).not.toContain("69,10,10");
  });

  it("should render info toasts with white text like every other type", () => {
    render(<Toasts toasts={[infoToast]} />);
    const toastDiv = screen.getByText("Información").closest("div");
    expect(toastDiv).toHaveStyle({ color: "#ffffff" });
  });

  // ── Orden de render ────────────────────────────────────────────────────────

  it("should render toasts in the order they appear in the array", () => {
    const { container } = render(<Toasts toasts={[infoToast, errorToast]} />);
    const outerDiv = container.firstChild;
    expect(outerDiv.childNodes[0].textContent).toBe("Información");
    expect(outerDiv.childNodes[1].textContent).toBe("Error crítico");
  });

  // ── Contenedor externo ──────────────────────────────────────────────────────

  it("should render the outer container with fixed positioning", () => {
    const { container } = render(<Toasts toasts={[infoToast]} />);
    const outerDiv = container.firstChild;
    expect(outerDiv).toHaveStyle({ position: "fixed", bottom: "90px", zIndex: 9999 });
  });

  // ── Unicidad de key ─────────────────────────────────────────────────────────

  it("should use toast id as React key", () => {
    const { container } = render(<Toasts toasts={[infoToast, { ...infoToast, id: 1 }]} />);
    // Duplicate keys should still render both but React will warn
    const outerDiv = container.firstChild;
    expect(outerDiv.childNodes.length).toBe(2);
  });

  // ── Mensajes largos ─────────────────────────────────────────────────────────

  it("should render long messages without truncation", () => {
    const longMsg = "A".repeat(200);
    render(<Toasts toasts={[{ id: 1, msg: longMsg, type: "info" }]} />);
    expect(screen.getByText(longMsg)).toBeInTheDocument();
  });
});
