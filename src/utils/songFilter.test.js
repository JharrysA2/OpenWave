import { describe, it, expect } from "vitest";
import { normalizeText, songMatchesQuery, filterSongs } from "./songFilter";

const songs = [
  { videoId: "v1", title: "Música Ligera", artist: "Soda Stereo", album: "Canción Animal" },
  { videoId: "v2", title: "Hurt", artist: "Johnny Cash", album: "American IV" },
  { videoId: "v3", title: "Time", artist: "Hans Zimmer", album: "Inception" },
  { videoId: "v4", title: "Intro", artist: "The xx", album: "xx" },
];

describe("songFilter — normalizeText", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalizeText("Música")).toBe("musica");
    expect(normalizeText("CANCIÓN ANIMAL")).toBe("cancion animal");
    expect(normalizeText("ñandú ÑOÑO")).toBe("nandu nono");
  });

  it("tolera valores nulos/undefined", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("songFilter — songMatchesQuery", () => {
  it("consulta vacía hace match con todo", () => {
    expect(songMatchesQuery(songs[0], "")).toBe(true);
    expect(songMatchesQuery(songs[0], "   ")).toBe(true);
  });

  it("matchea por título sin importar mayúsculas/acentos", () => {
    expect(songMatchesQuery(songs[0], "musica ligera")).toBe(true);
    expect(songMatchesQuery(songs[0], "MÚSICA")).toBe(true);
    expect(songMatchesQuery(songs[0], "ligera")).toBe(true);
  });

  it("matchea por artista", () => {
    expect(songMatchesQuery(songs[1], "johnny")).toBe(true);
    expect(songMatchesQuery(songs[2], "HANS zimmer")).toBe(true);
  });

  it("matchea por álbum", () => {
    expect(songMatchesQuery(songs[2], "inception")).toBe(true);
  });

  it("matchea por el array artists (cuando existe)", () => {
    const s = { videoId: "v9", title: "X", artists: [{ name: "Fernando" }] };
    expect(songMatchesQuery(s, "fernando")).toBe(true);
  });

  it("no matchea texto que no aparece", () => {
    expect(songMatchesQuery(songs[3], "reggaeton")).toBe(false);
  });
});

describe("songFilter — filterSongs", () => {
  it("con consulta vacía devuelve la misma lista", () => {
    expect(filterSongs(songs, "")).toBe(songs);
    expect(filterSongs(songs, "  ")).toBe(songs);
  });

  it("filtra por coincidencias parciales preservando el orden", () => {
    const list = [
      { videoId: "a", title: "One" },
      { videoId: "b", title: "Neon" },
      { videoId: "c", title: "Gone" },
    ];
    expect(filterSongs(list, "neo").map((s) => s.videoId)).toEqual(["b"]);
    expect(filterSongs(list, "on").map((s) => s.videoId)).toEqual(["a", "b", "c"]);
  });

  it("sin coincidencias devuelve lista vacía", () => {
    expect(filterSongs(songs, "zzz")).toEqual([]);
  });

  it("tolera listas nulas", () => {
    expect(filterSongs(null, "x")).toEqual([]);
  });
});
