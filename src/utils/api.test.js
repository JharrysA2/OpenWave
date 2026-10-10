import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./api";

/**
 * api.get — fallback offline (B7): si el fetch falla por RED (status 0),
 * se sirve la última respuesta conocida aunque el TTL haya expirado, en
 * vez de lanzar error — así la app queda navegable sin conexión. Los
 * 4xx/5xx sí se propagan: el servidor respondió y no tiene esa cosa.
 */

function jsonResponse(data) {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => data,
  };
}

function httpErrorResponse(status) {
  return {
    ok: false,
    status,
    headers: { get: () => "text/plain" },
    text: async () => `error ${status}`,
  };
}

beforeEach(() => {
  api.clearCache();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ n: 1 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api.get — fallback a caché caducada cuando el backend cae", () => {
  it("sirve la caché CADUCADA si el fetch falla por red", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    // 1ª llamada OK → cachea
    const first = await api.get("/stale/one");
    expect(first).toEqual({ n: 1 });

    // TTL (5 min) expirado + backend inaccesible → respuesta vieja, no error
    vi.setSystemTime(new Date("2026-01-01T10:10:00Z"));
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const stale = await api.get("/stale/one");
    expect(stale).toEqual({ n: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("propaga el error de red (status 0) si NO hay caché previa", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.get("/stale/never")).rejects.toMatchObject({ status: 0 });
  });

  it("NO usa la caché como fallback ante un 500 (el servidor respondió)", async () => {
    await api.get("/stale/two"); // cachea { n: 1 }... pero devolvemos otro
    global.fetch = vi.fn().mockResolvedValue(httpErrorResponse(500));
    await expect(api.get("/stale/two", { _skipCache: true })).rejects.toMatchObject({
      status: 500,
    });
  });

  it("cache fresca sigue cortando el fetch (comportamiento habitual intacto)", async () => {
    await api.get("/stale/three");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const again = await api.get("/stale/three");
    expect(again).toEqual({ n: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("el fallback stale también aplica con _skipCache (playlist abierta offline)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.get("/stale/skip", { _skipCache: true })).rejects.toMatchObject({
      status: 0,
    });

    // Con caché previa del mismo path, _skipCache offline sí sirve lo viejo
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await api.get("/stale/skip2", { _skipCache: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const stale = await api.get("/stale/skip2", { _skipCache: true });
    expect(stale).toEqual({ ok: true });
  });
});
