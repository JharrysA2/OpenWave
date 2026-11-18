import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invokeMock(...args) }));

import { useWindowChrome } from "./useWindowChrome";

const setUserAgent = (ua) => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
};

describe("useWindowChrome", () => {
  const originalUA = navigator.userAgent;

  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    setUserAgent(originalUA);
    delete window.__TAURI_INTERNALS__;
  });

  it("mantiene la barra personalizada fuera de Tauri", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    const { result } = renderHook(() => useWindowChrome());
    expect(result.current).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("oculta la barra personalizada en una instalación Linux", async () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    window.__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ customTitleBar: false, linux: true, installed: true });
    const { result } = renderHook(() => useWindowChrome());
    expect(result.current).toBe(false);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("window_environment"));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("conserva la barra en desarrollo Linux y en Windows", async () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    window.__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ customTitleBar: true, linux: true, installed: false });
    const { result } = renderHook(() => useWindowChrome());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
