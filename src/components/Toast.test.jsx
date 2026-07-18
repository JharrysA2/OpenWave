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

  // ── Estilos por tipo ────────────────────────────────────────────────────────

  it("should apply error background color for error type toasts", () => {
    render(<Toasts toasts={[errorToast]} />);
    const toastDiv = screen.getByText("Error crítico").closest("div");
    expect(toastDiv).toHaveStyle({ background: "rgba(69,10,10,.88)" });
  });

  it("should apply success background color for success type toasts", () => {
    render(<Toasts toasts={[successToast]} />);
    const toastDiv = screen.getByText("Operación exitosa").closest("div");
    expect(toastDiv).toHaveStyle({ background: "rgba(5,46,22,.88)" });
  });

  it("should apply info background color for info type toasts", () => {
    render(<Toasts toasts={[infoToast]} />);
    const toastDiv = screen.getByText("Información").closest("div");
    // Info toasts use GLASS.popup gradient background
    expect(toastDiv.style.background).toContain("linear-gradient");
  });

  it("should apply error text color for error type toasts", () => {
    render(<Toasts toasts={[errorToast]} />);
    const toastDiv = screen.getByText("Error crítico").closest("div");
    expect(toastDiv).toHaveStyle({ color: "#fca5a5" });
  });

  it("should apply success text color for success type toasts", () => {
    render(<Toasts toasts={[successToast]} />);
    const toastDiv = screen.getByText("Operación exitosa").closest("div");
    expect(toastDiv).toHaveStyle({ color: "#86efac" });
  });

  it("should apply default text color for info type toasts", () => {
    render(<Toasts toasts={[infoToast]} />);
    const toastDiv = screen.getByText("Información").closest("div");
    expect(toastDiv).toHaveStyle({ color: "rgba(255,255,255,.92)" });
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
