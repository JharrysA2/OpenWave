import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBackendStatus } from "./useBackendStatus";
import { __resetHealth, checkHealth, markOffline, markOnline } from "../utils/backendHealth";

function okJson() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ status: "ok" }),
    text: () => Promise.resolve('{"status":"ok"}'),
  };
}

beforeEach(() => {
  __resetHealth();
});

afterEach(() => {
  __resetHealth();
  vi.unstubAllGlobals();
});

describe("useBackendStatus", () => {
  it("expone el estado inicial (online)", () => {
    const { result } = renderHook(() => useBackendStatus());

    expect(result.current.online).toBe(true);
    expect(result.current.checking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("re-renderiza cuando api.js marca el backend como caído", () => {
    const { result } = renderHook(() => useBackendStatus());

    act(() => {
      markOffline("ECONNREFUSED");
    });

    expect(result.current.online).toBe(false);
    expect(result.current.error).toBe("ECONNREFUSED");
  });

  it("re-renderiza al reconectar y cuenta la reconexión", () => {
    const { result } = renderHook(() => useBackendStatus());

    act(() => {
      markOffline("down");
    });
    act(() => {
      markOnline();
    });

    expect(result.current.online).toBe(true);
    expect(result.current.reconnects).toBe(1);
  });

  it("refleja el resultado de checkHealth", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson()));
    const { result } = renderHook(() => useBackendStatus());

    act(() => {
      markOffline("down");
    });

    await act(async () => {
      await checkHealth();
    });

    await waitFor(() => expect(result.current.online).toBe(true));
    expect(result.current.lastCheckAt).toBeGreaterThan(0);
  });
});
