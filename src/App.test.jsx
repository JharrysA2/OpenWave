import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./utils/api";
import { winCtrl } from "./utils/windowControls";
import {
  __expireBootGrace,
  __resetHealth,
  isHeartbeatRunning,
  markOffline,
  markOnline,
} from "./utils/backendHealth";
import { contrastRatio, deriveTheme } from "./utils/colorTheme";
import App from "./App";

// ── Mock hooks ──────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
const mockToggleLike = vi.fn();
const mockPlaySong = vi.fn();
const mockSetDownloads = vi.fn();
const mockSetHistory = vi.fn();
const mockSetLiked = vi.fn();
const mockSetSongsVisible = vi.fn();
const mockSetSearchTab = vi.fn();
const mockRefreshPlaylists = vi.fn();
const mockRefreshLibrary = vi.fn();
const mockSetLyricsOpen = vi.fn();
const mockSetCrossfadeDuration = vi.fn();
const mockSetShuffleActive = vi.fn();
const mockToggleRepeatMode = vi.fn();
const mockSetDuration = vi.fn();
const mockAddToQueue = vi.fn();
const mockHandleNext = vi.fn();
const mockHandlePrev = vi.fn();
const mockHandleSeek = vi.fn();
const mockHandleVolume = vi.fn();
const mockHandleSearchChange = vi.fn();
const mockTogglePlay = vi.fn();

const sampleSong = {
  videoId: "vid123",
  title: "Test Song",
  artist: "Test Artist",
  thumbnail: "https://example.com/thumb.jpg",
  duration: 200,
};

const mockResults = [sampleSong];

// Respuesta JSON estándar para los stubs de fetch de los tests de navegación.
const jsonResponse = (data) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

const mockPlayer = {
  currentSong: null,
  queue: [],
  isPlaying: false,
  streamLoading: false,
  duration: 0,
  setDuration: mockSetDuration,
  volume: 0.7,
  crossfadeDuration: 0,
  setCrossfadeDuration: mockSetCrossfadeDuration,
  shuffleActive: false,
  setShuffleActive: mockSetShuffleActive,
  repeatMode: "off",
  toggleRepeatMode: mockToggleRepeatMode,
  lyricsOpen: false,
  setLyricsOpen: mockSetLyricsOpen,
  audioRef: { current: document.createElement("audio") },
  nextAudioRef: { current: document.createElement("audio") },
  progressRef: { current: 0 },
  loggedSongRef: { current: null },
  currentlyPlayingSongRef: { current: null },
  isSwappedRef: { current: false },
  playSong: mockPlaySong,
  togglePlay: mockTogglePlay,
  handleNext: mockHandleNext,
  handlePrev: mockHandlePrev,
  handleSeek: mockHandleSeek,
  handleVolume: mockHandleVolume,
  addToQueue: mockAddToQueue,
  handleSongEnded: vi.fn(),
};

vi.mock("./hooks/useToast", () => ({
  useToast: () => ({ toasts: [], show: mockToast }),
}));

vi.mock("./hooks/useSearch", () => ({
  useSearch: () => ({
    query: "",
    results: mockResults,
    searchArtists: [],
    searchAlbums: [],
    songsVisible: 10,
    setSongsVisible: mockSetSongsVisible,
    searchTab: "music",
    setSearchTab: mockSetSearchTab,
    videoResults: [],
    videoLoading: false,
    videoError: null,
    videoErrorCode: null,
    searchError: null,
    searchInputRef: { current: null },
    handleSearchChange: mockHandleSearchChange,
  }),
}));

vi.mock("./hooks/useLibrary", () => ({
  useLibrary: () => ({
    liked: new Set(),
    setLiked: mockSetLiked,
    likedMeta: {},
    history: [],
    setHistory: mockSetHistory,
    downloads: [],
    setDownloads: mockSetDownloads,
    playlists: [],
    toggleLike: mockToggleLike,
    mostPlayed: [],
    refreshPlaylists: mockRefreshPlaylists,
    status: "ready",
    error: null,
    refreshLibrary: mockRefreshLibrary,
  }),
}));

vi.mock("./hooks/usePlayer", () => ({
  usePlayer: () => mockPlayer,
}));

// ── Mock windowControls (factory inline por hoisting de vi.mock) ────────────────

vi.mock("./utils/windowControls", () => ({
  winCtrl: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  },
}));

// ── Mock child components ─────────────────────────────────────────────────────────

vi.mock("./components/SongOptionsSheet", () => ({
  SongOptionsSheet: ({ open, onClose, song, onGoToAlbum, onGoToArtist }) =>
    open ? (
      <div data-testid="song-options-sheet">
        Song Options - {song?.title}
        {/* Igual que el componente real: navega y cierra el sheet */}
        <button
          data-testid="go-to-album"
          onClick={() => {
            onGoToAlbum?.(song);
            onClose();
          }}
        >
          Ir al álbum
        </button>
        <button
          data-testid="go-to-artist"
          onClick={() => {
            onGoToArtist?.(song);
            onClose();
          }}
        >
          Ir al artista
        </button>
      </div>
    ) : null,
}));

vi.mock("./components/TrackPickerModal", () => ({
  TrackPickerModal: ({ open, onClose }) =>
    open ? <div data-testid="track-picker-modal">Track Picker</div> : null,
}));

vi.mock("./components/SelectionModal", () => ({
  SelectionModal: ({ open, songs, onDelete }) =>
    open ? <div data-testid="selection-modal">Selection - {songs?.length} songs</div> : null,
}));

vi.mock("./components/PlayerBar", () => ({
  PlayerBar: ({ song, isPlaying, onPlayPause, onNext, onPrev }) => (
    <div data-testid="player-bar">
      PlayerBar - {song?.title || "No Song"} - {isPlaying ? "Playing" : "Paused"}
    </div>
  ),
}));

vi.mock("./components/HomeView", () => {
  const HomeView = ({ currentSong, playSong, history, accentColor, openOptions }) => (
    <div data-testid="home-view">
      HomeView - {currentSong?.title || "No Song"} - {accentColor || "no-color"}
      {/* Acceso al sheet de 3 puntitos para probar la navegación ir-a-álbum/artista */}
      <button
        data-testid="open-song-options"
        onClick={() =>
          openOptions?.({ videoId: "vid123", title: "Test Song", artist: "Test Artist" })
        }
      >
        3-puntos
      </button>
    </div>
  );
  // MainRouter usa React.lazy(() => import(...)) → requiere el export default
  return { default: HomeView, HomeView };
});

vi.mock("./components/SearchView", () => {
  const SearchView = ({ query, results }) => (
    <div data-testid="search-view">
      SearchView - {query} - {results?.length} results
    </div>
  );
  return { default: SearchView, SearchView };
});

vi.mock("./components/LikedView", () => {
  const LikedView = ({ likedSongs }) => (
    <div data-testid="liked-view">LikedView - {likedSongs?.length} songs</div>
  );
  return { default: LikedView, LikedView };
});

vi.mock("./components/HistoryView", () => {
  const HistoryView = ({ history }) => (
    <div data-testid="history-view">HistoryView - {history?.length} items</div>
  );
  return { default: HistoryView, HistoryView };
});

vi.mock("./components/DownloadsView", () => {
  const DownloadsView = ({ downloads }) => (
    <div data-testid="downloads-view">DownloadsView - {downloads?.length} items</div>
  );
  return { default: DownloadsView, DownloadsView };
});

vi.mock("./components/SettingsPanel", () => {
  const SettingsPanel = ({ open, onClose, downloads, history }) =>
    open ? (
      <div data-testid="settings-panel">
        SettingsPanel - {downloads?.length} downloads - {history?.length} history
        <button data-testid="close-settings" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null;
  return { default: SettingsPanel, SettingsPanel };
});

vi.mock("./components/Toast", () => ({
  Toasts: ({ toasts }) => <div data-testid="toasts">Toasts - {toasts?.length}</div>,
}));

vi.mock("./components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }) => <div data-testid="error-boundary">{children}</div>,
}));

// ── Mock Icons ────────────────────────────────────────────────────────────────────

vi.mock("./icons/Icons", () => ({
  Ic: {
    waveIcon: <span data-testid="wave-icon">W</span>,
    home: <span data-testid="icon-home">H</span>,
    search: <span data-testid="icon-search">S</span>,
    heart: (filled) => (
      <span data-testid="icon-heart" data-filled={filled}>
        {filled ? "F" : "E"}
      </span>
    ),
    history: () => <span data-testid="icon-history">T</span>,
    download: () => <span data-testid="icon-download">D</span>,
  },
}));

// ── Mock constants (API) ──────────────────────────────────────────────────────────

vi.mock("./constants", () => ({
  API: "http://127.0.0.1:8765",
  FONT: "'DM Sans', system-ui, sans-serif",
  SW_SETTINGS_KEY: "sw_settings",
  DEFAULT_SETTINGS: {
    language: "es",
    pureBlack: false,
    defaultTab: "home",
    crossfade: 0,
    dynamicTheme: true,
    colorTransitionSpeed: 0,
  },
}));

// ── Mock localStorage ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.clearCache();
  // El chequeo de salud es INMEDIATO al arrancar: sin este stub, el fetch
  // real (colgado o rechazado) dejaba `checking` en vuelo y el banner /
  // BootScreen dependían del azar. Siempre "backend caído" y determinista.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════════════

describe("App — Componente principal", () => {
  // ── Render básico ────────────────────────────────────────────────────────────

  it("should render without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it("should render the ErrorBoundary wrapper", () => {
    render(<App />);
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
  });

  it("should render the OpenWave brand name", () => {
    render(<App />);
    const found = screen.getAllByText("OpenWave");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  // ── Navegación ───────────────────────────────────────────────────────────────

  it("should render all 5 navigation buttons", () => {
    render(<App />);
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByText("Buscar")).toBeInTheDocument();
    expect(screen.getByText("Me gusta")).toBeInTheDocument();
    expect(screen.getByText("Historial")).toBeInTheDocument();
    expect(screen.getByText("Descargas")).toBeInTheDocument();
  });

  it("should render HomeView by default", () => {
    render(<App />);
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
  });

  it("should navigate to SearchView when clicking Buscar", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Buscar"));
    // React.lazy + Suspense: la vista se resuelve de forma asíncrona
    expect(await screen.findByTestId("search-view")).toBeInTheDocument();
  });

  it("should navigate to LikedView when clicking Me gusta", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Me gusta"));
    expect(await screen.findByTestId("liked-view")).toBeInTheDocument();
  });

  it("should navigate to HistoryView when clicking Historial", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Historial"));
    expect(await screen.findByTestId("history-view")).toBeInTheDocument();
  });

  it("should navigate to DownloadsView when clicking Descargas", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Descargas"));
    expect(await screen.findByTestId("downloads-view")).toBeInTheDocument();
  });

  // ── Settings Panel ──────────────────────────────────────────────────────────

  it("should have a settings button with data-testid and title", () => {
    render(<App />);
    const btn = screen.getByTestId("settings-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("title", "Ajustes");
  });

  it("should open SettingsPanel when settings button is clicked", async () => {
    render(<App />);
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-btn"));
    // SettingsPanel también se carga con React.lazy → resolución asíncrona
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
  });

  it("should close SettingsPanel when close button inside panel is clicked", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("settings-btn"));
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("close-settings"));
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();
  });

  // ── ESC = atrás ────────────────────────────────────────────────────────────

  it("ESC desde Historial vuelve a Inicio", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Historial"));
    expect(await screen.findByTestId("history-view")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByTestId("home-view")).toBeInTheDocument();
    expect(screen.queryByTestId("history-view")).not.toBeInTheDocument();
  });

  it("ESC desde Descargas vuelve a Inicio", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Descargas"));
    expect(await screen.findByTestId("downloads-view")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByTestId("home-view")).toBeInTheDocument();
    expect(screen.queryByTestId("downloads-view")).not.toBeInTheDocument();
  });

  it("ESC en Inicio no hace nada (no hay dónde «atrás»)", () => {
    render(<App />);
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
  });

  it("ESC cierra la vista de detalle (álbum) y vuelve a la vista anterior", async () => {
    const fetchMock = vi.fn((input) => {
      const u = String(input);
      if (u.includes("/song/album/")) return jsonResponse({ browseId: "MPRE_test123" });
      if (u.includes("/health")) return jsonResponse({ status: "ok" });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByTestId("open-song-options"));
    expect(await screen.findByTestId("song-options-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("go-to-album"));
    await waitFor(() => expect(screen.queryByTestId("song-options-sheet")).not.toBeInTheDocument());
    // El detalle (álbum) tapa la home…
    await waitFor(() => expect(screen.queryByTestId("home-view")).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "Escape" });

    // …y ESC vuelve a la vista anterior
    expect(await screen.findByTestId("home-view")).toBeInTheDocument();
  });

  it("ESC con Ajustes abierto no navega por debajo (lo cierra el propio panel)", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("settings-btn"));
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    // App cede: el ESC de Ajustes vive en SettingsPanel (useEscClose), que en
    // este test está mockeado sin ESC → el panel sigue montado, sin navegar.
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  // ── Player Bar ──────────────────────────────────────────────────────────────

  it("should render the PlayerBar with no song by default", () => {
    render(<App />);
    expect(screen.getByTestId("player-bar")).toHaveTextContent("No Song");
  });

  it("should pass isPlaying=false to PlayerBar by default", () => {
    render(<App />);
    expect(screen.getByTestId("player-bar")).toHaveTextContent("Paused");
  });

  // ── Audio elements ──────────────────────────────────────────────────────────

  it("should render two hidden audio elements", () => {
    const { container } = render(<App />);
    const audios = container.querySelectorAll("audio[hidden]");
    expect(audios).toHaveLength(2);
  });

  // ── Toasts ──────────────────────────────────────────────────────────────────

  it("should render the Toasts container with zero messages", () => {
    render(<App />);
    expect(screen.getByTestId("toasts")).toHaveTextContent("Toasts - 0");
  });

  // ── Modals (initially hidden) ──────────────────────────────────────────────

  it("should not show SongOptionsSheet initially", () => {
    render(<App />);
    expect(screen.queryByTestId("song-options-sheet")).not.toBeInTheDocument();
  });

  it("should not show TrackPickerModal initially", () => {
    render(<App />);
    expect(screen.queryByTestId("track-picker-modal")).not.toBeInTheDocument();
  });

  it("should not show SelectionModal initially", () => {
    render(<App />);
    expect(screen.queryByTestId("selection-modal")).not.toBeInTheDocument();
  });

  // ── Custom Title Bar ─────────────────────────────────────────────────────────

  it("should render the custom title bar with data-tauri-drag-region", () => {
    const { container } = render(<App />);
    const dragRegion = container.querySelector("[data-tauri-drag-region]");
    expect(dragRegion).toBeInTheDocument();
    // Title bar should NOT have pointerEvents:none (it needs to be draggable)
    expect(dragRegion).not.toHaveStyle({ pointerEvents: "none" });
  });

  it("should render window control buttons in the title bar", () => {
    const { container } = render(<App />);
    const allSvgs = container.querySelectorAll("svg");
    // The title bar has 3 window control buttons with inline SVGs
    // We should see at least 3 SVGs total in the title bar area
    expect(allSvgs.length).toBeGreaterThan(0);
  });

  it("should call winCtrl.minimize when minimize button is clicked", () => {
    render(<App />);
    const buttons = screen.getAllByRole("button");
    const minimizeBtn = buttons.find((b) => b.title === "Minimizar");
    expect(minimizeBtn).toBeInTheDocument();
    fireEvent.click(minimizeBtn);
    expect(winCtrl.minimize).toHaveBeenCalled();
  });

  it("should call winCtrl.close when close button is clicked", () => {
    render(<App />);
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find((b) => b.title === "Cerrar");
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(winCtrl.close).toHaveBeenCalled();
  });

  it("la barra de título queda SIEMPRE por encima del splash y del BootScreen", () => {
    const { container } = render(<App />);
    const titlebar = container.querySelector(".app-titlebar");
    expect(titlebar).toBeInTheDocument();
    const z = Number.parseInt(titlebar.style.zIndex, 10);
    // #splash usa 2147483000 y el BootScreen de carga 1500000: la barra de
    // ventana (min/max/cerrar) no puede quedarse nunca debajo.
    expect(z).toBeGreaterThan(2147483000);
  });

  // ── 3 puntitos → Ir a álbum/artista desde cualquier pantalla ──────────────────

  it("3 puntitos → Ir al álbum navega aunque Ajustes esté abierto (cierra Ajustes/letras)", async () => {
    const fetchMock = vi.fn((input) => {
      const u = String(input);
      if (u.includes("/song/album/")) return jsonResponse({ browseId: "MPRE_test123" });
      if (u.includes("/health")) return jsonResponse({ status: "ok" });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    // Los 3 puntitos de una canción del Home
    fireEvent.click(screen.getByTestId("open-song-options"));
    expect(await screen.findByTestId("song-options-sheet")).toBeInTheDocument();
    // Ajustes abierto por encima: la navegación debe "atravesarlo"
    fireEvent.click(screen.getByTestId("settings-btn"));
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("go-to-album"));

    // Sin el fix, Ajustes seguía abierto y tapaba la vista de detalle
    await waitFor(() => expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/song/album/vid123"))).toBe(true);
    // La pantalla de letras se cierra para no tapar el detalle
    expect(mockSetLyricsOpen).toHaveBeenCalledWith(false);
    // El sheet de opciones se cierra solo
    expect(screen.queryByTestId("song-options-sheet")).not.toBeInTheDocument();
  });

  it("3 puntitos → Ir al artista navega desde cualquier pantalla y cierra la pantalla de letras", async () => {
    const fetchMock = vi.fn((input) => {
      const u = String(input);
      if (u.includes("/search?"))
        return jsonResponse({ artists: [{ browseId: "UC_test", name: "Test Artist" }] });
      if (u.includes("/health")) return jsonResponse({ status: "ok" });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByTestId("open-song-options"));
    expect(await screen.findByTestId("song-options-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("go-to-artist"));

    await waitFor(() => expect(mockSetLyricsOpen).toHaveBeenCalledWith(false));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/search?q=Test%20Artist"))).toBe(
      true,
    );
  });

  it("no muestra el toast «Error de reproducción» si el audio falla (petición)", () => {
    const { container } = render(<App />);
    const audio = container.querySelector("audio");
    expect(audio).toBeInTheDocument();
    audio.src = "http://127.0.0.1:8765/song/stream/vid123";
    Object.defineProperty(audio, "error", {
      value: { code: 4, message: "MEDIA_ERR_SRC_NOT_SUPPORTED" },
      configurable: true,
    });
    fireEvent.error(audio);
    expect(mockToast).not.toHaveBeenCalledWith("Error de reproducción", "error");
    expect(mockToast).not.toHaveBeenCalledWith("Error al reproducir", "error");
  });

  it("la selección de texto está deshabilitada en toda la app (salvo campos editables)", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("user-select: none;");
    expect(html).toContain("-webkit-user-select: none;");
    // Campos editables: la selección sigue habilitada para poder escribir
    expect(html).toMatch(/input,[\s\S]*?textarea,[\s\S]*?-webkit-user-select: text;/);
  });

  // ── Icons ───────────────────────────────────────────────────────────────────

  it("should render the OpenWave wave icon", () => {
    render(<App />);
    expect(screen.getByTestId("wave-icon")).toBeInTheDocument();
  });

  it("should render heart icon in navigation", () => {
    render(<App />);
    expect(screen.getByTestId("icon-heart")).toBeInTheDocument();
  });

  // ── CSS variables ──────────────────────────────────────────────────────────────

  it("should set the neon CSS variable on mount", () => {
    render(<App />);
    const root = document.documentElement;
    // El default (#a78bfa) se aplica pasando por deriveTheme como cualquier
    // color elegido → única fuente de verdad del acento.
    expect(root.style.getPropertyValue("--neon")).toBe(deriveTheme("#a78bfa").accent);
  });

  // ── SettingsPanel props ────────────────────────────────────────────────────

  it("should pass downloads and history counts to SettingsPanel", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("settings-btn"));
    expect(screen.getByTestId("settings-panel")).toHaveTextContent("0 downloads - 0 history");
  });

  // ── LikedSongs computed from useLibrary ───────────────────────────────────

  it("should compute likedSongs from results and liked Set", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Me gusta"));
    expect(screen.getByTestId("liked-view")).toHaveTextContent("0 songs");
  });

  // ── SearchView gets results from useSearch ─────────────────────────────────

  it("should pass search results count to SearchView", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Buscar"));
    expect(screen.getByTestId("search-view")).toHaveTextContent("1 results");
  });

  // ── All initial components mount together ─────────────────────────────────

  it("should mount with HomeView, PlayerBar, Toasts, and ErrorBoundary", () => {
    render(<App />);
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
    expect(screen.getByTestId("player-bar")).toBeInTheDocument();
    expect(screen.getByTestId("toasts")).toBeInTheDocument();
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Tests de conexión con el backend (heartbeat + banner + reconexión)
// ═══════════════════════════════════════════════════════════════════════════════

describe("App — conexión con el backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __resetHealth();
    mockPlayer.currentSong = null;
  });

  afterEach(() => {
    __resetHealth();
  });

  it("arranca el heartbeat al montar y lo detiene al desmontar", () => {
    const { unmount } = render(<App />);
    expect(isHeartbeatRunning()).toBe(true);

    unmount();
    expect(isHeartbeatRunning()).toBe(false);
  });

  it("no muestra el banner mientras hay conexión", () => {
    render(<App />);
    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
  });

  it("muestra el banner cuando se pierde la conexión", async () => {
    render(<App />);

    // El chequeo inicial rechaza (backend caído): se asienta antes de actuar
    // para no depender del orden de los microtasks.
    await act(async () => {});
    act(() => {
      markOffline("ECONNREFUSED");
    });

    expect(screen.getByTestId("connection-banner")).toHaveTextContent(
      "Sin conexión con el servidor",
    );
    // Código reportable visible en el banner (no hace falta copiar mensajes)
    expect(screen.getByTestId("connection-code")).toHaveTextContent("E-CNX-01");
  });

  it("al reconectar limpia la caché y refresca la biblioteca (sin toast)", async () => {
    const clearCache = vi.spyOn(api, "clearCache");
    render(<App />);

    await act(async () => {}); // primer chequeo fallido → offline
    act(() => {
      markOnline();
    });

    expect(clearCache).toHaveBeenCalled();
    expect(mockRefreshLibrary).toHaveBeenCalledTimes(1);
    // La reconexión es silenciosa: no se lanza ningún toast
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
  });

  it("con el backend caído muestra la pantalla de inicio con error + código", async () => {
    render(<App />);
    // Arranque: splash → BootScreen en estado "Iniciando…"
    expect(screen.getByTestId("boot-screen")).toBeInTheDocument();

    // Agotamos la ventana de gracia (30 s reales en producción) para que el
    // primer chequeo fallido resuelva el arranque con error + código.
    act(() => {
      __expireBootGrace();
    });

    // El primer chequeo falla → estado de error con código reportable
    await act(async () => {});
    expect(screen.getByTestId("status-state")).toBeInTheDocument();
    expect(screen.getByTestId("error-code")).toHaveTextContent("E-CNX-01");
    expect(screen.getByText("Reintentar")).toBeInTheDocument();
    expect(screen.getByText("Continuar sin conexión")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Tests de overlay opacity y colores de contraste
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mockea Image + canvas para inyectar una portada de un color uniforme y
 * disparar su onload. Devuelve `fireLoad()` para simular la carga.
 */
function installThumbnailMock([r, g, b]) {
  const total = 64 * 64;
  const data = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, ...rest) =>
    tag === "canvas" ? canvas : originalCreateElement(tag, ...rest),
  );

  let lastImage = null;
  class FakeImage {
    constructor() {
      this.crossOrigin = null;
      this.onload = null;
      this.onerror = null;
      this._src = null;
      lastImage = this;
    }
    set src(value) {
      this._src = value;
    }
    get src() {
      return this._src;
    }
  }
  vi.stubGlobal("Image", FakeImage);

  return {
    async fireLoad() {
      await act(async () => {
        lastImage?.onload?.();
      });
    },
  };
}

describe("App — Contraste y overlayOpacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPlayer.currentSong = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should set neon CSS variables to default purple when no extracted colors", () => {
    render(<App />);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--neon")).toBe(deriveTheme("#a78bfa").accent);
    // on-accent derivado (≥4.5:1 sobre #a78bfa) — antes #ffffff, que solo
    // daba ~2.6:1 y dejaba invisible el texto sobre botones con acento
    expect(root.style.getPropertyValue("--neon-fg")).toBe("#000001");
  });

  it("portada acromática → acento blanco y --neon-fg negro", async () => {
    mockPlayer.currentSong = {
      videoId: "bright123",
      title: "Bright Song",
      artist: "Bright Artist",
      thumbnail: "https://example.com/bright.jpg",
    };

    // Crema sin apenas croma (C ≈ 0.01) → el extractor la considera acromática
    const thumb = installThumbnailMock([250, 245, 235]);
    render(<App />);
    await thumb.fireLoad();

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--neon")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--neon-fg")).toBe("#111111");
  });

  it("portada cromática → on-accent con contraste ≥ 4.5:1 contra el acento", async () => {
    mockPlayer.currentSong = {
      videoId: "blue789",
      title: "Blue Song",
      artist: "Blue Artist",
      thumbnail: "https://example.com/blue.jpg",
    };

    const thumb = installThumbnailMock([40, 120, 200]);
    render(<App />);
    await thumb.fireLoad();

    const root = document.documentElement;
    const neon = root.style.getPropertyValue("--neon");
    const fg = root.style.getPropertyValue("--neon-fg");
    expect(neon).not.toBe(deriveTheme("#a78bfa").accent);
    expect(fg).not.toBe("");
    expect(contrastRatio(fg, neon)).toBeGreaterThanOrEqual(4.5);
  });

  it("should NOT set --neon-text-* CSS variables (proving revert from global contrast)", () => {
    render(<App />);
    const root = document.documentElement;
    // Después del revert, estas variables NO deben existir
    expect(root.style.getPropertyValue("--neon-text-primary")).toBe("");
    expect(root.style.getPropertyValue("--neon-text-secondary")).toBe("");
    expect(root.style.getPropertyValue("--neon-text-player-title")).toBe("");
    expect(root.style.getPropertyValue("--neon-icon-default")).toBe("");
    // Pero --neon-fg y --neon SÍ deben seguir existiendo
    expect(root.style.getPropertyValue("--neon-fg")).toBeTruthy();
    expect(root.style.getPropertyValue("--neon")).toBeTruthy();
    // --neon-btn / --neon-btn-hover ya NO se escriben inline: viven en
    // src/dynamic-theme.css como color-mix(var(--neon) …).
    expect(root.style.getPropertyValue("--neon-btn")).toBe("");
    expect(root.style.getPropertyValue("--neon-btn-hover")).toBe("");
  });
});

// ── Barra lateral retráctil ────────────────────────────────────────────────────

describe("Barra lateral retráctil", () => {
  it("el botón « la retrae y el botón » flotante la vuelve a mostrar", () => {
    const { container } = render(<App />);
    const sidebar = container.querySelector(".app-sidebar");
    expect(sidebar.getAttribute("data-state")).toBe("open");
    expect(sidebar.style.width).toBe("200px");
    expect(screen.queryByTestId("sidebar-show-btn")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("sidebar-collapse-btn"));
    expect(sidebar.getAttribute("data-state")).toBe("closed");
    expect(sidebar.style.width).toBe("0px");
    expect(screen.getByTestId("sidebar-show-btn")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("sidebar-show-btn"));
    expect(sidebar.getAttribute("data-state")).toBe("open");
    expect(sidebar.style.width).toBe("200px");
    expect(screen.queryByTestId("sidebar-show-btn")).not.toBeInTheDocument();
  });

  it("la visibilidad elegida queda persistida en los ajustes", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-collapse-btn"));
    // En este archivo SW_SETTINGS_KEY está mockeado como "sw_settings"
    expect(JSON.parse(localStorage.getItem("sw_settings")).sidebarVisible).toBe(false);
    fireEvent.click(screen.getByTestId("sidebar-show-btn"));
    expect(JSON.parse(localStorage.getItem("sw_settings")).sidebarVisible).toBe(true);
  });

  it("arranca oculta si los ajustes guardados dicen sidebarVisible=false", () => {
    localStorage.setItem("sw_settings", JSON.stringify({ sidebarVisible: false }));
    const { container } = render(<App />);
    const sidebar = container.querySelector(".app-sidebar");
    expect(sidebar.style.width).toBe("0px");
    // El núcleo (con la marca y la nav) queda visibility:hidden: fuera del
    // tab-order y de los clics mientras la barra está retraída
    expect(sidebar.firstElementChild.style.visibility).toBe("hidden");
    expect(screen.getByTestId("sidebar-show-btn")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-collapse-btn")).toBeInTheDocument();
  });

  it("Ctrl+B alterna mostrar/ocultar; Ctrl+Shift+B y ESC no", () => {
    const { container } = render(<App />);
    const sidebar = container.querySelector(".app-sidebar");
    expect(sidebar.style.width).toBe("200px");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(sidebar.style.width).toBe("0px");
    expect(screen.getByTestId("sidebar-show-btn")).toBeInTheDocument();

    // Mayúsculas también cuentan (Ctrl+B real con Caps Lock / Shift implícito)
    fireEvent.keyDown(window, { key: "B", ctrlKey: true });
    expect(sidebar.style.width).toBe("200px");

    // Ctrl+Shift+B queda fuera (atajos combinados del sistema)
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, shiftKey: true });
    expect(sidebar.style.width).toBe("200px");

    // ESC sigue siendo "atrás": no retrae la barra (espec congelada)
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sidebar.style.width).toBe("200px");
  });

  it("la animación es transición de ancho con recorte y núcleo a ancho fijo", () => {
    const { container } = render(<App />);
    const sidebar = container.querySelector(".app-sidebar");
    expect(sidebar.style.overflow).toBe("hidden");
    expect(sidebar.style.transition).toContain("width");
    // El interior va a ancho fijo: durante la retracción el texto se
    // recorta, nunca se "exprime"
    const core = sidebar.firstElementChild;
    expect(core.style.width).toBe("200px");
    expect(core.style.transition).toContain("transform");
    expect(core.style.transition).toContain("opacity");
    expect(core.style.transition).toContain("visibility");
  });
});
