import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OFFLINE_INTERVAL_MS,
  ONLINE_INTERVAL_MS,
  __resetHealth,
  checkHealth,
  getHealthState,
  getHeartbeatInterval,
  isHeartbeatRunning,
  markOffline,
  markOnline,
  startHeartbeat,
  stopHeartbeat,
  subscribeHealth,
  subscribeReconnect,
} from "./backendHealth";
import { api } from "./api";

// ── Helpers de respuesta ─────────────────────────────────────────────────────

function okJson(data = { status: "ok" }) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function httpError(status = 500) {
  return {
    ok: false,
    status,
    headers: { get: () => "text/plain" },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(`error ${status}`),
  };
}

let fetchMock;

beforeEach(() => {
  __resetHealth();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  __resetHealth();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── Estado ───────────────────────────────────────────────────────────────────

describe("backendHealth — estado", () => {
  it("starts optimistic: online and sin error", () => {
    const state = getHealthState();
    expect(state.online).toBe(true);
    expect(state.checking).toBe(false);
    expect(state.error).toBeNull();
    expect(state.reconnects).toBe(0);
  });

  it("markOffline switches to offline and notifies subscribers", () => {
    const listener = vi.fn();
    subscribeHealth(listener);

    expect(markOffline("ECONNREFUSED")).toBe(true);
    expect(getHealthState().online).toBe(false);
    expect(getHealthState().error).toBe("ECONNREFUSED");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("markOffline is idempotent but updates the reason", () => {
    const listener = vi.fn();
    markOffline("Error de conexión");
    subscribeHealth(listener);

    expect(markOffline("Timeout")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getHealthState().error).toBe("Timeout");

    // Mismo motivo => sin cambios => sin notificación
    expect(markOffline("Timeout")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("markOnline reports a reconnect only when coming back from offline", () => {
    const reconnected = vi.fn();
    subscribeReconnect(reconnected);

    // Ya online: no es una reconexión
    expect(markOnline()).toBe(false);
    expect(reconnected).not.toHaveBeenCalled();
    expect(getHealthState().reconnects).toBe(0);

    markOffline("caído");
    expect(markOnline()).toBe(true);
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(getHealthState().online).toBe(true);
    expect(getHealthState().error).toBeNull();
    expect(getHealthState().reconnects).toBe(1);
  });

  it("does not notify status listeners when nothing visible changed", () => {
    const listener = vi.fn();
    subscribeHealth(listener);
    markOnline(); // ya estaba online
    expect(listener).not.toHaveBeenCalled();
    expect(getHealthState().lastCheckAt).toBeGreaterThan(0);
  });

  it("unsubscribes listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHealth(listener);
    unsubscribe();
    markOffline("x");
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── Health-check ─────────────────────────────────────────────────────────────

describe("backendHealth — checkHealth", () => {
  it("marks online when /health responds 200", async () => {
    fetchMock.mockResolvedValue(okJson());

    await expect(checkHealth()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/health"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(getHealthState().online).toBe(true);
    expect(getHealthState().checking).toBe(false);
    expect(getHealthState().lastCheckAt).toBeGreaterThan(0);
  });

  it("marks offline when /health responds with an HTTP error", async () => {
    fetchMock.mockResolvedValue(httpError(503));

    await expect(checkHealth()).resolves.toBe(false);
    expect(getHealthState().online).toBe(false);
    expect(getHealthState().error).toBe("HTTP 503");
  });

  it("marks offline when the network is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkHealth()).resolves.toBe(false);
    expect(getHealthState().online).toBe(false);
    expect(getHealthState().error).toBe("Error de conexión");
  });

  it("marks offline with 'Timeout' when the check aborts", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const pending = checkHealth({ timeout: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toBe(false);
    expect(getHealthState().error).toBe("Timeout");
    expect(getHealthState().online).toBe(false);
  });

  it("never leaves `checking` stuck when it throws", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    await checkHealth();
    expect(getHealthState().checking).toBe(false);
  });

  it("ignores overlapping checks", async () => {
    let resolveFetch;
    fetchMock.mockImplementation(() => new Promise((resolve) => (resolveFetch = resolve)));

    const first = checkHealth();
    const second = checkHealth(); // debe salir temprano, sin disparar fetch

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getHealthState().checking).toBe(true);

    resolveFetch(okJson());
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("recovers: offline por error de red y luego online por /health", async () => {
    const reconnected = vi.fn();
    subscribeReconnect(reconnected);

    fetchMock.mockRejectedValueOnce(new Error("down"));
    await checkHealth();
    expect(getHealthState().online).toBe(false);

    fetchMock.mockResolvedValueOnce(okJson());
    await checkHealth();

    expect(getHealthState().online).toBe(true);
    expect(reconnected).toHaveBeenCalledTimes(1);
  });
});

// ── Heartbeat ────────────────────────────────────────────────────────────────

describe("backendHealth — heartbeat", () => {
  it("polls with the slow interval while online", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okJson());

    startHeartbeat();
    expect(isHeartbeatRunning()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getHeartbeatInterval()).toBe(ONLINE_INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(ONLINE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ONLINE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries fast while offline and reconnects automatically", async () => {
    vi.useFakeTimers();
    const reconnected = vi.fn();
    subscribeReconnect(reconnected);

    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    startHeartbeat();

    await vi.advanceTimersByTimeAsync(ONLINE_INTERVAL_MS); // primer intento
    expect(getHealthState().online).toBe(false);
    expect(getHeartbeatInterval()).toBe(OFFLINE_INTERVAL_MS);

    // El backend vuelve a estar disponible
    fetchMock.mockResolvedValue(okJson());
    await vi.advanceTimersByTimeAsync(OFFLINE_INTERVAL_MS);

    expect(getHealthState().online).toBe(true);
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(getHeartbeatInterval()).toBe(ONLINE_INTERVAL_MS);
  });

  it("adelanta el reintento cuando el backend se cae fuera del latido", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    startHeartbeat();
    // El backend se cae antes del primer latido (lo detecta api.js, no el heartbeat)
    markOffline("ECONNREFUSED");
    expect(getHeartbeatInterval()).toBe(OFFLINE_INTERVAL_MS);

    // Reintenta a los 3s, no a los 20s
    await vi.advanceTimersByTimeAsync(OFFLINE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("vuelve al intervalo lento tras recuperarse", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okJson());

    startHeartbeat();
    markOffline("down");
    await vi.advanceTimersByTimeAsync(OFFLINE_INTERVAL_MS);
    expect(getHealthState().online).toBe(true);
    expect(getHeartbeatInterval()).toBe(ONLINE_INTERVAL_MS);

    // El siguiente latido ya no es tan frecuente
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(ONLINE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stopHeartbeat cancels the pending timer", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okJson());

    startHeartbeat();
    stopHeartbeat();
    expect(isHeartbeatRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(ONLINE_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("startHeartbeat is idempotent", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okJson());

    startHeartbeat();
    startHeartbeat();

    await vi.advanceTimersByTimeAsync(ONLINE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── Integración con api.js ───────────────────────────────────────────────────

describe("backendHealth — integración con api", () => {
  it("api.get marca offline cuando la petición falla por red", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api.get("/history", { _skipCache: true })).rejects.toThrow();
    expect(getHealthState().online).toBe(false);
    expect(getHealthState().error).toBe("Failed to fetch");
  });

  it("api.get marca offline cuando hay timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const pending = api.get("/history", { _skipCache: true, timeout: 50 });
    const assertion = expect(pending).rejects.toThrow("Timeout");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;

    expect(getHealthState().online).toBe(false);
    expect(getHealthState().error).toBe("Timeout");
  });

  it("api.get recupera el estado online tras una respuesta válida", async () => {
    const reconnected = vi.fn();
    subscribeReconnect(reconnected);

    fetchMock.mockRejectedValueOnce(new Error("down"));
    await api.get("/history", { _skipCache: true }).catch(() => {});
    expect(getHealthState().online).toBe(false);

    fetchMock.mockResolvedValueOnce(okJson([]));
    await api.get("/history", { _skipCache: true });

    expect(getHealthState().online).toBe(true);
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it("un error HTTP NO marca offline: el servidor está vivo", async () => {
    fetchMock.mockResolvedValue(httpError(404));

    await expect(api.get("/nope", { _skipCache: true })).rejects.toThrow();
    expect(getHealthState().online).toBe(true);
    expect(getHealthState().error).toBeNull();
  });

  it("una respuesta 500 desde offline cuenta como reconexión", async () => {
    markOffline("down");
    fetchMock.mockResolvedValue(httpError(500));

    await expect(api.post("/history", {})).rejects.toThrow();
    expect(getHealthState().online).toBe(true);
  });
});
