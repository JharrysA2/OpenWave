import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

vi.mock("../utils/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("./MusicCover", () => ({
  MusicCover: () => <div data-testid="mock-music-cover" />,
}));

import { MainRouter } from "./MainRouter";
import { api } from "../utils/api";

// Props mínimas: los detalles (álbum/artista/canciones del artista) solo
// usan este subconjunto, así el test no depende del resto del árbol.
const baseProps = {
  showSettingsPanel: false,
  neonColor: "#a78bfa",
  downloads: [],
  liked: new Set(),
  history: [],
  playlists: [],
  downloadedIds: new Set(),
  historyItems: [],
  results: [],
  searchArtists: [],
  searchAlbums: [],
  videoResults: [],
  likedSongs: [],
  likedAlbums: [],
  followedArtists: [],
  tab: "home",
  currentSong: null,
  isPlaying: false,
  playSong: vi.fn(),
  toggleLike: vi.fn(),
  openOptions: vi.fn(),
  toast: vi.fn(),
  goToArtist: vi.fn(),
  goToAlbum: vi.fn(),
  goToArtistSongs: vi.fn(),
  closeArtistSongs: vi.fn(),
  goBackFromDetail: vi.fn(),
  fetchAlbumTracks: vi.fn(),
};

// Regresión del botón «Ver todas las canciones»: al apilar la pantalla
// dedicada, artistBrowseId SIGUE activo (la página del artista queda
// debajo como «atrás»). Si la rama del artista se evalúa antes que
// artistSongs, MainRouter devuelve ArtistView y el botón no hace nada.
describe("MainRouter — pantalla «Todas las canciones»", () => {
  beforeAll(async () => {
    // Precarga de los módulos lazy: en frío, la transformación puede tardar
    // más que el timeout por defecto de waitFor y el Suspense nunca resuelve.
    await import("./ArtistSongsView");
    await import("./ArtistView");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ songs: [], name: "" });
  });

  it("muestra ArtistSongsView aunque la página del artista siga debajo", async () => {
    render(
      <MainRouter
        {...baseProps}
        artistBrowseId="art1"
        artistSongs={{ browseId: "art1", name: "Test Artist" }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Todas las canciones")).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith("/artist/art1/songs");
  });

  it("el botón Volver cierra solo esta pantalla (closeArtistSongs)", async () => {
    render(
      <MainRouter
        {...baseProps}
        artistBrowseId="art1"
        artistSongs={{ browseId: "art1", name: "Test Artist" }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Todas las canciones")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Volver al artista"));
    expect(baseProps.closeArtistSongs).toHaveBeenCalled();
  });

  it("sin artistSongs, la página del artista sigue mandando", async () => {
    api.get.mockImplementation((path) => {
      if (path.startsWith("/artist/related")) return Promise.resolve({ results: [] });
      if (path.endsWith("/albums")) return Promise.resolve({ albums: [], singles: [] });
      return Promise.resolve({
        browseId: "art1",
        name: "Test Artist",
        songs: [],
        albums: [],
      });
    });
    render(<MainRouter {...baseProps} artistBrowseId="art1" artistSongs={null} />);
    await waitFor(() => {
      expect(screen.getByText("Test Artist")).toBeInTheDocument();
    });
    expect(screen.queryByText("Todas las canciones")).not.toBeInTheDocument();
  });
});
