import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { ConnectionBanner } from "./ConnectionBanner";
import { renderWithSettings } from "../test-utils";
import { __resetHealth, checkHealth, markOffline, markOnline } from "../utils/backendHealth";

beforeEach(() => {
  __resetHealth();
});

afterEach(() => {
  __resetHealth();
  vi.unstubAllGlobals();
});

describe("ConnectionBanner", () => {
  it("no renderiza nada mientras hay conexión", () => {
    renderWithSettings(<ConnectionBanner />);
    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
  });

  it("muestra el aviso cuando el backend está caído", () => {
    markOffline("ECONNREFUSED");
    renderWithSettings(<ConnectionBanner />);

    const banner = screen.getByTestId("connection-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Sin conexión con el servidor");
    expect(banner).toHaveAttribute("role", "status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    // Liquid Glass del player (petición): vidrio translúcido con blur(10px)
    // (detrás pasan las vistas al hacer scroll), letras blancas y sin
    // contorno de ningún color.
    expect(banner.style.backdropFilter).toBe("blur(10px)");
    expect(banner.style.background.replace(/\s/g, "")).toContain("rgba(10,10,18,0.18)");
    expect(getComputedStyle(banner).color).toBe("rgb(255, 255, 255)");
  });

  it("expone el motivo del fallo en el tooltip", () => {
    markOffline("Timeout");
    renderWithSettings(<ConnectionBanner />);
    expect(screen.getByTestId("connection-banner")).toHaveAttribute("title", "Timeout");
  });

  it("muestra el código de error reportable junto al aviso", () => {
    markOffline("ECONNREFUSED");
    renderWithSettings(<ConnectionBanner />);
    expect(screen.getByTestId("connection-code")).toHaveTextContent("E-CNX-01");
  });

  it("el código del tooltip de timeout es E-CNX-02", () => {
    markOffline("Timeout");
    renderWithSettings(<ConnectionBanner />);
    expect(screen.getByTestId("connection-code")).toHaveTextContent("E-CNX-02");
  });

  it("cambia a 'reconectando' mientras hay un chequeo en vuelo", async () => {
    let resolveFetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
    );

    markOffline("down");

    let pending;
    act(() => {
      pending = checkHealth();
    });

    renderWithSettings(<ConnectionBanner />);
    expect(screen.getByTestId("connection-banner")).toHaveTextContent("Reconectando");

    await act(async () => {
      resolveFetch({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ status: "ok" }),
      });
      await pending;
    });

    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
  });

  it("desaparece cuando el backend se recupera", async () => {
    markOffline("down");
    renderWithSettings(<ConnectionBanner />);
    expect(screen.getByTestId("connection-banner")).toBeInTheDocument();

    await act(async () => {
      markOnline();
    });

    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
  });
});
