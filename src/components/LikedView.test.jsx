import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  api: {
    addToPlaylist: vi.fn(),
  },
}));

import LikedView from "./LikedView";
import { api } from "../utils/api";

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
  playlists: [],
  refreshPlaylists: vi.fn(),
  toast: vi.fn(),
  fetchAlbumTracks: vi.fn(async () => []),
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

  it("should ring the primary Reproducir button on hover without a white layer", () => {
    renderLiked({ likedSongs: [song("1")] });
    const play = screen.getByRole("button", { name: /Reproducir/ });
    const baseBg = play.style.background;
    fireEvent.mouseEnter(play);
    // El acento no se pisa con blanco: anillo adaptativo vía --neon-fg, que sí
    // se ve con acentos casi blancos (brightness(1.1) no lo era)
    expect(play.style.background).toBe(baseBg);
    expect(play.style.boxShadow).toContain("var(--neon-fg)");
    fireEvent.mouseLeave(play);
    expect(play.style.boxShadow).toBe("");
    expect(play.style.background).toBe(baseBg);
  });

  // ── Reproducción por pestaña ───────────────────────────────────

  it("Reproducir in Canciones plays the first song with the full queue", () => {
    const playSong = vi.fn();
    renderLiked({ likedSongs: [song("1"), song("2")], playSong });
    fireEvent.click(screen.getByTestId("hero-play"));
    expect(playSong.mock.calls[0][0]).toMatchObject({ videoId: "1" });
    expect(playSong.mock.calls[0][3]).toHaveLength(2);
  });

  it("Aleatorio in Canciones shuffles the liked queue", () => {
    const playSong = vi.fn();
    const likedSongs = [song("1"), song("2"), song("3")];
    renderLiked({ likedSongs, playSong });
    fireEvent.click(screen.getByTestId("hero-shuffle"));
    expect(playSong).toHaveBeenCalledTimes(1);
    // La cola es una permutación de los «me gusta», no la lista original
    expect(playSong.mock.calls[0][3].map((s) => s.videoId).sort()).toEqual(["1", "2", "3"]);
    expect(playSong.mock.calls[0][0]).toBe(playSong.mock.calls[0][3][0]);
  });

  it("Reproducir in Álbumes plays the FIRST album only", () => {
    const playAlbum = vi.fn();
    const second = { ...album, browseId: "MPREb_album2", title: "Segundo Álbum" };
    renderLiked({ likedAlbums: [album, second], playAlbum });
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByTestId("hero-play"));
    expect(playAlbum).toHaveBeenCalledTimes(1);
    expect(playAlbum).toHaveBeenCalledWith(album, false);
  });

  it("Aleatorio in Álbumes shuffles the tracks of ALL albums", async () => {
    const playSong = vi.fn();
    const fetchAlbumTracks = vi.fn(async (a) => [
      { videoId: `${a.browseId}-t1` },
      { videoId: `${a.browseId}-t2` },
    ]);
    const second = { ...album, browseId: "MPREb_album2", title: "Segundo Álbum" };
    renderLiked({ likedAlbums: [album, second], playSong, fetchAlbumTracks });
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByTestId("hero-shuffle"));
    await waitFor(() => expect(playSong).toHaveBeenCalledTimes(1));
    expect(fetchAlbumTracks).toHaveBeenCalledTimes(2);
    const queueIds = playSong.mock.calls[0][3].map((s) => s.videoId).sort();
    expect(queueIds).toEqual([
      "MPREb_album1-t1",
      "MPREb_album1-t2",
      "MPREb_album2-t1",
      "MPREb_album2-t2",
    ]);
    expect(playSong.mock.calls[0][0]).toBe(playSong.mock.calls[0][3][0]);
  });

  it("hides the play/shuffle buttons in the Artistas tab", () => {
    renderLiked({ likedSongs: [song("1")], followedArtists: [followedArtist] });
    expect(screen.getByTestId("hero-play")).toBeInTheDocument();
    expect(screen.getByTestId("hero-shuffle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Artistas"));
    expect(screen.queryByTestId("hero-play")).toBeNull();
    expect(screen.queryByTestId("hero-shuffle")).toBeNull();
    expect(screen.queryByRole("button", { name: /Seleccionar/ })).toBeNull();
  });

  it("disables play when the ACTIVE tab's list is empty", () => {
    renderLiked({ likedSongs: [], likedAlbums: [album] });
    // Canciones (activa) vacía → deshabilitado aunque sí haya álbumes
    expect(screen.getByTestId("hero-play")).toBeDisabled();
    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.getByTestId("hero-play")).toBeEnabled();
    fireEvent.click(screen.getByText("Canciones"));
    expect(screen.getByTestId("hero-play")).toBeDisabled();
  });

  // ── Selección múltiple (solo pestaña Canciones) ────────────────

  it("shows the selection actions only in the Canciones tab", () => {
    renderLiked({ likedSongs: [song("1")] });
    expect(screen.getByRole("button", { name: "Seleccionar" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.queryByRole("button", { name: /Seleccionar/ })).toBeNull();
  });

  it("hides the heart and the options menu while in select mode", () => {
    renderLiked({ likedSongs: [song("1")], liked: new Set(["1"]) });
    expect(screen.getByTitle("Quitar de Me gusta")).toBeInTheDocument();
    expect(screen.getByTitle("Más opciones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    expect(screen.queryByTitle("Quitar de Me gusta")).toBeNull();
    expect(screen.queryByTitle("Más opciones")).toBeNull();
  });

  it("removes the selected songs from Me gusta (unlike, sin confirmar)", () => {
    const toggleLike = vi.fn();
    renderLiked({ likedSongs: [song("1"), song("2")], toggleLike });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Liked Song 1"));
    expect(screen.getByRole("button", { name: "Eliminar (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar (1)" }));
    expect(toggleLike).toHaveBeenCalledWith("1");
    expect(toggleLike).toHaveBeenCalledTimes(1);
    // La selección queda limpia tras eliminar
    expect(screen.queryByRole("button", { name: /Eliminar \(1\)/ })).toBeNull();
  });

  it("moves the selected songs to a playlist", async () => {
    const refreshPlaylists = vi.fn();
    renderLiked({
      likedSongs: [song("1"), song("2")],
      playlists: [{ id: 7, name: "Favoritas" }],
      refreshPlaylists,
    });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Liked Song 1"));
    fireEvent.click(screen.getByRole("button", { name: "Mover (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /Favoritas/ }));
    await waitFor(() =>
      expect(api.addToPlaylist).toHaveBeenCalledWith(
        7,
        [expect.objectContaining({ videoId: "1" })],
        expect.any(Function),
      ),
    );
    expect(refreshPlaylists).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Mover \(1\)/ })).toBeNull();
  });

  it("clears the selection when switching tabs", () => {
    renderLiked({ likedSongs: [song("1")] });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Liked Song 1"));
    expect(screen.getByRole("button", { name: "Eliminar (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByText("Canciones"));
    expect(screen.queryByRole("button", { name: /Eliminar \(1\)/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Seleccionar" })).toBeInTheDocument();
  });

  // ── Contraste: superficies con el acento de fondo (regresión portada blanca)
  it("el botón primario usa --neon-fg, nunca texto blanco fijo", () => {
    renderLiked({ likedSongs: [song("1")], accentColor: "#ffffff" });
    const play = screen.getByTestId("hero-play");
    expect(play.style.background).toBe("rgb(255, 255, 255)");
    expect(play.style.color).toContain("var(--neon-fg)");
  });

  it("la pestaña activa (fondo acento) usa --neon-fg, nunca negro fijo", () => {
    renderLiked();
    const activeTab = screen.getAllByRole("tab")[0];
    expect(activeTab.getAttribute("aria-selected")).toBe("true");
    expect(activeTab.style.color).toContain("var(--neon-fg)");
  });
});
