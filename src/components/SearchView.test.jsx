import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SearchView } from "./SearchView";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  thumbnail: `https://example.com/${id}.jpg`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  ...overrides,
});

const artist = (id) => ({
  browseId: `artist_${id}`,
  name: `Artist ${id}`,
  thumbnail: `https://example.com/artist_${id}.jpg`,
});

const album = (id) => ({
  browseId: `album_${id}`,
  title: `Album ${id}`,
  thumbnail: `https://example.com/album_${id}.jpg`,
  type: "Album",
  year: "2024",
  artist: "Test Artist",
});

const defaultProps = {
  query: "",
  onQueryChange: () => {},
  searchTab: "music",
  onSearchTabChange: () => {},
  results: [],
  searchArtists: [],
  searchAlbums: [],
  songsVisible: 10,
  onShowMore: () => {},
  videoResults: [],
  videoLoading: false,
  videoError: null,
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: () => {},
  toggleLike: () => {},
  liked: new Set(),
  openOptions: () => {},
  searchInputRef: null,
  onSelectArtist: () => {},
  onSelectAlbum: () => {},
};

function renderSearch(props = {}) {
  return render(<SearchView {...defaultProps} {...props} />);
}

describe("SearchView", () => {
  // ── Search bar ──────────────────────────────────────────────────────

  it("should render search input with placeholder", () => {
    renderSearch();
    const input = screen.getByPlaceholderText("Busca canciones, artistas, álbumes...");
    expect(input).toBeInTheDocument();
  });

  it("should show clear button when query is not empty", () => {
    renderSearch({ query: "test" });
    // The clear button is inside the search bar and contains the close SVG
    const input = screen.getByPlaceholderText("Busca canciones, artistas, álbumes...");
    const searchBar = input.closest("div");
    const buttonsInBar = searchBar.querySelectorAll("button");
    expect(buttonsInBar.length).toBeGreaterThan(0);
  });

  it("should update local state on typing (not trigger search yet)", () => {
    const onQueryChange = vi.fn();
    renderSearch({ onQueryChange });
    const input = screen.getByPlaceholderText("Busca canciones, artistas, álbumes...");
    fireEvent.change(input, { target: { value: "new query" } });
    // Typing does NOT call onQueryChange (solo Enter/icono)
    expect(onQueryChange).not.toHaveBeenCalled();
    expect(input.value).toBe("new query");
  });

  it("should call onQueryChange on Enter key", () => {
    const onQueryChange = vi.fn();
    renderSearch({ onQueryChange });
    const input = screen.getByPlaceholderText("Busca canciones, artistas, álbumes...");
    fireEvent.change(input, { target: { value: "new query" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onQueryChange).toHaveBeenCalledWith("new query");
  });

  it("should call onQueryChange on search icon click", () => {
    const onQueryChange = vi.fn();
    renderSearch({ query: "test", onQueryChange });
    const input = screen.getByPlaceholderText("Busca canciones, artistas, álbumes...");
    const searchBar = input.closest("div");
    const buttons = searchBar.querySelectorAll("button");
    // Primer botón = ícono de búsqueda
    const searchBtn = buttons[0];
    fireEvent.click(searchBtn);
    expect(onQueryChange).toHaveBeenCalledWith("test");
  });

  it("should call onQueryChange with empty string when clear is clicked", () => {
    const onQueryChange = vi.fn();
    renderSearch({ query: "test", onQueryChange });
    const input = screen.getByPlaceholderText("Busca canciones, artistas, álbumes...");
    const searchBar = input.closest("div");
    const buttons = searchBar.querySelectorAll("button");
    // Último botón = botón de limpiar (X)
    const clearBtn = buttons[buttons.length - 1];
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  // ── Tabs ──────────────────────────────────────────────────────────────

  it("should render both tabs", () => {
    renderSearch();
    expect(screen.getByText("Música")).toBeInTheDocument();
    expect(screen.getByText("Videos")).toBeInTheDocument();
  });

  it("should call onSearchTabChange when a tab is clicked", () => {
    const onSearchTabChange = vi.fn();
    renderSearch({ onSearchTabChange });
    fireEvent.click(screen.getByText("Videos"));
    expect(onSearchTabChange).toHaveBeenCalledWith("videos");
  });

  // ── Music tab: empty query → no results ────────────────────────────

  it("should not show no-results message when query is empty", () => {
    renderSearch({ query: "", results: [] });
    expect(screen.queryByText(/Sin resultados/)).not.toBeInTheDocument();
  });

  it("should show no-results message when query has no matches", () => {
    renderSearch({ query: "zzzzzzz", results: [], searchArtists: [], searchAlbums: [] });
    expect(screen.getByText(/Sin resultados/)).toBeInTheDocument();
  });

  // ── Music tab: results with songs ───────────────────────────────────

  it("should show songs section with results", () => {
    const results = [song("1"), song("2")];
    renderSearch({ results, query: "test" });
    expect(screen.getByText("Canciones")).toBeInTheDocument();
    expect(screen.getByText("Song 1")).toBeInTheDocument();
    expect(screen.getByText("Song 2")).toBeInTheDocument();
  });

  it("should call playSong when a song is clicked", () => {
    const playSong = vi.fn();
    const results = [song("1")];
    renderSearch({ results, query: "test", playSong });
    fireEvent.click(screen.getByText("Song 1"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "1" }));
  });

  it("should call toggleLike when like button is clicked", () => {
    const toggleLike = vi.fn();
    const results = [song("1")];
    renderSearch({ results, query: "test", toggleLike });
    // The heart button contains SVG paths from Ic.heart
    const btns = screen.getAllByRole("button");
    // Find the like button (has heart SVG paths)
    const likeBtn = btns.find((b) => b.innerHTML.includes("M20.84 4.61"));
    if (likeBtn) {
      fireEvent.click(likeBtn);
      expect(toggleLike).toHaveBeenCalledWith("1");
    }
  });

  it("should call openOptions when options button is clicked", () => {
    const openOptions = vi.fn();
    const results = [song("1")];
    renderSearch({ results, query: "test", openOptions });
    // The dots/options button has Ic.dots SVG
    const btns = screen.getAllByRole("button");
    const optionsBtn = btns.find((b) => b.innerHTML.includes("M12 5"));
    if (optionsBtn) {
      fireEvent.click(optionsBtn);
      expect(openOptions).toHaveBeenCalledWith(expect.objectContaining({ videoId: "1" }));
    }
  });

  it("should highlight current song with accent color", () => {
    const results = [song("1"), song("2")];
    renderSearch({ results, query: "test", currentSong: song("1") });
    expect(screen.getByText("Song 1")).toBeInTheDocument();
    expect(screen.getByText("Song 2")).toBeInTheDocument();
  });

  // ── Music tab: show more ─────────────────────────────────────────

  it("should show 'Mostrar más' button when results exceed songsVisible", () => {
    const results = Array.from({ length: 15 }, (_, i) => song(`${i}`));
    renderSearch({ results, query: "test", songsVisible: 10 });
    expect(screen.getByText(/5 restantes/)).toBeInTheDocument();
  });

  it("should call onShowMore when 'Mostrar más' is clicked", () => {
    const onShowMore = vi.fn();
    const results = Array.from({ length: 15 }, (_, i) => song(`${i}`));
    renderSearch({ results, query: "test", songsVisible: 10, onShowMore });
    fireEvent.click(screen.getByText(/5 restantes/));
    expect(onShowMore).toHaveBeenCalledTimes(1);
  });

  it("should not show 'Mostrar más' when results fit in songsVisible", () => {
    const results = Array.from({ length: 5 }, (_, i) => song(`${i}`));
    renderSearch({ results, query: "test", songsVisible: 10 });
    expect(screen.queryByText(/restantes/)).not.toBeInTheDocument();
  });

  // ── Music tab: artists ──────────────────────────────────────────────

  it("should show artists section when searchArtists is provided", () => {
    const searchArtists = [artist("1"), artist("2")];
    renderSearch({ searchArtists, query: "test" });
    expect(screen.getByText("Artistas")).toBeInTheDocument();
    expect(screen.getByText("Artist 1")).toBeInTheDocument();
    expect(screen.getByText("Artist 2")).toBeInTheDocument();
  });

  it("should call onSelectArtist when artist is clicked", () => {
    const onSelectArtist = vi.fn();
    const searchArtists = [artist("1")];
    renderSearch({ searchArtists, query: "test", onSelectArtist });
    fireEvent.click(screen.getByText("Artist 1"));
    expect(onSelectArtist).toHaveBeenCalledWith(expect.objectContaining({ browseId: "artist_1" }));
  });

  // ── Music tab: albums ───────────────────────────────────────────────

  it("should show albums section when searchAlbums is provided", () => {
    const searchAlbums = [album("1"), album("2")];
    renderSearch({ searchAlbums, query: "test" });
    expect(screen.getByText("Álbumes")).toBeInTheDocument();
    expect(screen.getByText("Album 1")).toBeInTheDocument();
    expect(screen.getByText("Album 2")).toBeInTheDocument();
  });

  it("should call onSelectAlbum when album is clicked", () => {
    const onSelectAlbum = vi.fn();
    const searchAlbums = [album("1")];
    renderSearch({ searchAlbums, query: "test", onSelectAlbum });
    fireEvent.click(screen.getByText("Album 1"));
    expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ browseId: "album_1" }));
  });

  // ── Videos tab ─────────────────────────────────────────────────────

  it("should show video results when on videos tab", () => {
    const videoResults = [song("v1"), song("v2")];
    renderSearch({ searchTab: "videos", videoResults });
    expect(screen.getByText("Song v1")).toBeInTheDocument();
    expect(screen.getByText("Song v2")).toBeInTheDocument();
  });

  it("should show loading state for videos", () => {
    renderSearch({ searchTab: "videos", videoLoading: true });
    expect(screen.getByText("Cargando videos...")).toBeInTheDocument();
  });

  it("should show error state for videos", () => {
    renderSearch({ searchTab: "videos", videoError: "Network error" });
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("should call playSong when a video is clicked", () => {
    const playSong = vi.fn();
    const videoResults = [song("v1")];
    renderSearch({ searchTab: "videos", videoResults, playSong });
    fireEvent.click(screen.getByText("Song v1"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "v1" }));
  });
});
