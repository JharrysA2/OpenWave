import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LikedView from "./LikedView";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `Liked Song ${id}`,
  artist: `Artist ${id}`,
  thumbnail: `https://example.com/${id}.jpg`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  ...overrides,
});

const album = {
  browseId: "MPREb_album1",
  title: "Álbum de Prueba",
  artist: "Artista Álbum",
  type: "Álbum",
  thumbnail: "https://example.com/album.jpg",
};

const followedArtist = {
  browseId: "UC_artist1",
  name: "Artista Seguida",
  thumbnail: "https://example.com/artist.jpg",
};

const defaultProps = {
  likedSongs: [],
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: vi.fn(),
  toggleLike: vi.fn(),
  openOptions: vi.fn(),
  liked: new Set(),
  likedAlbums: [],
  followedArtists: [],
  openEntityOptions: vi.fn(),
  playAlbum: vi.fn(),
  goToAlbum: vi.fn(),
  goToArtist: vi.fn(),
};

function renderLiked(props = {}) {
  return render(<LikedView {...defaultProps} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LikedView", () => {
  // ── Hero + estado vacío ─────────────────────────────────────────

  it("should show hero and empty state when no liked songs", () => {
    renderLiked();
    expect(screen.getByText("Me gusta")).toBeInTheDocument();
    expect(screen.getByText("Dale me gusta a canciones para verlas aquí")).toBeInTheDocument();
  });

  it("should render the 3 library tabs", () => {
    renderLiked();
    expect(screen.getByText("Canciones")).toBeInTheDocument();
    expect(screen.getByText("Álbumes")).toBeInTheDocument();
    expect(screen.getByText("Artistas")).toBeInTheDocument();
  });

  // ── Pestaña Canciones (estilo playlist) ─────────────────────────

  it("should render list of liked songs", () => {
    const likedSongs = [song("1"), song("2")];
    renderLiked({ likedSongs });
    expect(screen.getByText("Liked Song 1")).toBeInTheDocument();
    expect(screen.getByText("Liked Song 2")).toBeInTheDocument();
    expect(screen.getByText("Artist 1")).toBeInTheDocument();
    expect(screen.getByText("Artist 2")).toBeInTheDocument();
  });

  it("should call playSong with the full list as queue", () => {
    const playSong = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, playSong });
    fireEvent.click(screen.getByText("Liked Song 1"));
    expect(playSong.mock.calls[0][0]).toMatchObject({ videoId: "1" });
    expect(playSong.mock.calls[0][3]).toEqual(likedSongs);
  });

  it("should call toggleLike when heart is clicked", () => {
    const toggleLike = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, toggleLike, liked: new Set(["1"]) });
    fireEvent.click(screen.getByTitle("Quitar de Me gusta"));
    expect(toggleLike).toHaveBeenCalledWith("1", expect.objectContaining({ videoId: "1" }));
  });

  it("should call openOptions when dots button is clicked", () => {
    const openOptions = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, openOptions });
    fireEvent.click(screen.getByTitle("Más opciones"));
    expect(openOptions).toHaveBeenCalledWith(expect.objectContaining({ videoId: "1" }));
  });

  // ── Pestaña Álbumes ─────────────────────────────────────────────

  it("should show empty state in Álbumes tab when none liked", () => {
    renderLiked();
    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.getByText(/Dale me gusta a álbumes/)).toBeInTheDocument();
  });

  it("should render liked album cards with play and options", () => {
    const playAlbum = vi.fn();
    const openEntityOptions = vi.fn();
    const goToAlbum = vi.fn();
    renderLiked({ likedAlbums: [album], playAlbum, openEntityOptions, goToAlbum });

    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.getByText("Álbum de Prueba")).toBeInTheDocument();

    // Click en la tarjeta → navega al álbum
    fireEvent.click(screen.getByText("Álbum de Prueba"));
    expect(goToAlbum).toHaveBeenCalledWith("MPREb_album1");

    // ▶ de la tarjeta → reproduce el álbum
    fireEvent.click(screen.getByTitle("Reproducir"));
    expect(playAlbum).toHaveBeenCalledWith(album, false);

    // ⋮ de la tarjeta → hoja de opciones del álbum
    fireEvent.click(screen.getByTitle("Más opciones"));
    expect(openEntityOptions).toHaveBeenCalledWith("album", album);
  });

  // ── Pestaña Artistas ────────────────────────────────────────────

  it("should show empty state in Artistas tab when none followed", () => {
    renderLiked();
    fireEvent.click(screen.getByText("Artistas"));
    expect(screen.getByText(/Sigue artistas/)).toBeInTheDocument();
  });

  it("should render followed artist cards", () => {
    const goToArtist = vi.fn();
    const openEntityOptions = vi.fn();
    renderLiked({ followedArtists: [followedArtist], goToArtist, openEntityOptions });

    fireEvent.click(screen.getByText("Artistas"));
    expect(screen.getByText("Artista Seguida")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Artista Seguida"));
    expect(goToArtist).toHaveBeenCalledWith("UC_artist1");

    fireEvent.click(screen.getByTitle("Más opciones"));
    expect(openEntityOptions).toHaveBeenCalledWith("artist", followedArtist);
  });

  // ── Contadores ──────────────────────────────────────────────────

  it("should show totals in the hero subtitle", () => {
    renderLiked({
      likedSongs: [song("1"), song("2")],
      likedAlbums: [album],
      followedArtists: [followedArtist],
    });
    expect(screen.getByTestId("library-summary")).toHaveTextContent("2 canciones");
    expect(screen.getByTestId("library-summary")).toHaveTextContent("1 álbum");
    expect(screen.getByTestId("library-summary")).toHaveTextContent("1 artista");
  });

  // ── Hover del hero (glass sutil, sin estados "pegados") ─────────

  it("should apply soft glass hover on Aleatorio and restore it on leave", () => {
    renderLiked({ likedSongs: [song("1")] });
    const shuffle = screen.getByRole("button", { name: /Aleatorio/ });
    const baseBg = shuffle.style.background;
    fireEvent.mouseEnter(shuffle);
    expect(shuffle.style.background).toContain("linear-gradient");
    expect(shuffle.style.background).not.toBe(baseBg);
    fireEvent.mouseLeave(shuffle);
    expect(shuffle.style.background).toBe(baseBg);
  });

  it("should brighten the primary Reproducir button on hover without a white layer", () => {
    renderLiked({ likedSongs: [song("1")] });
    const play = screen.getByRole("button", { name: /Reproducir/ });
    const baseBg = play.style.background;
    fireEvent.mouseEnter(play);
    // El acento no se pisa con blanco: solo brillo + feedback
    expect(play.style.background).toBe(baseBg);
    expect(play.style.filter).toBe("brightness(1.1)");
    fireEvent.mouseLeave(play);
    expect(play.style.filter).toBe("");
    expect(play.style.background).toBe(baseBg);
  });
});
