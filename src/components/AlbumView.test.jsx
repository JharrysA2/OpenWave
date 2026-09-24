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

import AlbumView from "./AlbumView";
import { api } from "../utils/api";

const albumData = {
  title: "Test Album",
  artist: "Test Artist",
  artistBrowseId: "art1",
  year: "2024",
  thumbnail: "album.jpg",
  thumbnails: [{ url: "album.jpg", width: 200, height: 200 }],
  tracks: [
    { videoId: "t1", title: "Track 1", artist: "Test Artist", thumbnail: "a.jpg", duration: 180 },
    { videoId: "t2", title: "Track 2", artist: "Test Artist", thumbnail: "b.jpg", duration: 200 },
  ],
};

const defaultProps = {
  browseId: "alb1",
  accentColor: "#a78bfa",
  currentSong: null,
  playSong: vi.fn(),
  toggleLike: vi.fn(),
  liked: new Set(),
  openOptions: vi.fn(),
  onGoToArtist: vi.fn(),
  onBack: vi.fn(),
  toast: vi.fn(),
  playlists: [],
  refreshPlaylists: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AlbumView", () => {
  it("should fetch and render album info and tracks", async () => {
    api.get.mockResolvedValue(albumData);
    render(<AlbumView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Test Album")).toBeInTheDocument();
    });
    expect(screen.getByText("Track 1")).toBeInTheDocument();
    expect(screen.getByText("Track 2")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/album/alb1");
  });

  it("should show skeleton while loading", () => {
    api.get.mockReturnValue(new Promise(() => {})); // nunca resuelve
    const { container } = render(<AlbumView {...defaultProps} />);
    expect(container.querySelector(".skeleton")).toBeTruthy();
  });

  it("should stop loading (without crashing) when fetch fails", async () => {
    api.get.mockRejectedValue(new Error("network"));
    const { container } = render(<AlbumView {...defaultProps} />);

    await waitFor(() => {
      expect(container.querySelector(".skeleton")).toBeNull();
    });
    expect(screen.queryByText("Test Album")).toBeNull();
  });

  it("should call playSong when a track is clicked", async () => {
    api.get.mockResolvedValue(albumData);
    render(<AlbumView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Track 1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Track 1"));
    expect(defaultProps.playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "t1" }),
      0,
      false,
      albumData.tracks,
    );
  });

  it("should navigate to artist when artist name is clicked", async () => {
    api.get.mockResolvedValue(albumData);
    render(<AlbumView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getAllByText("Test Artist").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByText("Test Artist")[0]);
    expect(defaultProps.onGoToArtist).toHaveBeenCalledWith({ browseId: "art1" });
  });

  it("should call onBack when the back button is clicked", async () => {
    api.get.mockResolvedValue(albumData);
    const { container } = render(<AlbumView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Test Album")).toBeInTheDocument();
    });
    // El botón de volver es el primero del header
    const backBtn = container.querySelector("button");
    fireEvent.click(backBtn);
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it("should render nothing before having a browseId", () => {
    api.get.mockResolvedValue(albumData);
    const { container } = render(<AlbumView {...defaultProps} browseId={null} />);
    expect(container.querySelector(".skeleton") || container.firstChild).toBeTruthy();
  });

  // ── Contraste: superficies con el acento de fondo (regresión portada blanca)
  it("el botón Reproducir usa --neon-fg, nunca texto negro fijo", async () => {
    api.get.mockResolvedValue(albumData);
    const { container } = render(<AlbumView {...defaultProps} accentColor="#ffffff" />);
    await waitFor(() => {
      expect(screen.getByText("Test Album")).toBeInTheDocument();
    });
    const play = [...container.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Reproducir" && b.style.background === "rgb(255, 255, 255)",
    );
    expect(play).toBeTruthy();
    expect(play.style.color).toContain("var(--neon-fg)");
  });
});
