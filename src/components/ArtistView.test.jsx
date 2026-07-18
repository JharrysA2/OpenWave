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

import { ArtistView } from "./ArtistView";
import { api } from "../utils/api";

const artistData = {
  name: "Test Artist",
  thumbnail: "artist.jpg",
  songs: [
    { videoId: "s1", title: "Song 1", artist: "Test Artist", thumbnail: "a.jpg" },
    { videoId: "s2", title: "Song 2", artist: "Test Artist", thumbnail: "b.jpg" },
  ],
  albums: [{ browseId: "alb1", title: "Album 1", thumbnail: "alb.jpg" }],
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
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path.startsWith("/artist/related")) {
      return Promise.resolve({ results: [] });
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
});
