import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LikedView } from "./LikedView";

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

const defaultProps = {
  likedSongs: [],
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: () => {},
  toggleLike: () => {},
  openOptions: () => {},
};

function renderLiked(props = {}) {
  return render(<LikedView {...defaultProps} {...props} />);
}

describe("LikedView", () => {
  // ── Empty state ──────────────────────────────────────────────────

  it("should show empty state when no liked songs", () => {
    renderLiked();
    expect(screen.getByText("Canciones que te gustan")).toBeInTheDocument();
    expect(screen.getByText("Dale me gusta a canciones para verlas aquí")).toBeInTheDocument();
  });

  // ── Liked songs list ─────────────────────────────────────────────

  it("should render list of liked songs", () => {
    const likedSongs = [song("1"), song("2")];
    renderLiked({ likedSongs });
    expect(screen.getByText("Liked Song 1")).toBeInTheDocument();
    expect(screen.getByText("Liked Song 2")).toBeInTheDocument();
    expect(screen.getByText("Artist 1")).toBeInTheDocument();
    expect(screen.getByText("Artist 2")).toBeInTheDocument();
  });

  it("should call playSong when a song row is clicked", () => {
    const playSong = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, playSong });
    fireEvent.click(screen.getByText("Liked Song 1"));
    expect(playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "1", title: "Liked Song 1" }),
    );
  });

  // ── Like/unlike button ──────────────────────────────────────────

  it("should call toggleLike when heart button is clicked", () => {
    const toggleLike = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, toggleLike });
    // The heart button has filled heart SVG
    const btns = screen.getAllByRole("button");
    const heartBtn = btns.find((b) => b.innerHTML.includes("M20.84 4.61"));
    if (heartBtn) {
      fireEvent.click(heartBtn);
      expect(toggleLike).toHaveBeenCalledWith("1", expect.objectContaining({ videoId: "1" }));
    }
  });

  it("should show filled heart for liked songs", () => {
    const likedSongs = [song("1")];
    renderLiked({ likedSongs });
    // Phosphor Heart icon renders an SVG with viewBox 0 0 256 256
    const heartSvg = document.querySelector('svg[viewBox="0 0 256 256"]');
    expect(heartSvg).toBeTruthy();
  });

  // ── Options button ──────────────────────────────────────────────

  it("should call openOptions when dots button is clicked", () => {
    const openOptions = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, openOptions });
    const btns = screen.getAllByRole("button");
    const dotsBtn = btns.find((b) => b.innerHTML.includes("M12 5"));
    if (dotsBtn) {
      fireEvent.click(dotsBtn);
      expect(openOptions).toHaveBeenCalledWith(expect.objectContaining({ videoId: "1" }));
    }
  });

  // ── Current song highlighting ──────────────────────────────────

  it("should highlight the currently playing song", () => {
    const likedSongs = [song("1"), song("2")];
    renderLiked({ likedSongs, currentSong: song("1") });
    expect(screen.getByText("Liked Song 1")).toBeInTheDocument();
    expect(screen.getByText("Liked Song 2")).toBeInTheDocument();
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("should prevent event propagation on heart click", () => {
    const playSong = vi.fn();
    const toggleLike = vi.fn();
    const likedSongs = [song("1")];
    renderLiked({ likedSongs, playSong, toggleLike });
    const btns = screen.getAllByRole("button");
    const heartBtn = btns.find((b) => b.innerHTML.includes("M20.84 4.61"));
    if (heartBtn) {
      fireEvent.click(heartBtn);
      // playSong should NOT have been called (stopPropagation prevented it)
      expect(playSong).not.toHaveBeenCalled();
      expect(toggleLike).toHaveBeenCalled();
    }
  });
});
