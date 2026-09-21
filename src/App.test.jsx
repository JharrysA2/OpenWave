import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./utils/api";
import { winCtrl } from "./utils/windowControls";
import { __resetHealth, isHeartbeatRunning, markOffline, markOnline } from "./utils/backendHealth";
import { contrastRatio } from "./utils/colorTheme";
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
    searchInputRef: { current: null },
    handleSearchChange: mockHandleSearchChange,
  }),
}));

vi.mock("./hooks/useLibrary", () => ({
  useLibrary: () => ({
    liked: new Set(),
    setLiked: mockSetLiked,
    history: [],
    setHistory: mockSetHistory,
    downloads: [],
    setDownloads: mockSetDownloads,
    playlists: [],
    toggleLike: mockToggleLike,
    mostPlayed: [],
    refreshPlaylists: mockRefreshPlaylists,
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
  SongOptionsSheet: ({ open, onClose, song }) =>
    open ? <div data-testid="song-options-sheet">Song Options - {song?.title}</div> : null,
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

vi.mock("./components/HomeView", () => ({
  HomeView: ({ currentSong, playSong, history, accentColor }) => (
    <div data-testid="home-view">
      HomeView - {currentSong?.title || "No Song"} - {accentColor || "no-color"}
    </div>
  ),
}));

vi.mock("./components/SearchView", () => ({
  SearchView: ({ query, results }) => (
    <div data-testid="search-view">
      SearchView - {query} - {results?.length} results
    </div>
  ),
}));

vi.mock("./components/LikedView", () => ({
  LikedView: ({ likedSongs }) => (
    <div data-testid="liked-view">LikedView - {likedSongs?.length} songs</div>
  ),
}));

vi.mock("./components/HistoryView", () => ({
  HistoryView: ({ history }) => (
    <div data-testid="history-view">HistoryView - {history?.length} items</div>
  ),
}));

vi.mock("./components/DownloadsView", () => ({
  DownloadsView: ({ downloads }) => (
    <div data-testid="downloads-view">DownloadsView - {downloads?.length} items</div>
  ),
}));

vi.mock("./components/SettingsPanel", () => ({
  SettingsPanel: ({ open, onClose, downloads, history }) =>
    open ? (
      <div data-testid="settings-panel">
        SettingsPanel - {downloads?.length} downloads - {history?.length} history
        <button data-testid="close-settings" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

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
    cornerRadius: 12,
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

  it("should render the SoundWave brand name", () => {
    render(<App />);
    const found = screen.getAllByText("SoundWave");
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

  it("should navigate to SearchView when clicking Buscar", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Buscar"));
    expect(screen.getByTestId("search-view")).toBeInTheDocument();
  });

  it("should navigate to LikedView when clicking Me gusta", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Me gusta"));
    expect(screen.getByTestId("liked-view")).toBeInTheDocument();
  });

  it("should navigate to HistoryView when clicking Historial", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Historial"));
    expect(screen.getByTestId("history-view")).toBeInTheDocument();
  });

  it("should navigate to DownloadsView when clicking Descargas", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Descargas"));
    expect(screen.getByTestId("downloads-view")).toBeInTheDocument();
  });

  // ── Settings Panel ──────────────────────────────────────────────────────────

  it("should have a settings button with data-testid and title", () => {
    render(<App />);
    const btn = screen.getByTestId("settings-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("title", "Ajustes");
  });

  it("should open SettingsPanel when settings button is clicked", () => {
    render(<App />);
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-btn"));
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  it("should close SettingsPanel when close button inside panel is clicked", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("settings-btn"));
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("close-settings"));
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();
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

  // ── Icons ───────────────────────────────────────────────────────────────────

  it("should render the SoundWave wave icon", () => {
    render(<App />);
    expect(screen.getByTestId("wave-icon")).toBeInTheDocument();
  });

  it("should render heart icon in navigation", () => {
    render(<App />);
    expect(screen.getByTestId("icon-heart")).toBeInTheDocument();
  });

  // ── CSS variables ──────────────────────────────────────────────────────────────

  it("should set CSS variables for neon and corner radius on mount", () => {
    render(<App />);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--corner-radius")).toBe("12px");
    expect(root.style.getPropertyValue("--neon")).toBe("#a78bfa");
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

  it("muestra el banner cuando se pierde la conexión", () => {
    render(<App />);

    act(() => {
      markOffline("ECONNREFUSED");
    });

    expect(screen.getByTestId("connection-banner")).toHaveTextContent(
      "Sin conexión con el servidor",
    );
  });

  it("al reconectar limpia la caché, refresca playlists y avisa al usuario", () => {
    const clearCache = vi.spyOn(api, "clearCache");
    render(<App />);

    act(() => {
      markOffline("down");
    });
    act(() => {
      markOnline();
    });

    expect(clearCache).toHaveBeenCalled();
    expect(mockRefreshPlaylists).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith("Conexión restablecida", "success");
    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
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
    expect(root.style.getPropertyValue("--neon")).toBe("#a78bfa");
    expect(root.style.getPropertyValue("--neon-fg")).toBe("#ffffff");
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
    expect(neon).not.toBe("#a78bfa");
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
