import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusState } from "./StatusState";
import { renderWithSettings } from "../test-utils";
import { DEFAULT_ERROR_CODE, ERROR_CODES } from "../utils/errorCodes";

describe("StatusState", () => {
  // ── Textos del catálogo (es) ───────────────────────────────────────────

  it("muestra título y mensaje del código recibido", () => {
    render(<StatusState code="E-CNX-02" />);
    expect(screen.getByText(ERROR_CODES["E-CNX-02"].es.title)).toBeInTheDocument();
    expect(screen.getByText(ERROR_CODES["E-CNX-02"].es.message)).toBeInTheDocument();
  });

  it("sin código usa el por defecto (E-UI-00): SIEMPRE hay un código que reportar", () => {
    render(<StatusState />);
    expect(screen.getByTestId("error-code")).toHaveTextContent(DEFAULT_ERROR_CODE);
    expect(screen.getByText(ERROR_CODES[DEFAULT_ERROR_CODE].es.title)).toBeInTheDocument();
  });

  it("un código desconocido cae al por defecto sin romper", () => {
    render(<StatusState code="E-XXX-99" />);
    expect(screen.getByTestId("error-code")).toHaveTextContent("E-XXX-99");
  });

  it("respeta título y mensaje propios (p.ej. 'No se pudo cargar el artista')", () => {
    render(<StatusState code="E-CNX-01" title="No se pudo cargar el artista" message="boom" />);
    expect(screen.getByText("No se pudo cargar el artista")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    // …pero el código sigue siendo visible
    expect(screen.getByTestId("error-code")).toHaveTextContent("E-CNX-01");
  });

  it("usa los textos del idioma activo (en)", () => {
    localStorage.setItem("sw_settings_v1", JSON.stringify({ language: "en" }));
    renderWithSettings(<StatusState code="E-CNX-01" />);
    expect(screen.getByText(ERROR_CODES["E-CNX-01"].en.title)).toBeInTheDocument();
    localStorage.clear();
  });

  // ── Acciones ───────────────────────────────────────────────────────────

  it("el botón Reintentar llama a onRetry", () => {
    const onRetry = vi.fn();
    render(<StatusState code="E-CNX-01" onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId("status-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("sin onRetry no hay botón de reintento", () => {
    render(<StatusState code="E-CNX-01" />);
    expect(screen.queryByTestId("status-retry")).not.toBeInTheDocument();
  });

  it("la acción secundaria (p.ej. 'Volver') llama a onAction", () => {
    const onAction = vi.fn();
    render(<StatusState code="E-CNX-01" actionLabel="Volver" onAction={onAction} />);
    fireEvent.click(screen.getByText("Volver"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("es un estado accesible (role=status, aria-live)", () => {
    render(<StatusState code="E-CNX-01" />);
    const status = screen.getByTestId("status-state");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("el código usa cifras tabulares para que no 'baile'", () => {
    render(<StatusState code="E-CNX-01" />);
    expect(screen.getByTestId("error-code").style.fontVariantNumeric).toBe("tabular-nums");
  });
});
