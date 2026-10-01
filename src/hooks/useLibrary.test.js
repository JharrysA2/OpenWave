import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLibrary } from "./useLibrary";
import { api } from "../utils/api";
import { mockApiResponse } from "../test-utils";

beforeEach(() => {
  // La caché de api es module-level: si no se limpia, datos del test
  // anterior contaminan al siguiente (ej: errores leen caché del previo).
  api.clearCache();
  localStorage.clear();
});

describe("useLibrary", () => {
  // ── Estado inicial ────────────────────────────────────────────────────────

  it("should start with empty liked Set and empty arrays", () => {
    const { result } = renderHook(() => useLibrary());
    expect(result.current.liked).toBeInstanceOf(Set);
    expect(result.current.liked.size).toBe(0);
    expect(result.current.history).toEqual([]);
    expect(result.current.downloads).toEqual([]);
    expect(result.current.playlists).toEqual([]);
  });

  // ── toggleLike ────────────────────────────────────────────────────────────

  it("should add a videoId to liked", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.toggleLike("video123"));
    expect(result.current.liked.has("video123")).toBe(true);
    expect(result.current.liked.size).toBe(1);
  });

  it("should remove a videoId from liked if already present", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.toggleLike("video123"));
    act(() => result.current.toggleLike("video123"));
    expect(result.current.liked.has("video123")).toBe(false);
    expect(result.current.liked.size).toBe(0);
  });

  it("should persist liked songs to localStorage", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.toggleLike("video123"));
    act(() => result.current.toggleLike("video456"));

    const saved = JSON.parse(localStorage.getItem("sw_liked_v2"));
    expect(saved).toContain("video123");
    expect(saved).toContain("video456");
    expect(saved).toHaveLength(2);
  });

  it("should handle multiple toggles correctly", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.toggleLike("a"));
    act(() => result.current.toggleLike("b"));
    act(() => result.current.toggleLike("a")); // remove
    expect(result.current.liked.has("a")).toBe(false);
    expect(result.current.liked.has("b")).toBe(true);
    expect(result.current.liked.size).toBe(1);
  });

  it("should load liked songs from localStorage on mount", () => {
    localStorage.setItem("sw_liked_v2", JSON.stringify(["saved1", "saved2"]));
    const { result } = renderHook(() => useLibrary());
    expect(result.current.liked.has("saved1")).toBe(true);
    expect(result.current.liked.has("saved2")).toBe(true);
    expect(result.current.liked.size).toBe(2);
  });

  // ── likedMeta (sw_liked_meta_v1) ──────────────────────────────────────────

  it("should start with empty likedMeta", () => {
    const { result } = renderHook(() => useLibrary());
    expect(result.current.likedMeta).toEqual({});
  });

  it("should store song metadata when liking with a song", () => {
    const { result } = renderHook(() => useLibrary());
    act(() =>
      result.current.toggleLike("v1", {
        title: "My Song",
        artist: "My Artist",
        album: "My Album",
        albumBrowseId: "MPREb_1",
        duration: 120,
      }),
    );
    expect(result.current.liked.has("v1")).toBe(true);
    expect(result.current.likedMeta.v1).toMatchObject({
      title: "My Song",
      artist: "My Artist",
      album: "My Album",
      albumBrowseId: "MPREb_1",
      duration: 120,
    });
    expect(result.current.likedMeta.v1.likedAt).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem("sw_liked_meta_v1"));
    expect(stored.v1).toMatchObject({ title: "My Song" });
  });

  it("should remove metadata when unliking", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.toggleLike("v1", { title: "T", artist: "A" }));
    expect(result.current.likedMeta.v1).toBeTruthy();
    act(() => result.current.toggleLike("v1", { title: "T", artist: "A" }));
    expect(result.current.liked.has("v1")).toBe(false);
    expect(result.current.likedMeta.v1).toBeUndefined();

    const stored = JSON.parse(localStorage.getItem("sw_liked_meta_v1"));
    expect(stored.v1).toBeUndefined();
  });

  it("should not store metadata when liking without a song (compat)", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.toggleLike("legacy"));
    expect(result.current.liked.has("legacy")).toBe(true);
    expect(result.current.likedMeta.legacy).toBeUndefined();
  });

  it("should load likedMeta from localStorage on mount", () => {
    localStorage.setItem(
      "sw_liked_meta_v1",
      JSON.stringify({ old1: { title: "Old Song", artist: "Old Artist" } }),
    );
    const { result } = renderHook(() => useLibrary());
    expect(result.current.likedMeta.old1).toMatchObject({ title: "Old Song" });
  });

  it("should hydrate missing likedMeta from downloads on load", async () => {
    localStorage.setItem("sw_liked_v2", JSON.stringify(["dl1"]));
    const mockDownloads = [{ videoId: "dl1", title: "Downloaded", artist: "Someone" }];

    let callCount = 0;
    const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? [] : callCount === 2 ? mockDownloads : [];
      return mockApiResponse(data);
    });

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.likedMeta.dl1).toBeTruthy());
    expect(result.current.likedMeta.dl1).toMatchObject({
      title: "Downloaded",
      artist: "Someone",
    });

    const stored = JSON.parse(localStorage.getItem("sw_liked_meta_v1"));
    expect(stored.dl1).toMatchObject({ title: "Downloaded" });

    mockFetch.mockRestore();
  });

  it("should not overwrite existing likedMeta during hydration", async () => {
    localStorage.setItem("sw_liked_v2", JSON.stringify(["dl1"]));
    localStorage.setItem("sw_liked_meta_v1", JSON.stringify({ dl1: { title: "Custom Title" } }));
    const mockDownloads = [{ videoId: "dl1", title: "From Downloads" }];

    let callCount = 0;
    const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? [] : callCount === 2 ? mockDownloads : [];
      return mockApiResponse(data);
    });

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.playlists).toEqual([]));
    expect(result.current.likedMeta.dl1.title).toBe("Custom Title");

    mockFetch.mockRestore();
  });

  // ── mostPlayed ────────────────────────────────────────────────────────────

  it("mostPlayed should return empty array when history is empty", () => {
    const { result } = renderHook(() => useLibrary());
    expect(result.current.mostPlayed).toEqual([]);
  });

  it("mostPlayed should sort history by playCount descending", () => {
    const { result } = renderHook(() => useLibrary());
    const history = [
      { videoId: "a", title: "A", playCount: 5 },
      { videoId: "b", title: "B", playCount: 20 },
      { videoId: "c", title: "C", playCount: 1 },
    ];
    act(() => {
      result.current.setHistory(history);
    });
    expect(result.current.mostPlayed).toHaveLength(3);
    expect(result.current.mostPlayed[0].videoId).toBe("b");
    expect(result.current.mostPlayed[1].videoId).toBe("a");
    expect(result.current.mostPlayed[2].videoId).toBe("c");
  });

  it("mostPlayed should cap at 20 items", () => {
    const { result } = renderHook(() => useLibrary());
    const manySongs = Array.from({ length: 30 }, (_, i) => ({
      videoId: `v${i}`,
      title: `Song ${i}`,
      playCount: i,
    }));
    act(() => {
      result.current.setHistory(manySongs);
    });
    expect(result.current.mostPlayed).toHaveLength(20);
  });

  it("mostPlayed should handle songs without playCount", () => {
    const { result } = renderHook(() => useLibrary());
    const history = [
      { videoId: "a", title: "A" },
      { videoId: "b", title: "B", playCount: 10 },
    ];
    act(() => {
      result.current.setHistory(history);
    });
    expect(result.current.mostPlayed[0].videoId).toBe("b");
    expect(result.current.mostPlayed[1].videoId).toBe("a");
  });

  // ── API data loading ──────────────────────────────────────────────────────

  it("should fetch playlists, downloads, and history on mount", async () => {
    const mockPlaylists = [{ id: 1, name: "Favorites" }];
    const mockDownloads = [{ videoId: "dl1", title: "Downloaded Song" }];
    const mockHistory = [{ videoId: "h1", title: "Heard Song", playCount: 3 }];

    let callCount = 0;
    const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? mockPlaylists : callCount === 2 ? mockDownloads : mockHistory;
      return mockApiResponse(data);
    });

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => {
      expect(callCount).toBe(3);
    });

    // _fetch adds AbortSignal as second arg, so use expect.anything()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/playlists"),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/downloads"),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/history"), expect.anything());
    // api normaliza las respuestas (playlists añaden song_count/color/cover,
    // downloads añaden thumbnail/thumbnails normalizados en HD)
    expect(result.current.playlists).toEqual([
      { id: 1, name: "Favorites", song_count: 0, color: null, cover: null, first_cover: null },
    ]);
    expect(result.current.downloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ videoId: "dl1", title: "Downloaded Song" }),
      ]),
    );
    expect(result.current.history).toEqual(
      expect.arrayContaining([expect.objectContaining({ videoId: "h1", playCount: 3 })]),
    );

    mockFetch.mockRestore();
  });

  it("should handle API fetch errors gracefully", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("API down"));

    const { result } = renderHook(() => useLibrary());

    // Wait for effects to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.playlists).toEqual([]);
    expect(result.current.downloads).toEqual([]);
    expect(result.current.history).toEqual([]);

    mockFetch.mockRestore();
  });

  // ── setLiked direct ───────────────────────────────────────────────────────

  it("should allow direct setLiked", () => {
    const { result } = renderHook(() => useLibrary());
    act(() => result.current.setLiked(new Set(["direct"])));
    expect(result.current.liked.has("direct")).toBe(true);
  });

  it("should allow setting history directly", () => {
    const { result } = renderHook(() => useLibrary());
    const songs = [{ videoId: "x" }];
    act(() => result.current.setHistory(songs));
    expect(result.current.history).toEqual(songs);
  });
});

// ── status / error / refreshLibrary ────────────────────────────────────────
//  Sin esto la Home no distingue "cargando" de "vacío": los skeletons se
//  quedaban eternos con el backend caído.

describe("useLibrary — status", () => {
  it("should start in 'loading' and move to 'ready' when the fetches resolve", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => mockApiResponse([]));

    const { result } = renderHook(() => useLibrary());
    expect(result.current.status).toBe("loading");
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.error).toBeNull();

    mockFetch.mockRestore();
  });

  it("should move to 'error' with a reportable code when ALL fetches fail", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeTruthy();
    expect(result.current.error.message).toBeTruthy();
    // Código del catálogo (red caída → E-CNX-01)
    expect(result.current.error.code).toBe("E-CNX-01");

    mockFetch.mockRestore();
  });

  it("should stay 'ready' (datos parciales) si solo FALLA UNA de las tres", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("boom"))
      .mockImplementation(() => mockApiResponse([]));

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.error).toBeNull();

    mockFetch.mockRestore();
  });

  it("refreshLibrary should recover from 'error' to 'ready' when the backend returns", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("down"));

    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.status).toBe("error"));

    // El backend "vuelve"
    mockFetch.mockImplementation(() => mockApiResponse([]));
    await act(async () => {
      await result.current.refreshLibrary();
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();

    mockFetch.mockRestore();
  });

  it("refreshLibrary (silencioso) NO vuelve a 'loading' — sin flash de skeletons", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => mockApiResponse([]));

    const { result } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let pending;
    act(() => {
      pending = result.current.refreshLibrary();
    });
    // Sincrónico: el refresco en caliente jamás vacía la UI con skeletons
    expect(result.current.status).toBe("ready");

    await act(async () => {
      await pending;
    });
    expect(result.current.status).toBe("ready");

    mockFetch.mockRestore();
  });
});
