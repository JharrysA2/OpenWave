import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getLyricsOverride, setLyricsOverride, clearLyricsOverride } from "./lyricsOverrides";

const KEY = "sw_lyrics_overrides_v1";

describe("lyricsOverrides — persistencia de letras elegidas", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("guarda y recupera la letra elegida por videoId", () => {
    const ok = setLyricsOverride("v1", { lines: ["[00:01.00]Hola", "Segunda"], source: "LRCLib" });

    expect(ok).toBe(true);
    expect(getLyricsOverride("v1")).toMatchObject({
      lines: ["[00:01.00]Hola", "Segunda"],
      source: "LRCLib",
    });
  });

  it("sobrevive a un 'reinicio' (relectura desde localStorage)", () => {
    setLyricsOverride("v1", { lines: ["Letra buscada"], source: "YTMusic" });

    // Misma lectura que haría LyricsView al reabrir la pantalla
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw.v1.lines).toEqual(["Letra buscada"]);
    expect(getLyricsOverride("v1").source).toBe("YTMusic");
  });

  it("devuelve null cuando no hay override o el videoId falta", () => {
    expect(getLyricsOverride("nope")).toBeNull();
    expect(getLyricsOverride(undefined)).toBeNull();
    expect(getLyricsOverride("")).toBeNull();
  });

  it("ignora entradas corruptas (JSON inválido o estructura rara)", () => {
    localStorage.setItem(KEY, "{no es json");
    expect(getLyricsOverride("v1")).toBeNull();

    localStorage.setItem(KEY, JSON.stringify(["no", "es", "un", "mapa"]));
    expect(getLyricsOverride("v1")).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ v1: { lines: "string, no array" } }));
    expect(getLyricsOverride("v1")).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ v1: { lines: [] } }));
    expect(getLyricsOverride("v1")).toBeNull();

    // Leer no rompe nada: se puede volver a escribir
    expect(setLyricsOverride("v1", { lines: ["Ok"] })).toBe(true);
    expect(getLyricsOverride("v1").lines).toEqual(["Ok"]);
  });

  it("rechaza guardados sin videoId o sin líneas útiles", () => {
    expect(setLyricsOverride(undefined, { lines: ["x"] })).toBe(false);
    expect(setLyricsOverride("", { lines: ["x"] })).toBe(false);
    expect(setLyricsOverride("v1", {})).toBe(false);
    expect(setLyricsOverride("v1", { lines: [] })).toBe(false);
    expect(setLyricsOverride("v1", { lines: ["   ", "\t"] })).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("filtra líneas vacías antes de persistir", () => {
    setLyricsOverride("v1", { lines: ["Útil", "", "   ", "También"] });

    expect(getLyricsOverride("v1").lines).toEqual(["Útil", "También"]);
  });

  it("limpia la letra elegida (Recargar letras) y avisa si había algo", () => {
    setLyricsOverride("v1", { lines: ["Elegida"] });
    setLyricsOverride("v2", { lines: ["Otra"] });

    expect(clearLyricsOverride("v1")).toBe(true);
    expect(getLyricsOverride("v1")).toBeNull();
    expect(getLyricsOverride("v2")).not.toBeNull();

    // Segunda limpieza: no había nada
    expect(clearLyricsOverride("v1")).toBe(false);
    expect(clearLyricsOverride(undefined)).toBe(false);
  });

  it("poda las entradas más antiguas y respeta el tope", () => {
    // 105 entradas con marcas de tiempo decrecientes (la primera es la más vieja)
    const base = Date.now() - 1_000_000;
    for (let i = 0; i < 105; i++) {
      const map = JSON.parse(localStorage.getItem(KEY) || "{}");
      map[`id${i}`] = { lines: [`Línea ${i}`], source: "test", updatedAt: base + i };
      localStorage.setItem(KEY, JSON.stringify(map));
    }

    setLyricsOverride("nueva", { lines: ["Nueva"] });

    const map = JSON.parse(localStorage.getItem(KEY));
    expect(Object.keys(map).length).toBeLessThanOrEqual(100);
    expect(map.nueva).toBeTruthy();
    expect(map.id0).toBeUndefined(); // la más vieja se podó
    expect(map.id104).toBeTruthy(); // las recientes quedan
  });

  it("no rompe si localStorage falla al escribir (cuota llena)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    // No lanza: la letra sigue vigente en el estado del componente
    expect(setLyricsOverride("v1", { lines: ["Ok"] })).toBe(true);

    spy.mockRestore();
  });
});
