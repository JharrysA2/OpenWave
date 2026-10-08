import React from "react";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomeView from "./HomeView";
import { api } from "../utils/api";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

// Mock api — el feed de la home (4 endpoints) nunca toca red en tests
vi.mock("../utils/api", () => ({
  api: { get: vi.fn() },
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  ...overrides,
});

const album = (id, overrides = {}) => ({
  browseId: `b${id}`,
  title: `Album ${id}`,
  artist: `Artist ${id}`,
  year: "2024",
  thumbnail: "",
  ...overrides,
});

const playlist = (id, overrides = {}) => ({
  id,
  name: `Playlist ${id}`,
  color: "#8b5cf6",
  song_count: 3,
  ...overrides,
});

const defaultProps = {
  currentSong: null,
  playSong: () => {},
  history: [],
};

function renderHome(props = {}) {
  return render(<HomeView {...defaultProps} {...props} />);
}

/** Responde cada endpoint con lo dado (prefijo de path → resultados). */
function mockFeed(map) {
  api.get.mockImplementation((path) => {
    const hit = Object.entries(map).find(([prefix]) => path.startsWith(prefix));
    return Promise.resolve({ results: hit ? hit[1] : [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ results: [] });
});

describe("HomeView", () => {
  // ── Empty / saludo / estados ───────────────────────────────────────────

  it("muestra el estado vacío cuando no hay nada (tras asentarse el feed)", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Busca tu primera canción")).toBeInTheDocument());
    expect(screen.getByText(/Encuentra cualquier canción/)).toBeInTheDocument();
  });

  it("no parpadea el estado vacío mientras el feed viaja (skeleton)", () => {
    api.get.mockImplementation(() => new Promise(() => {})); // nunca resuelve
    renderHome();
    expect(screen.queryByText("Busca tu primera canción")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("should show greeting and headline", () => {
    renderHome();
    // Dynamic headline: "Descubre tu sonido" when no history
    expect(screen.getByText("Descubre tu sonido")).toBeInTheDocument();
  });

  it("should show skeletons while status is 'loading' (nunca contenido)", () => {
    renderHome({ status: "loading", history: [song("1")] });
    expect(screen.queryAllByText("Song 1")).toHaveLength(0);
    expect(screen.queryByText("Busca tu primera canción")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("should show an error state with a reportable code when status is 'error'", () => {
    const onRetry = vi.fn();
    renderHome({ status: "error", errorCode: "E-CNX-01", onRetry });

    expect(screen.getByTestId("status-state")).toBeInTheDocument();
    expect(screen.getByTestId("error-code")).toHaveTextContent("E-CNX-01");
    expect(screen.queryByText("Busca tu primera canción")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".skeleton")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("status-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should default to 'ready' so the empty state renders without props", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Busca tu primera canción")).toBeInTheDocument());
    expect(screen.queryByTestId("status-state")).not.toBeInTheDocument();
  });

  // ── Sección 1: Recientes (cronológico, fallback = historial) ───────────

  it("muestra Recientes desde el historial como fallback", () => {
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history });
    expect(screen.getByText("Recientes")).toBeInTheDocument();
    // El feed vino vacío → fallback historial: cada canción una sola vez
    expect(screen.getAllByText("Song 0")).toHaveLength(1);
    expect(screen.getByText("Song 7")).toBeInTheDocument();
  });

  it("limita Recientes a 18 canciones (el resto cae en Para ti)", () => {
    const history = Array.from({ length: 25 }, (_, i) => song(`${i}`));
    renderHome({ history });
    expect(screen.getByText("Recientes")).toBeInTheDocument();
    const recents = within(screen.getByTestId("grid-recents"));
    expect(recents.getByText("Song 17")).toBeInTheDocument();
    expect(recents.queryByText("Song 18")).not.toBeInTheDocument();
    expect(recents.queryByText("Song 24")).not.toBeInTheDocument();
    // El resto del historial sí aparece, pero en Para ti (fallback dedup)
    const forYou = within(screen.getByTestId("grid-for-you"));
    expect(forYou.getByText("Song 18")).toBeInTheDocument();
    expect(forYou.getByText("Song 24")).toBeInTheDocument();
  });

  it("usa /home/quick-picks cuando responde (cronológico real)", async () => {
    mockFeed({ "/home/quick-picks": [song("qp1"), song("qp2")] });
    renderHome();
    expect(screen.queryByText("Song qp1")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Song qp1")).toBeInTheDocument());
    expect(screen.getByText("Song qp2")).toBeInTheDocument();
    // Con contenido, el titular cambia
    expect(screen.getByText("¿Qué quieres escuchar?")).toBeInTheDocument();
  });

  it("llama playSong al pulsar una canción de Recientes", () => {
    const playSong = vi.fn();
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, playSong });
    fireEvent.click(screen.getAllByText("Song 5")[0]);
    expect(playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "5", title: "Song 5" }),
    );
  });

  // ── Sección 2: Para ti (feed del backend) ──────────────────────────────

  it("muestra Para ti desde /home/for-you con su mix", async () => {
    mockFeed({ "/home/for-you": [song("fy1"), song("fy2"), song("fy3")] });
    renderHome();
    expect(screen.queryByText("Para ti")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Para ti")).toBeInTheDocument());
    expect(screen.getByText("Song fy1")).toBeInTheDocument();
    expect(screen.getByText("Song fy3")).toBeInTheDocument();
  });

  it("llama playSong al pulsar una canción de Para ti", async () => {
    const playSong = vi.fn();
    mockFeed({ "/home/for-you": [song("fy1"), song("fy6")] });
    renderHome({ playSong });
    await waitFor(() => expect(screen.getByText("Song fy6")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Song fy6"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "fy6" }));
  });

  // ── Sección 3: Tendencias ──────────────────────────────────────────────

  it("muestra Tendencias desde /trending y reproduce al pulsar", async () => {
    const playSong = vi.fn();
    mockFeed({ "/trending": [song("tr1"), song("tr2")] });
    renderHome({ playSong });
    await waitFor(() => expect(screen.getByText("Tendencias")).toBeInTheDocument());
    expect(screen.getByText("Song tr2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Song tr1"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "tr1" }));
  });

  // ── Sección 4: Álbumes ─────────────────────────────────────────────────

  it("muestra Álbumes desde /home/albums y navega al pulsar", async () => {
    const onSelectAlbum = vi.fn();
    mockFeed({ "/home/albums": [album("1"), album("2")] });
    renderHome({ onSelectAlbum });
    await waitFor(() => expect(screen.getByText("Álbumes")).toBeInTheDocument());
    expect(screen.getByText("Album 1")).toBeInTheDocument();
    expect(screen.getByText("Album 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Album 1"));
    expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ browseId: "b1" }));
  });

  // ── Sección 5: Tus playlists ───────────────────────────────────────────

  it("muestra Tus playlists con nº de canciones y navega al pulsar", () => {
    const onSelectPlaylist = vi.fn();
    const pl = playlist(7);
    renderHome({ playlists: [pl], onSelectPlaylist });
    expect(screen.getByText("Tus playlists")).toBeInTheDocument();
    expect(screen.getByText("Playlist 7")).toBeInTheDocument();
    expect(screen.getByText("3 canciones")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Playlist 7"));
    expect(onSelectPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("playlist vacía muestra «0 canciones» (singular 1 canción)", () => {
    renderHome({ playlists: [playlist("1", { song_count: 0 }), playlist("2", { song_count: 1 })] });
    expect(screen.getByText("0 canciones")).toBeInTheDocument();
    expect(screen.getByText("1 canción")).toBeInTheDocument();
  });

  // ── Fallback si un endpoint falla ──────────────────────────────────────

  it("si los endpoints fallan, la home sigue viva con el historial", async () => {
    api.get.mockRejectedValue(new Error("backend caído"));
    const history = Array.from({ length: 5 }, (_, i) => song(`${i}`));
    renderHome({ history });
    expect(screen.getByText("Recientes")).toBeInTheDocument();
    expect(screen.getByText("Song 0")).toBeInTheDocument();
    // Tendencias/Álbumes sin fallback → no se pintan, pero nada explota
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
    expect(screen.queryByText("Tendencias")).not.toBeInTheDocument();
    expect(screen.queryByText("Álbumes")).not.toBeInTheDocument();
  });

  // ── Reintentos del feed (primer arranque con backend en frío) ──────────

  it("reintenta ante timeout y la sección aparece cuando el backend responde", async () => {
    vi.useFakeTimers();
    try {
      let trendingCalls = 0;
      api.get.mockImplementation((path) => {
        if (path.startsWith("/trending")) {
          trendingCalls += 1;
          if (trendingCalls === 1) return Promise.reject(new Error("timeout"));
          return Promise.resolve({ results: [song("t1", { title: "Caliente" })] });
        }
        return Promise.resolve({ results: [] });
      });
      renderHome();
      expect(screen.queryByText("Tendencias")).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_100); // primer retry (5 s)
      });
      expect(screen.getByText("Tendencias")).toBeInTheDocument();
      expect(trendingCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no reintenta cuando el endpoint responde vacío (es definitivo)", async () => {
    vi.useFakeTimers();
    try {
      renderHome();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(api.get).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("agota los reintentos sin romper la home ante un backend caído", async () => {
    vi.useFakeTimers();
    try {
      api.get.mockRejectedValue(new Error("timeout"));
      renderHome({ history: [song("0")] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 1_000);
      });
      // 4 endpoints × (1 intento inicial + 3 reintentos)
      expect(api.get).toHaveBeenCalledTimes(16);
      // el historial sigue vivo y las secciones sin fallback no aparecen
      expect(screen.getByText("Recientes")).toBeInTheDocument();
      expect(screen.queryByText("Tendencias")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Highlight + pulso ──────────────────────────────────────────────────

  it("should highlight the current song", () => {
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, currentSong: song("6") });
    expect(screen.getByText("Song 6")).toBeInTheDocument();
    expect(screen.getAllByText("Song 0")).toHaveLength(1);
  });

  it("el pulso 'suena ahora' usa --neon-fg y currentColor, nunca #000 fijo", () => {
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, currentSong: song("0"), isPlaying: true, accentColor: "#ffffff" });
    const pulse = screen.getByTestId("now-playing-pulse");
    expect(pulse.style.color).toContain("var(--neon-fg)");
    const icon = pulse.querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon.getAttribute("fill")).toBe("currentColor");
  });

  it("las tarjetas no llevan backdrop-filter (regresión de GPU por tarjeta)", () => {
    renderHome({ history: [song("a")] });
    const title = screen.getAllByText("Song a")[0];
    let card = title;
    while (card && !((card.style && card.style.background) || "").includes("linear-gradient")) {
      card = card.parentElement;
    }
    expect(card).toBeTruthy();
    expect(card.style.backdropFilter ?? "").toBe("");
  });
});
