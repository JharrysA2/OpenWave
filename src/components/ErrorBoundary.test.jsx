import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// ── Helper: componente que lanza error ────────────────────────────────────────

const ThrowError = ({ message = "Test error" }) => {
  throw new Error(message);
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  // ── Render normal ───────────────────────────────────────────────────────────

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

  // ── Captura de errores ─────────────────────────────────────────────────────

  it("should catch errors and display error UI", () => {
    // Suppress console.error from React during this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError message="Something went wrong" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Runtime Error Caught:")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("should display the error stack trace when available", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError message="Stack trace test" />
      </ErrorBoundary>,
    );

    // The stack trace should be rendered in the second <pre> element
    const pres = screen.getAllByRole("generic").filter((el) => el.tagName === "PRE");
    expect(pres.length).toBeGreaterThanOrEqual(2);

    consoleSpy.mockRestore();
  });

  it("should show fallback UI for any thrown error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError message="Custom error message" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom error message")).toBeInTheDocument();
    expect(screen.getByText("Runtime Error Caught:")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  // ── Sin error después de error ──────────────────────────────────────────────

  it("should maintain error state after catching (no recovery)", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError message="First error" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("First error")).toBeInTheDocument();

    // Rerender with normal children — ErrorBoundary should still show error
    rerender(
      <ErrorBoundary>
        <div data-testid="normal-child">Normal</div>
      </ErrorBoundary>,
    );

    expect(screen.queryByTestId("normal-child")).not.toBeInTheDocument();
    expect(screen.getByText("First error")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  // ── Nested ErrorBoundary ──────────────────────────────────────────────────

  it("should not interfere with nested error boundaries", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
    expect(screen.getByText("Inner error")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
