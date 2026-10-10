import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// ── Helper: componente que lanza error ────────────────────────────────────────

const ThrowError = ({ message = "Test error" }) => {
  throw new Error(message);
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Silencia el console.error de React (errores capturados) y el nuestro
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Render normal ────────────────────────────────────────────────────────────

  it("should render children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("should render multiple children when no error", () => {
    render(
      <ErrorBoundary>
        <span data-testid="child-1">First</span>
        <span data-testid="child-2">Second</span>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child-1")).toBeInTheDocument();
    expect(screen.getByTestId("child-2")).toBeInTheDocument();
  });

  // ── Captura de errores → fallback amigable (sin stacks rojos) ───────────────

  it("should catch errors and display the friendly fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Something went wrong" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    // El mensaje crudo del error NO se muestra al usuario
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("should NOT render raw stack traces in the DOM", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Stack trace test" />
      </ErrorBoundary>,
    );

    // Cero <pre> ni mensajes crudos en el DOM: el detalle va a consola
    const pres = document.querySelectorAll("pre");
    expect(pres.length).toBe(0);
    expect(screen.queryByText(/Stack trace test/)).not.toBeInTheDocument();
  });

  it("should log the technical detail to console only", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Custom error message" />
      </ErrorBoundary>,
    );

    // componentDidCatch manda el detalle técnico a consola ( diagnóstico )
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("[OpenWave] Runtime error:");
    expect(logged).toContain("Custom error message");
  });

  it("should offer a reload button that triggers window.location.reload", () => {
    const reloadMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock },
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByTestId("error-boundary-reload"));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  // ── Sin error después de error ──────────────────────────────────────────────

  it("should maintain error state after catching (no recovery)", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError message="First error" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();

    // Rerender con hijos normales — el boundary sigue en estado de error
    rerender(
      <ErrorBoundary>
        <div data-testid="normal-child">Normal</div>
      </ErrorBoundary>,
    );

    expect(screen.queryByTestId("normal-child")).not.toBeInTheDocument();
    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
  });

  // ── Nested ErrorBoundary ──────────────────────────────────────────────────

  it("should not interfere with nested error boundaries", () => {
    render(
      <ErrorBoundary>
        <div>
          <span data-testid="outer-child">Outer works</span>
          <ErrorBoundary>
            <ThrowError message="Inner error" />
          </ErrorBoundary>
        </div>
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("outer-child")).toBeInTheDocument();
    expect(screen.getByText("Outer works")).toBeInTheDocument();
    // El inner muestra SU fallback; el outer sigue vivo
    expect(screen.getAllByTestId("error-boundary-fallback").length).toBe(1);
  });
});
