import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSearch } from "./useSearch";
import { mockApiResponse } from "../test-utils";

// ── Tests que NO necesitan fake timers ─────────────────────────────────────

describe("useSearch - initial state", () => {
  it("should start with default state", () => {
    const { result } = renderHook(() => useSearch());
    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual([]);
    expect(result.current.searchArtists).toEqual([]);
    expect(result.current.searchAlbums).toEqual([]);
    expect(result.current.songsVisible).toBe(5);
    expect(result.current.searchTab).toBe("music");
    expect(result.current.videoResults).toEqual([]);
    expect(result.current.videoLoading).toBe(false);
    expect(result.current.videoError).toBeNull();
    expect(result.current.searchInputRef.current).toBeNull();
  });

  it("should increase songsVisible on setSongsVisible", () => {
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setSongsVisible(10));
    expect(result.current.songsVisible).toBe(10);
  });

  it("should toggle search tab", () => {
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setSearchTab("videos"));
    expect(result.current.searchTab).toBe("videos");
    act(() => result.current.setSearchTab("music"));
    expect(result.current.searchTab).toBe("music");
  });
});

describe("useSearch - doSearch", () => {
  it("should clear results for empty query", async () => {
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setResults([{ videoId: "old" }]));
    act(() => result.current.setSearchArtists([{ name: "old" }]));
    await act(async () => {
      await result.current.doSearch("");
    });
    expect(result.current.results).toEqual([]);
    expect(result.current.searchArtists).toEqual([]);
    expect(result.current.searchAlbums).toEqual([]);
  });

  it("should fetch and set results", async () => {
    const mockData = {
      results: [{ videoId: "abc", title: "Song" }],
      artists: [{ name: "Artist", browseId: "123" }],
      albums: [{ title: "Album", browseId: "456" }],
    };
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockApiResponse(mockData));

    const { result } = renderHook(() => useSearch());
    await act(async () => {
      await result.current.doSearch("test query");
    });

    // _fetch adds AbortSignal as second arg, so use expect.anything()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/search?q=test%20query&limit=25"),
      expect.anything(),
    );
    expect(result.current.results).toEqual(mockData.results);
    expect(result.current.searchArtists).toEqual(mockData.artists);
    expect(result.current.searchAlbums).toEqual(mockData.albums);
    mockFetch.mockRestore();
  });

  it("should handle fetch errors gracefully", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useSearch());
    await act(async () => {
      await result.current.doSearch("test");
    });
    expect(result.current.results).toEqual([]);
    mockFetch.mockRestore();
  });
});

describe("useSearch - doSearchVideos", () => {
  it("should clear for empty query", async () => {
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setVideoResults([{ videoId: "old" }]));
    await act(async () => {
      await result.current.doSearchVideos("");
    });
    expect(result.current.videoResults).toEqual([]);
  });

  it("should set results after fetch", async () => {
    const mockData = { results: [{ videoId: "vid1", title: "Video 1" }] };
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockApiResponse(mockData));

    const { result } = renderHook(() => useSearch());
    await act(async () => {
      await result.current.doSearchVideos("test video");
    });

    expect(result.current.videoLoading).toBe(false);
    expect(result.current.videoResults).toEqual(mockData.results);
    expect(result.current.videoError).toBeNull();
    mockFetch.mockRestore();
  });

  it("should handle error response", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockApiResponse({ error: "API Error" }));

    const { result } = renderHook(() => useSearch());
    await act(async () => {
      await result.current.doSearchVideos("test");
    });

    expect(result.current.videoError).toBe("API Error");
    expect(result.current.videoResults).toEqual([]);
    mockFetch.mockRestore();
  });

  it("should handle fetch exception", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSearch());
    await act(async () => {
      await result.current.doSearchVideos("test");
    });

    expect(result.current.videoError).toBe("Network error");
    expect(result.current.videoResults).toEqual([]);
    expect(result.current.videoLoading).toBe(false);
    mockFetch.mockRestore();
  });
});

// ── Tests del handleSearchChange (debounce de 300 ms) ─────────────────────
//    La búsqueda NO es inmediata: handleSearchChange aplica un debounce de
//    300 ms que cancela la ventana anterior, así que solo corre la última.

describe("useSearch - handleSearchChange (debounce 300ms)", () => {
  it("should update query immediately", () => {
    const { result } = renderHook(() => useSearch());
    act(() => result.current.handleSearchChange("new query"));
    expect(result.current.query).toBe("new query");
  });

  it("should call doSearch and doSearchVideos once the debounce expires", async () => {
    vi.useFakeTimers();
    try {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(mockApiResponse({ results: [] }));

      const { result } = renderHook(() => useSearch());
      act(() => result.current.handleSearchChange("test"));

      // Dentro de la ventana del debounce todavía no se dispara nada
      expect(mockFetch).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // doSearch + doSearchVideos = 2 llamadas (una por API)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      mockFetch.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should clear results for empty input", () => {
    const { result } = renderHook(() => useSearch());
    act(() => result.current.setResults([{ videoId: "old" }]));
    act(() => result.current.setSearchArtists([{ name: "old" }]));
    act(() => result.current.setVideoResults([{ videoId: "old_vid" }]));
    act(() => result.current.handleSearchChange(""));
    expect(result.current.results).toEqual([]);
    expect(result.current.searchArtists).toEqual([]);
    expect(result.current.searchAlbums).toEqual([]);
    expect(result.current.videoResults).toEqual([]);
  });

  it("should debounce rapid calls: only the last query runs", async () => {
    vi.useFakeTimers();
    try {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(mockApiResponse({ results: [] }));

      const { result } = renderHook(() => useSearch());
      act(() => result.current.handleSearchChange("first"));
      act(() => result.current.handleSearchChange("second"));

      expect(result.current.query).toBe("second");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // El debounce cancela "first": solo la última búsqueda corre
      // → 2 calls (doSearch + doSearchVideos), no 4
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/search?q=second"),
        expect.anything(),
      );
      mockFetch.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
