import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

// TrackList es pesado (dnd, hover, iconos): aquí solo nos interesa que la
// vista pinta TODAS las canciones recibidas y delega la reproducción.
vi.mock("./TrackList", () => ({
  __esModule: true,
  default: ({ songs, onPlay }) => (
    <div data-testid="track-list">
      {songs.map((s) => (
        <button key={s.videoId} onClick={() => onPlay(s)}>
          {s.title}
        </button>
      ))}
    </div>
  ),
}));

import ArtistSongsView from "./ArtistSongsView";
import { api } from "../utils/api";

const fullSongs = Array.from({ length: 12 }, (_, i) => ({
  videoId: `v${i}`,
  title: `Song ${i}`,
  artist: "Full Artist",
  duration: 100 + i,
}));

const defaultProps = {
  browseId: "art9",
  name: "Full Artist",
  accentColor: "#a78bfa",
  currentSong: null,
  playSong: vi.fn(),
  toggleLike: vi.fn(),
  liked: new Set(),
  openOptions: vi.fn(),
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArtistSongsView — todas las canciones del artista", () => {
  it("fetches the full catalog and renders every song", async () => {
    api.get.mockResolvedValue({ name: "Full Artist", songs: fullSongs });
    render(<ArtistSongsView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Song 11")).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith("/artist/art9/songs");
    expect(screen.getByText("12 canciones · Full Artist")).toBeInTheDocument();
    expect(screen.getByTestId("track-list")).toBeInTheDocument();
  });

  it("plays a song on click (delegando en playSong)", async () => {
    api.get.mockResolvedValue({ name: "Full Artist", songs: fullSongs });
    const playSong = vi.fn();
    render(<ArtistSongsView {...defaultProps} playSong={playSong} />);

    await waitFor(() => {
      expect(screen.getByText("Song 5")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Song 5"));
    expect(playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "v5", title: "Song 5" }),
    );
  });

  it("shows an error state with back action when the fetch fails", async () => {
    api.get.mockRejectedValue(new Error("network"));
    const onBack = vi.fn();
    render(<ArtistSongsView {...defaultProps} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("No se pudieron cargar las canciones")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Volver"));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows an empty state when the artist has no songs", async () => {
    api.get.mockResolvedValue({ name: "X", songs: [] });
    render(<ArtistSongsView {...defaultProps} name="X" />);

    await waitFor(() => {
      expect(
        screen.getByText("No hay canciones disponibles para este artista"),
      ).toBeInTheDocument();
    });
  });

  it("shows a loading state while fetching", () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    render(<ArtistSongsView {...defaultProps} />);
    expect(screen.getByText("Cargando canciones del artista...")).toBeInTheDocument();
  });

  it("refetches when browseId changes", async () => {
    api.get.mockResolvedValue({ name: "A", songs: fullSongs });
    const { rerender } = render(<ArtistSongsView {...defaultProps} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    rerender(<ArtistSongsView {...defaultProps} browseId="art10" name="B" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenLastCalledWith("/artist/art10/songs");
  });
});
