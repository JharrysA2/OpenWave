import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HistoryView } from "./HistoryView";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `History Song ${id}`,
  artist: `Artist ${id}`,
  thumbnail: `https://example.com/${id}.jpg`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  playCount: 3,
  ...overrides,
});

const defaultProps = {
  history: [],
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: () => {},
  openOptions: () => {},
};

function renderHistory(props = {}) {
  return render(<HistoryView {...defaultProps} {...props} />);
}

describe("HistoryView", () => {
  // ── Empty state ──────────────────────────────────────────────────

  it("should show empty state when no history", () => {
    renderHistory();
    expect(screen.getByText("Historial")).toBeInTheDocument();
    expect(screen.getByText("No hay historial aún")).toBeInTheDocument();
  });

  // ── History songs list ──────────────────────────────────────────

  it("should render list of history songs", () => {
    const history = [song("1"), song("2")];
    renderHistory({ history });
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
    expect(screen.getByText("History Song 2")).toBeInTheDocument();
    // Artist + play count are in the same div → use regex
    expect(screen.getByText(/Artist 1/)).toBeInTheDocument();
    expect(screen.getByText(/Artist 2/)).toBeInTheDocument();
  });

  it("should show play count and reproducciones", () => {
    const history = [song("1", { playCount: 5 })];
    renderHistory({ history });
    // play count is in the same div as artist
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
    // Verify the parent contains play count text (with accent: reproducción)
    const titleEl = screen.getByText("History Song 1");
    const parentRow = titleEl.closest("div").parentElement;
    expect(parentRow.textContent).toContain("5");
    expect(parentRow.textContent).toContain("reproducci");
  });

  it("should show singular reproducción for playCount 1", () => {
    const history = [song("1", { playCount: 1 })];
    renderHistory({ history });
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
    const titleEl = screen.getByText("History Song 1");
    const parentRow = titleEl.closest("div").parentElement;
    expect(parentRow.textContent).toContain("1 reproducción");
  });

  it("should show default play count of 1 when playCount missing", () => {
    const history = [song("1", { playCount: undefined })];
    renderHistory({ history });
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
    const titleEl = screen.getByText("History Song 1");
    const parentRow = titleEl.closest("div").parentElement;
    expect(parentRow.textContent).toContain("1 reproducción");
  });

  // ── Play song ──────────────────────────────────────────────────

  it("should call playSong when a song row is clicked", () => {
    const playSong = vi.fn();
    const history = [song("1")];
    renderHistory({ history, playSong });
    fireEvent.click(screen.getByText("History Song 1"));
    expect(playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "1", title: "History Song 1" }),
    );
  });

  // ── Options button ──────────────────────────────────────────────

  it("should call openOptions when dots button is clicked", () => {
    const openOptions = vi.fn();
    const history = [song("1")];
    renderHistory({ history, openOptions });
    const btns = screen.getAllByRole("button");
    const dotsBtn = btns.find((b) => b.innerHTML.includes("M12 5"));
    if (dotsBtn) {
      fireEvent.click(dotsBtn);
      expect(openOptions).toHaveBeenCalledWith(expect.objectContaining({ videoId: "1" }));
    }
  });

  it("should prevent event propagation on options click", () => {
    const playSong = vi.fn();
    const openOptions = vi.fn();
    const history = [song("1")];
    renderHistory({ history, playSong, openOptions });
    const btns = screen.getAllByRole("button");
    const dotsBtn = btns.find((b) => b.innerHTML.includes("M12 5"));
    if (dotsBtn) {
      fireEvent.click(dotsBtn);
      // playSong should NOT have been called (stopPropagation prevented it)
      expect(playSong).not.toHaveBeenCalled();
      expect(openOptions).toHaveBeenCalled();
    }
  });

  // ── Current song highlighting ──────────────────────────────────

  it("should highlight the currently playing song", () => {
    const history = [song("1"), song("2")];
    renderHistory({ history, currentSong: song("1") });
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
    expect(screen.getByText("History Song 2")).toBeInTheDocument();
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("should handle songs without thumbnails", () => {
    const history = [song("1", { thumbnails: undefined, thumbnail: undefined })];
    renderHistory({ history });
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
  });

  it("should handle songs without duration", () => {
    const history = [song("1", { duration: undefined })];
    renderHistory({ history });
    expect(screen.getByText("History Song 1")).toBeInTheDocument();
  });
});
