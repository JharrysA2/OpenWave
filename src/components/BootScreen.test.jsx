import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BootScreen } from "./BootScreen";
import { __resetHealth, checkHealth, getHealthState } from "../utils/backendHealth";

/** Respuesta 200 de /health (misma forma que la usa api/health-check). */
function okHealth() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ status: "ok" }),
    text: () => Promise.resolve("{}"),
  };
}

beforeEach(() => {
  __resetHealth();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  __resetHealth();
  vi.unstubAllGlobals();
});

describe("BootScreen", () => {
  it("muestra 'Iniciando OpenWave…' mientras el primer chequeo está en vuelo", () => {
    // __resetHealth deja booting=true (arranque recién empezado)
    render(<BootScreen />);
    expect(screen.getByTestId("boot-screen")).toBeInTheDocument();
    expect(screen.getByText("Iniciando OpenWave…")).toBeInTheDocument();
    expect(screen.queryByTestId("status-state")).not.toBeInTheDocument();
  });

  it("con el backend caído muestra error + código reportable + acciones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await act(async () => {
      await checkHealth(); // primer chequeo → falla
    });
    expect(getHealthState().booting).toBe(false);

    render(<BootScreen />);
    expect(screen.getByText("Sin conexión con el servidor")).toBeInTheDocument();
    expect(screen.getByTestId("error-code")).toHaveTextContent("E-CNX-01");
    expect(screen.getByTestId("status-retry")).toBeInTheDocument();
    expect(screen.getByText("Continuar sin conexión")).toBeInTheDocument();
    expect(screen.queryByText(/Iniciando OpenWave/)).not.toBeInTheDocument();
  });

  it("Reintentar vuelve a consultar el backend y, si responde, sale sola", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("down")));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      await checkHealth();
    });

    render(<BootScreen />);
    expect(screen.getByTestId("error-code")).toHaveTextContent("E-CNX-01");

    // El backend "vuelve" → el reintento debe detectarlo
    fetchMock.mockImplementation(() => Promise.resolve(okHealth()));
    await act(async () => {
      fireEvent.click(screen.getByTestId("status-retry"));
    });

    expect(getHealthState().online).toBe(true);
    // Fade-out (~320 ms) y desmontaje: no queda tapando la app
    await waitFor(() => expect(screen.queryByTestId("boot-screen")).not.toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it("'Continuar sin conexión' cierra la pantalla y deja usar la app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("down"))),
    );
    await act(async () => {
      await checkHealth();
    });

    render(<BootScreen />);
    fireEvent.click(screen.getByText("Continuar sin conexión"));

    await waitFor(() => expect(screen.queryByTestId("boot-screen")).not.toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(getHealthState().online).toBe(false);
  });

  it("si el backend ya respondió, la pantalla se desvanece sola", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(okHealth())),
    );
    await act(async () => {
      await checkHealth();
    });

    render(<BootScreen />);
    // Se retira en cuanto termina el fade-out (nunca queda bloqueando)
    await waitFor(() => expect(screen.queryByTestId("boot-screen")).not.toBeInTheDocument(), {
      timeout: 2000,
    });
  });
});
