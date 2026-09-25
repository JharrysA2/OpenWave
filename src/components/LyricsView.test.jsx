import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SettingsProvider } from "../contexts/SettingsContext";
import { LyricsView } from "./LyricsView";
import { parseLrc } from "../utils/lrc";
import { COLORS } from "../utils/theme";

// JSDOM no implementa scrollIntoView; los synced lyrics lo necesitan
Element.prototype.scrollIntoView = vi.fn();

// ── Test helper: wrap in SettingsProvider (component uses useSettings) ──────

function renderWithSettings(component) {
  return render(<SettingsProvider>{component}</SettingsProvider>);
}

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

vi.mock("../icons/Icons", () => ({
  Ic: {
    close: <span data-testid="icon-close">X</span>,
    mic: <span data-testid="icon-mic">🎤</span>,
    lock: (s) => <span data-testid="icon-lock">🔒</span>,
    unlock: (s) => <span data-testid="icon-unlock">🔓</span>,
  },
}));

const mockApiGet = vi.fn();
vi.mock("../utils/api", () => ({
  api: {
    base: "http://127.0.0.1:8765",
    get: (...args) => mockApiGet(...args),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function song(id, overrides = {}) {
  return {
    videoId: id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    thumbnail: `https://example.com/${id}.jpg`,
    thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
    duration: 180,
    ...overrides,
  };
}

const defaultProps = {
  song: song("1"),
  open: true,
  onClose: () => {},
  queue: [],
  playSong: () => {},
  onSeek: () => {},
  progressRef: { current: 0 },
  accentColor: "#a78bfa",
};

function renderLyrics(props = {}) {
  return renderWithSettings(<LyricsView {...defaultProps} {...props} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LyricsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: null, source: "test" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
  });

  // ── Render null ─────────────────────────────────────────────────────────

  it("should return null when open is false", () => {
    const { container } = renderLyrics({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("should return null when song is null", () => {
    const { container } = renderLyrics({ song: null });
    expect(container.innerHTML).toBe("");
  });

  // ── Header / song info ──────────────────────────────────────────────────

  it("should render the song title and artist", () => {
    renderLyrics();
    expect(screen.getByText("Song 1")).toBeInTheDocument();
    expect(screen.getByText("Artist 1")).toBeInTheDocument();
  });

  // ── Close button ─────────────────────────────────────────────────────────

  it("should render a close button", () => {
    renderLyrics();
    const closeBtn = screen.getByTitle("Cerrar letras");
    expect(closeBtn).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderLyrics({ onClose });
    fireEvent.click(screen.getByTitle("Cerrar letras"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Queue ────────────────────────────────────────────────────────────────

  it("should render songs in the queue", () => {
    const queue = [song("q1"), song("q2")];
    renderLyrics({ queue });
    expect(screen.getByText("Song q1")).toBeInTheDocument();
    expect(screen.getByText("Song q2")).toBeInTheDocument();
    expect(screen.getByText("Artist q1")).toBeInTheDocument();
    expect(screen.getByText("Artist q2")).toBeInTheDocument();
  });

  it("should call playSong when a queue song is clicked", () => {
    const playSong = vi.fn();
    const queue = [song("q1")];
    renderLyrics({ queue, playSong });
    fireEvent.click(screen.getByText("Song q1"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "q1" }));
  });

  it("should show current song highlighted in queue with queueIndex", () => {
    const queue = [song("q1"), song("q2"), song("q3")];
    renderLyrics({ queue, queueIndex: 1 });
    expect(screen.getByText("Song q1")).toBeInTheDocument();
    expect(screen.getByText("Song q2")).toBeInTheDocument();
    expect(screen.getByText("Song q3")).toBeInTheDocument();
  });

  // ── Lyric states ────────────────────────────────────────────────────────

  it("should show loading state while fetching lyrics", async () => {
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return new Promise(() => {});
      }
      return Promise.resolve({ tracks: [] });
    });
    renderLyrics();
    await waitFor(() => {
      // Skeleton loading is shown instead of text
      expect(document.querySelector(".skeleton")).toBeInTheDocument();
    });
  });

  it("should show empty lyrics message when no lyrics found", async () => {
    renderLyrics();
    await waitFor(() => {
      expect(screen.getByText("Letras no encontradas para esta canción")).toBeInTheDocument();
    });
  });

  it("should show plain text lyrics when lyrics have no time tags", async () => {
    const lyricsLines = ["This is line one", "This is line two", "This is line three"];
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: lyricsLines, source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    renderLyrics();
    await waitFor(() => {
      expect(screen.getByText("This is line one")).toBeInTheDocument();
    });
    expect(screen.getByText("This is line two")).toBeInTheDocument();
    expect(screen.getByText("This is line three")).toBeInTheDocument();
  });

  it("should parse synced .lrc lyrics and display them", async () => {
    const lrcLines = ["[00:01.00]Line one", "[00:05.00]Line two", "[00:10.00]Line three"];
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: lrcLines, source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    renderLyrics();
    await waitFor(() => {
      expect(screen.getByText("Line one")).toBeInTheDocument();
    });
    expect(screen.getByText("Line two")).toBeInTheDocument();
    expect(screen.getByText("Line three")).toBeInTheDocument();
  });

  it("should show lyrics source in footer", async () => {
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: ["Test lyric"], source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    renderLyrics();
    await waitFor(() => {
      expect(screen.getByText(/Letras vía lrcLib/)).toBeInTheDocument();
    });
  });

  it("should handle API error gracefully", async () => {
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.reject(new Error("Network error"));
    });
    renderLyrics();
    await waitFor(() => {
      expect(screen.getByText("Letras no encontradas para esta canción")).toBeInTheDocument();
    });
  });

  // ── Queue (la cola viene del prop, no de API en LyricsView) ────────────

  it("should render queue songs passed as prop", () => {
    const queue = [
      { videoId: "q1", title: "Queue 1", artist: "Art 1", thumbnails: [], duration: 200 },
      { videoId: "q2", title: "Queue 2", artist: "Art 2", thumbnails: [], duration: 200 },
    ];
    renderLyrics({ queue });
    expect(screen.getByText("Queue 1")).toBeInTheDocument();
    expect(screen.getByText("Queue 2")).toBeInTheDocument();
  });

  it("should call playSong when a queue song is clicked (via queueIndex)", () => {
    const playSong = vi.fn();
    const queue = [song("q1"), song("q2")];
    renderLyrics({ queue, queueIndex: 0, playSong });
    fireEvent.click(screen.getByText("Song q2"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "q2" }));
  });

  // ── Empty state ────────────────────────────────────────────────────────

  it("should show empty queue message when queue is empty", async () => {
    renderLyrics({ queue: [] });
    await waitFor(() => {
      expect(screen.getByText("Sin canciones en cola")).toBeInTheDocument();
    });
  });

  it("should call onSeek when a synced lyric line with timestamps is clicked", async () => {
    const onSeek = vi.fn();
    const lrcLines = ["[00:01.00]Line one", "[00:05.00]Line two"];
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: lrcLines, source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    renderLyrics({ onSeek });
    await waitFor(() => {
      expect(screen.getByText("Line one")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Line one"));
    expect(onSeek).toHaveBeenCalledWith(expect.any(Number));
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("should handle songs without thumbnails", () => {
    const noThumbSong = song("1", { thumbnails: undefined, thumbnail: undefined });
    renderLyrics({ song: noThumbSong });
    expect(screen.getByText("Song 1")).toBeInTheDocument();
  });

  it("should handle songs without duration in queue", () => {
    const queue = [song("q1", { duration: 0 })];
    renderLyrics({ queue });
    expect(screen.getByText("Song q1")).toBeInTheDocument();
  });

  it("should render MusicCover components", () => {
    renderLyrics();
    const covers = screen.getAllByTestId("music-cover");
    expect(covers.length).toBeGreaterThan(0);
  });

  // ── Estado inicial (antes del primer timestamp) ─────────────────────────

  it("keeps the first lines visible before the first timestamp is reached", async () => {
    const lyricsLines = ["[00:05.00]Line one", "[00:10.00]Line two"];
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: lyricsLines, source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    renderLyrics({ progressRef: { current: 0 } });
    await waitFor(() => {
      expect(screen.getByText("Line one")).toBeInTheDocument();
    });
    // currentLine === -1 → las primeras líneas tienen opacidad por distancia (0.64).
    const row = document.querySelector('[data-testid="lyric-line-0"]');
    expect(row).not.toBeNull();
    expect(row.style.opacity).toBe("0.64");
  });

  // ── Karaoke: resaltado palabra por palabra ───────────────────────────────

  it("highlights words progressively with karaoke timing", async () => {
    const lrcLines = ["[00:01.00]Hello beautiful world", "[00:30.00]Second line"];
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: lrcLines, source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    const progressRef = { current: 1.5 };
    renderLyrics({ progressRef });
    const row = await screen.findByTestId("lyric-line-0");
    expect(row).not.toBeNull();

    // El color iluminado es el primario; el no-iluminado es el terciario.
    // jsdom normaliza `style.color`, así que normalizamos el esperado igual.
    const unlitColor = (() => {
      const el = document.createElement("span");
      el.style.color = COLORS.textTertiary;
      return el.style.color;
    })();
    const litCount = () =>
      Array.from(row.querySelectorAll("span")).filter(
        (s) => s.style.color && s.style.color !== unlitColor,
      ).length;

    // Esperar a que la línea 0 quede ACTIVA (el karaoke solo corre en la activa)
    // Con el tick de 1000ms, el timeout por defecto (1000ms) queda al filo.
    await waitFor(() => expect(row.style.opacity).toBe("1"), { timeout: 3000 });
    await waitFor(() => expect(litCount()).toBeGreaterThan(0), { timeout: 3000 });
    const earlyCount = litCount();

    // Avanzar dentro de la línea → más palabras iluminadas
    act(() => {
      progressRef.current = 20;
    });
    await waitFor(
      () => {
        expect(litCount()).toBeGreaterThan(earlyCount);
      },
      { timeout: 3000 },
    );
  });

  // ── Recargar letras nunca re-usa el cache viejo ni hace doble fetch ──────

  it("reload forces a fresh fetch and never falls back to the stale cache", async () => {
    const cached = { lyrics: ["[00:01.00]Old version"], source: "cache" };
    const fresh = { lyrics: ["[00:01.00]New version"], source: "lrclib" };
    let fetchCount = 0;
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        fetchCount += 1;
        return Promise.resolve(fresh);
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    renderLyrics({ lyricsCacheRef: { current: { 1: cached } } });

    // Carga inicial: usa el cache → sin fetch
    await waitFor(() => {
      expect(screen.getByText("Old version")).toBeInTheDocument();
    });
    expect(fetchCount).toBe(0);

    // Abrir modal y recargar
    fireEvent.click(screen.getByTitle("Configuración de letras"));
    fireEvent.click(screen.getByText("Recargar letras"));

    // Muestra la versión fresca, NO la del cache
    await waitFor(() => {
      expect(screen.getByText("New version")).toBeInTheDocument();
    });
    // Un único fetch (sin doble request que dispare el rate-limit)
    expect(fetchCount).toBe(1);
  });
});

describe("parseLrc", () => {
  it("parses simple timestamps", () => {
    expect(parseLrc(["[00:01.00]Line one"])).toEqual([{ time: 1, text: "Line one" }]);
  });

  it("parses multiple timestamps per line into one entry each", () => {
    expect(parseLrc(["[00:10.50][01:20.00][03:00.00]Chorus"])).toEqual([
      { time: 10.5, text: "Chorus" },
      { time: 80, text: "Chorus" },
      { time: 180, text: "Chorus" },
    ]);
  });

  it("skips metadata tags and keeps only singable lines", () => {
    const lyrics = parseLrc([
      "[ti:Some Song]",
      "[ar:Some Artist]",
      "[by:Someone]",
      "[00:10.00]First",
      "[01:00.00]Second",
    ]);
    expect(lyrics).toEqual([
      { time: 10, text: "First" },
      { time: 60, text: "Second" },
    ]);
  });

  it("applies offset to subsequent lines", () => {
    // Offset en línea propia (formato estándar)
    const standalone = parseLrc(["[offset:+500]", "[00:10.00]First", "[00:20.00]Second"]);
    expect(standalone[0].time).toBeCloseTo(10.5);
    expect(standalone[1].time).toBeCloseTo(20.5);

    // Offset inline junto al timestamp (offset negativo)
    const inline = parseLrc(["[offset:-500][00:10.00]First"]);
    expect(inline[0].time).toBeCloseTo(9.5);
  });

  it("inherits the previous time for lines without timestamps", () => {
    expect(parseLrc(["[00:10.00]First", "plain continuation"])).toEqual([
      { time: 10, text: "First" },
      { time: 10, text: "plain continuation" },
    ]);
  });

  it("sorts output by time", () => {
    const lyrics = parseLrc(["[00:20.00]B", "[00:05.00]A"]);
    expect(lyrics.map((x) => x.text)).toEqual(["A", "B"]);
  });
});

describe("LyricsView auto-scroll latch", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores its own programmatic scroll but honors manual scrolls", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
    });
    const lrcLines = ["[00:01.00]Line one", "[00:10.00]Line two", "[00:15.00]Line three"];
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: lrcLines, source: "lrcLib" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
    const progressRef = { current: 3 };
    const { container } = renderLyrics({ progressRef });

    // Flush la cadena de promesas que resuelve el fetch de letras
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const scrollBox = container.querySelector('[data-testid="lyrics-scroll"]');
    expect(scrollBox).not.toBeNull();
    const calls = () => Element.prototype.scrollIntoView.mock.calls.length;

    // Tick 1000ms: progressSec=3 → línea 0 activa → scroll programático
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector('[data-testid="lyric-line-0"]').style.opacity).toBe("1");
    expect(calls()).toBe(1);

    // Scroll que dispararía el propio smooth scroll → ignorado por el latch
    act(() => {
      fireEvent.scroll(scrollBox);
    });

    // Siguiente línea: el auto-scroll sigue vivo y vuelve a centrar
    act(() => {
      progressRef.current = 12;
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector('[data-testid="lyric-line-1"]').style.opacity).toBe("1");
    expect(calls()).toBe(2);

    // Fuera de la ventana del latch: un scroll MANUAL desactiva el auto-scroll
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      fireEvent.scroll(scrollBox);
    });

    // La línea cambia pero ya no se centra sola
    act(() => {
      progressRef.current = 18;
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector('[data-testid="lyric-line-2"]').style.opacity).toBe("1");
    expect(calls()).toBe(2);

    // Tras el delay de reanudación, re-centra en la línea activa
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(calls()).toBe(3);
  });
});

// ── Contraste: superficies con el acento de fondo (regresión portada blanca) ─

describe("LyricsView — contraste dinámico sobre acento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((path) => {
      if (path.startsWith("/lyrics/")) {
        return Promise.resolve({ lyrics: null, source: "test" });
      }
      if (path.startsWith("/queue/")) {
        return Promise.resolve({ tracks: [] });
      }
      return Promise.resolve({});
    });
  });

  function openSettingsPanel(rowText) {
    fireEvent.click(screen.getByTitle("Configuración de letras"));
    fireEvent.click(screen.getByText(rowText));
  }

  it("el botón Buscar usa --neon-fg, nunca blanco fijo sobre el degradado", () => {
    renderLyrics();
    openSettingsPanel("Buscar letras");
    const btn = screen.getByText("Buscar").closest("button");
    expect(btn).toBeTruthy();
    expect(btn.style.color).toBe("var(--neon-fg)");
  });

  it("el check de fuente seleccionada usa --neon-fg sobre el acento", () => {
    renderLyrics();
    openSettingsPanel("Fuente de letras");
    const checks = screen.getAllByText("✓");
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(check.style.color).toBe("var(--neon-fg)");
    }
  });

  it("el knob del toggle Fallback encendido usa --neon-fg sobre el acento", () => {
    renderLyrics();
    openSettingsPanel("Fuente de letras");
    const label = screen.getByText("Fallback automático");
    const toggleBtn = label.parentElement.parentElement.querySelector("button");
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.firstElementChild.style.background).toBe("var(--neon-fg)");
  });

  it("el botón Guardar cambios usa --neon-fg, nunca blanco fijo", () => {
    renderLyrics();
    openSettingsPanel("Editar letras");
    const btn = screen.getByText("Guardar cambios").closest("button");
    expect(btn).toBeTruthy();
    expect(btn.style.color).toBe("var(--neon-fg)");
  });

  it("el knob del toggle Karaoke (sección Apariencia) usa --neon-fg", () => {
    renderLyrics();
    fireEvent.click(screen.getByTitle("Configuración de letras"));
    fireEvent.click(screen.getByText("Apariencia"));
    const label = screen.getByText("Karaoke");
    const toggleBtn = label.parentElement.parentElement.querySelector("button");
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.firstElementChild.style.background).toBe("var(--neon-fg)");
  });
});
