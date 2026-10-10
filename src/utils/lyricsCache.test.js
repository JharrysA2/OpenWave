import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStoredLyrics, storeLyrics, clearStoredLyrics } from "./lyricsCache";

describe("lyricsCache — letras persistidas en localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("guarda y recupera letras por videoId", () => {
    storeLyrics("vid1", { lyrics: ["línea 1", "línea 2"], source: "lrclib" });
    expect(getStoredLyrics("vid1")).toEqual({
      lyrics: ["línea 1", "línea 2"],
      source: "lrclib",
    });
  });

  it("devuelve null cuando no hay nada (o el formato es inválido)", () => {
    expect(getStoredLyrics("missing")).toBeNull();
    expect(getStoredLyrics("")).toBeNull();
    localStorage.setItem("sw_lyrics_cache_v1", JSON.stringify({ bad: { lyrics: "no-array" } }));
    expect(getStoredLyrics("bad")).toBeNull();
    localStorage.setItem("sw_lyrics_cache_v1", "no-json{");
    expect(getStoredLyrics("any")).toBeNull();
  });

  it("ignora letras vacías (no cachea basura)", () => {
    storeLyrics("vid2", { lyrics: [], source: "lrclib" });
    expect(getStoredLyrics("vid2")).toBeNull();
    storeLyrics("vid2", null);
    expect(getStoredLyrics("vid2")).toBeNull();
  });

  it("clearStoredLyrics borra solo esa canción", () => {
    storeLyrics("vid3", { lyrics: ["a"], source: "x" });
    storeLyrics("vid4", { lyrics: ["b"], source: "x" });
    clearStoredLyrics("vid3");
    expect(getStoredLyrics("vid3")).toBeNull();
    expect(getStoredLyrics("vid4")).toEqual({ lyrics: ["b"], source: "x" });
  });

  it("recorta a 200 entradas conservando las más recientes", () => {
    for (let i = 0; i < 210; i++) {
      storeLyrics(`v${i}`, { lyrics: [`l${i}`], source: "x" });
    }
    const raw = JSON.parse(localStorage.getItem("sw_lyrics_cache_v1"));
    expect(Object.keys(raw).length).toBeLessThanOrEqual(200);
    // La última escritura sobrevive
    expect(raw.v209).toBeTruthy();
  });

  it("aguanta un localStorage que lanza (modo privado) sin romper", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => storeLyrics("vid5", { lyrics: ["x"], source: "y" })).not.toThrow();
    spy.mockRestore();
  });
});
