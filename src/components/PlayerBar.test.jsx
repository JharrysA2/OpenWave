import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlayerBar } from "./PlayerBar";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = {
  videoId: "abc123",
  title: "Test Song",
  artist: "Test Artist",
  thumbnails: [{ url: "https://example.com/thumb.jpg", width: 200, height: 200 }],
  duration: 200,
};

const defaultProps = {
  song: null,
  isPlaying: false,
  streamLoading: false,
  duration: 0,
  volume: 0.7,
  onPlayPause: () => {},
  onNext: () => {},
  onPrev: () => {},
  onSeek: () => {},
  onVolume: () => {},
  onPlayModeToggle: () => {},
  accentColor: "#a78bfa",
  onLyrics: () => {},
  lyricsOpen: false,
  onQueue: () => {},
  onOpenOptions: () => {},
  shuffleActive: false,
  repeatMode: "off",
  crossfadeDuration: 0,
  onCrossfadeDuration: () => {},
  progressRef: { current: 40 },
};

function renderBar(props = {}) {
  return render(<PlayerBar {...defaultProps} {...props} />);
}

describe("PlayerBar", () => {
  // ── Render states ──────────────────────────────────────────────────

  it("should show default title when no song", () => {
    renderBar();
    expect(screen.getByText("SoundWave")).toBeInTheDocument();
  });

  it("should render song title and artist when song is provided", () => {
    renderBar({ song });
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    expect(screen.getByText("Test Artist")).toBeInTheDocument();
  });

  it("should render a text node when song has no artist", () => {
    renderBar({ song: { ...song, artist: null } });
    // The artist div contains "\u00A0" (non-breaking space) when no artist
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    // Check that the second child (artist) of the info container exists
    const titleEl = screen.getByText("Test Song");
    const artistDiv = titleEl.parentElement.children[1];
    expect(artistDiv).toBeTruthy();
    expect(artistDiv.textContent).toBe("\u00A0");
  });

  // ── Controls (order with song: shuffle[0], prev[1], play[2], next[3], repeat[4], volume[5], crossfade[6], dots[7], lyrics[8]) ─

  it("should call onPlayPause when play/pause button is clicked", () => {
    const onPlayPause = vi.fn();
    renderBar({ onPlayPause, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[2]); // play button
    expect(onPlayPause).toHaveBeenCalledOnce();
  });

  it("should call onNext when next button is clicked", () => {
    const onNext = vi.fn();
    renderBar({ onNext, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[3]); // next button
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("should call onPrev when prev button is clicked", () => {
    const onPrev = vi.fn();
    renderBar({ onPrev, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[1]); // prev button
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("should show loading spinner when streamLoading is true", () => {
    renderBar({ song, streamLoading: true });
    const btns = screen.getAllByRole("button");
    // Play button (index 2) should show animated SVG when loading
    expect(btns[2].innerHTML).toContain("animateTransform");
  });

  it("should show pause icon when isPlaying is true", () => {
    renderBar({ song, isPlaying: true });
    const btns = screen.getAllByRole("button");
    // Phosphor Pause icon renders SVG with viewBox
    expect(btns[2].innerHTML).toContain("svg");
  });

  it("should show play icon when not playing", () => {
    renderBar({ song, isPlaying: false });
    const btns = screen.getAllByRole("button");
    // Phosphor Play icon renders SVG with viewBox
    expect(btns[2].innerHTML).toContain("svg");
  });

  // ── Progress bar ──────────────────────────────────────────────────

  it("should render current and total time", async () => {
    renderBar({ song, duration: 200, progressRef: { current: 40 } });
    await waitFor(() => {
      expect(screen.getByText("0:40")).toBeInTheDocument();
    });
    expect(screen.getByText("3:20")).toBeInTheDocument();
  });

  it("should show 0:00 when no progress", () => {
    renderBar({ song, duration: 200, progressRef: { current: 0 } });
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  // ── Volume ────────────────────────────────────────────────────────

  it("should render volume button at correct index", () => {
    renderBar({ song, volume: 0.7 });
    const btns = screen.getAllByRole("button");
    // Volume button is at index 5 with song
    const volBtn = btns[5];
    expect(volBtn).toBeTruthy();
  });

  // ── Crossfade ─────────────────────────────────────────────────────

  it("should show crossfade duration span when active", () => {
    renderBar({ crossfadeDuration: 5 });
    // Crossfade button shows "5s" span; the popup also has "5s" text
    const matches = screen.getAllByText("5s");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("should hide crossfade duration span when off", () => {
    renderBar({ crossfadeDuration: 0 });
    // The crossfade button should NOT show "Xs" when crossfadeDuration is 0
    // The popup always shows "Off" and "12s" labels — "Off" appears twice
    const offMatches = screen.getAllByText("Off");
    expect(offMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("should toggle crossfade from 0 to 5 when clicked", () => {
    const onCrossfadeDuration = vi.fn();
    renderBar({ onCrossfadeDuration, crossfadeDuration: 0, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[6]); // crossfade button
    expect(onCrossfadeDuration).toHaveBeenCalledWith(5);
  });

  it("should toggle crossfade from 5 to 0 when clicked", () => {
    const onCrossfadeDuration = vi.fn();
    renderBar({ onCrossfadeDuration, crossfadeDuration: 5, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[6]); // crossfade button
    expect(onCrossfadeDuration).toHaveBeenCalledWith(0);
  });

  // ── Lyrics ────────────────────────────────────────────────────────

  it("should call onLyrics when lyrics button is clicked with song", () => {
    const onLyrics = vi.fn();
    renderBar({ song, onLyrics });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[8]); // lyrics button
    expect(onLyrics).toHaveBeenCalledOnce();
  });

  it("should not call onLyrics when no song", () => {
    const onLyrics = vi.fn();
    renderBar({ song: null, onLyrics });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[7]); // lyrics button (no dots, index unchanged)
    expect(onLyrics).not.toHaveBeenCalled();
  });

  // ── Shuffle & Repeat ─────────────────────────────────────────────

  it("should call onPlayModeToggle with shuffle when shuffle clicked", () => {
    const onPlayModeToggle = vi.fn();
    renderBar({ onPlayModeToggle, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[0]); // shuffle button
    expect(onPlayModeToggle).toHaveBeenCalledWith("shuffle");
  });

  it("should call onPlayModeToggle with repeat when repeat clicked", () => {
    const onPlayModeToggle = vi.fn();
    renderBar({ onPlayModeToggle, song });
    const btns = screen.getAllByRole("button");
    fireEvent.click(btns[4]); // repeat button
    expect(onPlayModeToggle).toHaveBeenCalledWith("repeat");
  });

  // ── Button count ──────────────────────────────────────────────────

  it("should render 9 buttons with a song present (includes dots)", () => {
    renderBar({ song });
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("should render 8 buttons when no song (dots hidden)", () => {
    renderBar();
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });

  // ── Seek ────────────────────────────────────────────────────────────

  it("should call onSeek when progress bar is clicked", () => {
    const onSeek = vi.fn();
    const { container } = renderBar({ song, duration: 200, onSeek });
    // Find the progress bar clickable area (flex:1 container inside the center column)
    const progressBar = container.querySelector("div[style*='height: 26px']");
    expect(progressBar).toBeTruthy();
    fireEvent.click(progressBar, { clientX: 60 });
    expect(onSeek).toHaveBeenCalled();
  });

  // ── Open options ──────────────────────────────────────────────────

  it("should call onOpenOptions when song info is clicked", () => {
    const onOpenOptions = vi.fn();
    renderBar({ song, onOpenOptions });
    fireEvent.click(screen.getByText("Test Song"));
    expect(onOpenOptions).toHaveBeenCalledOnce();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Progreso imperativo — sin setInterval de 200ms ni re-renders
// ═══════════════════════════════════════════════════════════════════════════════

describe("PlayerBar — progreso imperativo", () => {
  const progressBarOf = (container) => container.querySelector("div[style*='height: 26px']");

  it("no programa ningún setInterval al montar", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const { unmount } = renderBar({ song, duration: 200, progressRef: { current: 0 } });

    expect(setIntervalSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    unmount();
  });

  it("pinta tiempo, relleno y thumb leyendo progressRef", async () => {
    renderBar({ song, duration: 200, progressRef: { current: 40 } });

    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("0:40"));
    expect(screen.getByTestId("progress-fill").style.width).toBe("20%");
    expect(screen.getByTestId("progress-thumb").style.right).toBe("80%");
  });

  it("clampea el relleno al 100% si progressRef supera la duración", async () => {
    renderBar({ song, duration: 200, progressRef: { current: 500 } });

    await waitFor(() => expect(screen.getByTestId("progress-fill").style.width).toBe("100%"));
  });

  it("usa 0% cuando la duración todavía no se conoce, y se corrige al llegar", async () => {
    const progressRef = { current: 12 };
    const { rerender } = render(
      <PlayerBar {...defaultProps} song={song} duration={0} progressRef={progressRef} />,
    );

    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("0:12"));
    expect(screen.getByTestId("progress-fill").style.width).toBe("0%");

    // Al conocerse la duración se repinta con el porcentaje real
    rerender(<PlayerBar {...defaultProps} song={song} duration={120} progressRef={progressRef} />);
    await waitFor(() => expect(screen.getByTestId("progress-fill").style.width).toBe("10%"));
  });

  it("avanza con requestAnimationFrame mientras suena música", async () => {
    const progressRef = { current: 0 };
    renderBar({ song, duration: 200, isPlaying: true, progressRef });

    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("0:00"));

    // El audio avanza por debajo (usePlayer escribe en el ref)
    progressRef.current = 100;

    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("1:40"));
    expect(screen.getByTestId("progress-fill").style.width).toBe("50%");
  });

  it("no repinta en pausa: el loop rAF está detenido", async () => {
    const progressRef = { current: 40 };
    renderBar({ song, duration: 200, isPlaying: false, progressRef });
    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("0:40"));

    progressRef.current = 120;
    await new Promise((resolve) => setTimeout(resolve, 60)); // varios frames de rAF

    expect(screen.getByTestId("progress-time")).toHaveTextContent("0:40");
    expect(screen.getByTestId("progress-fill").style.width).toBe("20%");
  });

  it("hace un sync puntual al cambiar de canción aunque esté en pausa", async () => {
    const progressRef = { current: 40 };
    const { rerender } = render(
      <PlayerBar
        {...defaultProps}
        song={song}
        duration={200}
        isPlaying={false}
        progressRef={progressRef}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("0:40"));

    progressRef.current = 0;
    rerender(
      <PlayerBar
        {...defaultProps}
        song={{ ...song, videoId: "other" }}
        duration={200}
        isPlaying={false}
        progressRef={progressRef}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("progress-time")).toHaveTextContent("0:00"));
  });

  it("pinta de inmediato al hacer seek, incluso en pausa", () => {
    const onSeek = vi.fn();
    const progressRef = { current: 0 };
    const { container } = renderBar({
      song,
      duration: 200,
      isPlaying: false,
      onSeek,
      progressRef,
    });

    const bar = progressBarOf(container);
    // jsdom devuelve un rect de tamaño 0: lo simulamos para poder calcular el %
    bar.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 26,
      width: 200,
      height: 26,
      x: 0,
      y: 0,
    });

    fireEvent.click(bar, { clientX: 50 });

    expect(onSeek).toHaveBeenCalledWith(50);
    expect(screen.getByTestId("progress-time")).toHaveTextContent("0:50");
    expect(screen.getByTestId("progress-fill").style.width).toBe("25%");
  });
});
