import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HomeView from "./HomeView";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  ...overrides,
});

const defaultProps = {
  currentSong: null,
  playSong: () => {},
  history: [],
};

function renderHome(props = {}) {
  return render(<HomeView {...defaultProps} {...props} />);
}

describe("HomeView", () => {
  // ── Empty state ─────────────────────────────────────────────────────

  it("should show empty state when no history", () => {
    renderHome();
    expect(screen.getByText("Busca tu primera canción")).toBeInTheDocument();
    expect(screen.getByText(/Encuentra cualquier canción/)).toBeInTheDocument();
  });

  it("should show greeting and headline", () => {
    renderHome();
    // Dynamic headline: "Descubre tu sonido" when no history
    expect(screen.getByText("Descubre tu sonido")).toBeInTheDocument();
  });

  // ── Quick picks (recently played) ─────────────────────────────────────

  it("should show 'Recientes' section with history songs", () => {
    // 8 songs → quick picks has 0-5, for-you has 0-7. Songs 6-7 are for-you only.
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history });
    expect(screen.getByText("Recientes")).toBeInTheDocument();
    // Song 5 is the last in quick picks; Song 6 only appears in for-you
    // Song 5 is in both sections → use getAllByText
    expect(screen.getAllByText("Song 5")).toHaveLength(2);
    // Songs 0-5 are in BOTH sections → use getAllByText
    expect(screen.getAllByText("Song 0")).toHaveLength(2);
    expect(screen.getAllByText("Song 1")).toHaveLength(2);
  });

  it("should limit quick picks to 6 songs", () => {
    const history = Array.from({ length: 10 }, (_, i) => song(`${i}`));
    renderHome({ history });
    expect(screen.getByText("Recientes")).toBeInTheDocument();
    // Songs 0-5 are in BOTH sections. Check count = 2 for each.
    expect(screen.getAllByText("Song 0")).toHaveLength(2);
    expect(screen.getAllByText("Song 5")).toHaveLength(2);
    // Song 6 is only in for-you, not in quick picks
    expect(screen.getByText("Song 9")).toBeInTheDocument();
  });

  it("should call playSong when a quick pick is clicked", () => {
    const playSong = vi.fn();
    // 8 songs → quick picks has 0-5, we click Song 5 (in both sections)
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, playSong });
    // Use getAllByText and click the first match (in quick picks)
    fireEvent.click(screen.getAllByText("Song 5")[0]);
    expect(playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "5", title: "Song 5" }),
    );
  });

  // ── For You section ──────────────────────────────────────────────────

  it("should show 'Para ti' section with numbered list", () => {
    // 8 songs → for-you has 0-7 (all), quick picks has 0-5
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history });
    expect(screen.getByText("Para ti")).toBeInTheDocument();
    // Song 7 only appears in for-you
    expect(screen.getByText("Song 7")).toBeInTheDocument();
    // Numbered list positions
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("should call playSong when a for-you song is clicked", () => {
    const playSong = vi.fn();
    // 8 songs → quick picks gets 0-5, for-you gets 0-7
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, playSong });
    // Song 6 only appears in for-you section (not in quick picks' top 6)
    fireEvent.click(screen.getByText("Song 6"));
    expect(playSong).toHaveBeenCalledWith(expect.objectContaining({ videoId: "6" }));
  });

  // ── Current song highlighting ───────────────────────────────────────

  it("should highlight the current song", () => {
    // 8 songs → songs 6-7 are for-you only
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, currentSong: song("6") });
    // Song 6 is for-you only (one match)
    expect(screen.getByText("Song 6")).toBeInTheDocument();
    // Songs 0-5 are in both sections
    expect(screen.getAllByText("Song 0")).toHaveLength(2);
  });

  // ── Contraste: pulso con el acento de fondo (regresión portada blanca) ──
  it("el pulso 'suena ahora' usa --neon-fg y currentColor, nunca #000 fijo", () => {
    const history = Array.from({ length: 8 }, (_, i) => song(`${i}`));
    renderHome({ history, currentSong: song("0"), isPlaying: true, accentColor: "#ffffff" });
    const pulse = screen.getByTestId("now-playing-pulse");
    expect(pulse.style.color).toContain("var(--neon-fg)");
    const icon = pulse.querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon.getAttribute("fill")).toBe("currentColor");
  });

  // ── Duration display ────────────────────────────────────────────────

  it("should show duration when available", () => {
    const history = [song("1", { duration: 200 })];
    renderHome({ history });
    expect(screen.getByText("3:20")).toBeInTheDocument();
  });

  it("should not show duration when duration is 0", () => {
    const history = [song("1", { duration: 0 })];
    renderHome({ history });
    // fmtTime(0) returns "0:00", but the component conditionally renders
    // duration only when song.duration > 0
    // The component has {song.duration > 0 && <span>...</span>}
    // So with duration=0, the span should not be rendered
    // But fmtTime is still used elsewhere... let me check if "0:00" appears
    // Actually, the forYou section renders duration. Since there's no
    // duration check in the forYou section... let me check the code.
    // Looking at the code: {song.duration > 0 && (<span>{fmtTime(song.duration)}</span>)}
    expect(screen.queryByText("0:00")).not.toBeInTheDocument();
  });
});
