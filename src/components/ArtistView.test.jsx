import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("./MusicCover", () => ({
  MusicCover: () => <div data-testid="mock-music-cover" />,
}));

import ArtistView from "./ArtistView";
import { api } from "../utils/api";

const artistData = {
  browseId: "art1",
  name: "Test Artist",
  thumbnail: "artist.jpg",
  songs: [
    { videoId: "s1", title: "Song 1", artist: "Test Artist", thumbnail: "a.jpg" },
    { videoId: "s2", title: "Song 2", artist: "Test Artist", thumbnail: "b.jpg" },
  ],
  albums: [{ browseId: "alb1", title: "Album 1", thumbnail: "alb.jpg" }],
};

const allAlbumsData = {
  albums: [
    { browseId: "alb1", title: "Album 1", thumbnail: "alb.jpg" },
    { browseId: "alb2", title: "Album 2", thumbnail: "alb2.jpg" },
    { browseId: "alb3", title: "Album 3", thumbnail: "alb3.jpg" },
  ],
  singles: [{ browseId: "sng1", title: "Single 1", thumbnail: "sng.jpg" }],
};

const defaultProps = {
  browseId: "art1",
  accentColor: "#a78bfa",
  currentSong: null,
  playSong: vi.fn(),
  toggleLike: vi.fn(),
  liked: new Set(),
  openOptions: vi.fn(),
  onGoToAlbum: vi.fn(),
  onGoToRelatedArtist: vi.fn(),
  onOpenArtistSongs: vi.fn(),
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path.startsWith("/artist/related")) {
      return Promise.resolve({ results: [] });
    }
    if (path.endsWith("/albums")) {
      return Promise.resolve(allAlbumsData);
    }
    return Promise.resolve(artistData);
  });
});

describe("ArtistView", () => {
  it("should fetch and render artist name and songs", async () => {
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Test Artist")).toBeInTheDocument();
    });
    expect(screen.getByText("Song 1")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/artist/art1");
  });

  it("should show skeleton while loading", () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<ArtistView {...defaultProps} />);
    expect(container.querySelector(".skeleton")).toBeTruthy();
  });

  it("should show error state with back button when fetch fails", async () => {
    api.get.mockRejectedValue(new Error("network"));
    render(<ArtistView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("No se pudo cargar el artista")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Volver"));
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it("should call playSong when a song is clicked", async () => {
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Song 1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Song 1"));
    expect(defaultProps.playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "s1" }));
  });

  it("should navigate to album when an album is clicked", async () => {
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Album 1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Album 1"));
    expect(defaultProps.onGoToAlbum).toHaveBeenCalledWith(
      expect.objectContaining({ browseId: "alb1" }),
    );
  });

  it("should render without a browseId (no crash)", () => {
    const { container } = render(<ArtistView {...defaultProps} browseId={null} />);
    expect(container.firstChild).toBeTruthy();
  });

  // ── Contraste: superficies con el acento de fondo (regresión portada blanca)
  it("el botón Seguir usa --neon-fg, nunca texto negro fijo", async () => {
    const { container } = render(<ArtistView {...defaultProps} accentColor="#ffffff" />);
    await waitFor(() => {
      expect(screen.getByText("Test Artist")).toBeInTheDocument();
    });
    const follow = [...container.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Seguir" && b.style.background === "rgb(255, 255, 255)",
    );
    expect(follow).toBeTruthy();
    expect(follow.style.color).toContain("var(--neon-fg)");
  });

  // ── Rendimiento: blur moderado en el banner (regresión de raster GPU) ──
  it("el banner del artista usa blur(8px), no blur(12px)", async () => {
    const { container } = render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Test Artist")).toBeInTheDocument();
    });
    const banner = container.querySelector('img[aria-hidden="true"]');
    expect(banner).toBeTruthy();
    expect(banner.style.filter).toContain("blur(8px)");
    expect(banner.style.filter).not.toContain("12px");
  });
});

describe("ArtistView — «Ver todas las canciones» y álbumes completos", () => {
  it("should open the full-songs screen with the artist id and name", async () => {
    const onOpenArtistSongs = vi.fn();
    render(<ArtistView {...defaultProps} onOpenArtistSongs={onOpenArtistSongs} />);
    await waitFor(() => {
      expect(screen.getByText("Ver todas las canciones")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Ver todas las canciones"));
    expect(onOpenArtistSongs).toHaveBeenCalledWith({
      browseId: "art1",
      name: "Test Artist",
    });
  });

  it("should preview only the top 5 songs (el catálogo va en la pantalla nueva)", async () => {
    api.get.mockImplementation((path) => {
      if (path.startsWith("/artist/related")) return Promise.resolve({ results: [] });
      if (path.endsWith("/albums")) return Promise.resolve({ albums: [], singles: [] });
      return Promise.resolve({
        ...artistData,
        songs: Array.from({ length: 8 }, (_, i) => ({
          videoId: `v${i}`,
          title: `Top ${i}`,
          artist: "Test Artist",
          thumbnail: "x.jpg",
        })),
      });
    });
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Top 0")).toBeInTheDocument();
    });
    expect(screen.getByText("Top 4")).toBeInTheDocument();
    expect(screen.queryByText("Top 5")).not.toBeInTheDocument();
  });

  it("should fetch ALL albums from the paginated endpoint and render them", async () => {
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Album 1")).toBeInTheDocument();
    });
    // El endpoint paginado se pide y sus resultados se pintan (2 extra + 1 single)
    expect(api.get).toHaveBeenCalledWith("/artist/art1/albums");
    await waitFor(() => {
      expect(screen.getByText("Album 2")).toBeInTheDocument();
      expect(screen.getByText("Album 3")).toBeInTheDocument();
      expect(screen.getByText("Single 1")).toBeInTheDocument();
    });
  });

  it("keeps the first page when the paginated albums call fails", async () => {
    api.get.mockImplementation((path) => {
      if (path.startsWith("/artist/related")) return Promise.resolve({ results: [] });
      if (path.endsWith("/albums")) return Promise.reject(new Error("net"));
      return Promise.resolve(artistData);
    });
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Album 1")).toBeInTheDocument();
    });
    // Sin romper: la primera página de get_artist se queda visible
    expect(screen.queryByText("No se pudo cargar el artista")).not.toBeInTheDocument();
  });

  it("ordena los álbumes de lo más reciente a lo más viejo (sin año al final)", async () => {
    api.get.mockImplementation((path) => {
      if (path.startsWith("/artist/related")) return Promise.resolve({ results: [] });
      if (path.endsWith("/albums")) {
        return Promise.resolve({
          albums: [
            { browseId: "a99", title: "Viejo 1999", thumbnail: "x.jpg", year: "1999" },
            { browseId: "a24", title: "Nuevo 2024", thumbnail: "x.jpg", year: "2024" },
          ],
          singles: [
            { browseId: "s21", title: "Single 2021", thumbnail: "x.jpg", year: "2021" },
            { browseId: "sXX", title: "Sin año", thumbnail: "x.jpg", year: "" },
          ],
        });
      }
      return Promise.resolve(artistData);
    });
    render(<ArtistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Nuevo 2024")).toBeInTheDocument();
      expect(screen.getByText("Sin año")).toBeInTheDocument();
    });
    // La sección «Álbumes» pinta la lista combinada en este orden:
    const section = screen.getByText("Álbumes").parentElement.textContent;
    const at = (t) => section.indexOf(t);
    expect(at("Nuevo 2024")).toBeLessThan(at("Single 2021"));
    expect(at("Single 2021")).toBeLessThan(at("Viejo 1999"));
    expect(at("Viejo 1999")).toBeLessThan(at("Sin año"));
  });
});
