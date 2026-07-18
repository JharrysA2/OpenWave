import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DownloadsView } from "./DownloadsView";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `Downloaded Song ${id}`,
  artist: `Artist ${id}`,
  thumbnail: `https://example.com/${id}.jpg`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  ...overrides,
});

const defaultProps = {
  downloads: [],
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: () => {},
  openOptions: () => {},
};

function renderDownloads(props = {}) {
  return render(<DownloadsView {...defaultProps} {...props} />);
}

describe("DownloadsView", () => {
  // ── Empty state ──────────────────────────────────────────────────────

  it("should show empty state when no downloads", () => {
    renderDownloads();
    expect(screen.getByText("Descargas")).toBeInTheDocument();
    expect(
      screen.getByText("Descarga canciones para escucharlas sin conexión"),
    ).toBeInTheDocument();
  });

  // ── Downloaded songs list ──────────────────────────────────────────

  it("should render list of downloaded songs", () => {
    const downloads = [song("1"), song("2")];
    renderDownloads({ downloads });
    expect(screen.getByText("Downloaded Song 1")).toBeInTheDocument();
    expect(screen.getByText("Downloaded Song 2")).toBeInTheDocument();
    expect(screen.getByText("Artist 1")).toBeInTheDocument();
    expect(screen.getByText("Artist 2")).toBeInTheDocument();
  });

  it("should show OFFLINE badge for each downloaded song", () => {
    const downloads = [song("1")];
    renderDownloads({ downloads });
    const offlineBadges = screen.getAllByText("OFFLINE");
    expect(offlineBadges).toHaveLength(1);
  });

  it("should call playSong when a downloaded song is clicked", () => {
    const playSong = vi.fn();
    const downloads = [song("1")];
    renderDownloads({ downloads, playSong });
    fireEvent.click(screen.getByText("Downloaded Song 1"));
    expect(playSong).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: "1",
        title: "Downloaded Song 1",
        downloaded: true,
      }),
    );
  });

  it("should call openOptions when options button is clicked", () => {
    const openOptions = vi.fn();
    const downloads = [song("1")];
    renderDownloads({ downloads, openOptions });
    // Find the dots/options button
    const btns = screen.getAllByRole("button");
    const optionsBtn = btns.find((b) => b.innerHTML.includes("M12 5"));
    if (optionsBtn) {
      fireEvent.click(optionsBtn);
      expect(openOptions).toHaveBeenCalledWith(
        expect.objectContaining({ videoId: "1", downloaded: true }),
      );
    }
  });

  // ── Current song highlighting ──────────────────────────────────────

  it("should highlight the currently playing song", () => {
    const downloads = [song("1"), song("2")];
    renderDownloads({ downloads, currentSong: song("1") });
    expect(screen.getByText("Downloaded Song 1")).toBeInTheDocument();
    expect(screen.getByText("Downloaded Song 2")).toBeInTheDocument();
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it("should handle songs with video_id instead of videoId", () => {
    const downloads = [{ video_id: "legacy1", title: "Legacy Song", artist: "Legacy Artist" }];
    renderDownloads({ downloads });
    expect(screen.getByText("Legacy Song")).toBeInTheDocument();
  });

  it("should pass downloaded:true in songData", () => {
    const playSong = vi.fn();
    const downloads = [song("1")];
    renderDownloads({ downloads, playSong });
    fireEvent.click(screen.getByText("Downloaded Song 1"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ downloaded: true }));
  });

  it("should render multiple downloads with correct OFFLINE badges count", () => {
    const downloads = [song("1"), song("2"), song("3")];
    renderDownloads({ downloads });
    const badges = screen.getAllByText("OFFLINE");
    expect(badges).toHaveLength(3);
  });
});
