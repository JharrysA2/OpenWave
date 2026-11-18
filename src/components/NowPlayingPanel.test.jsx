import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NowPlayingPanel } from "./NowPlayingPanel";

const song = (id) => ({
  videoId: id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  thumbnail: `https://example.com/${id}.jpg`,
});

const baseProps = {
  song: song("a"),
  isPlaying: true,
  queue: [song("a"), song("b"), song("c")],
  queueIndex: 0,
  accentColor: "#a78bfa",
  onTogglePlay: vi.fn(),
  onPlaySong: vi.fn(),
  onClose: vi.fn(),
};

describe("NowPlayingPanel", () => {
  it("muestra la canción actual y las siguientes de la cola", () => {
    render(<NowPlayingPanel {...baseProps} />);
    expect(screen.getAllByText("Song a").length).toBeGreaterThan(0);
    expect(screen.getByText("Song b")).toBeInTheDocument();
    expect(screen.getByText("Song c")).toBeInTheDocument();
  });

  it("reproduce una canción de la cola con su índice real", () => {
    render(<NowPlayingPanel {...baseProps} />);
    fireEvent.click(screen.getByText("Song c"));
    expect(baseProps.onPlaySong).toHaveBeenCalledWith(song("c"), 2, false, baseProps.queue);
  });

  it("permite pausar y cerrar el panel", () => {
    render(<NowPlayingPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Pausar"));
    fireEvent.click(screen.getByLabelText("Ocultar ahora suena"));
    expect(baseProps.onTogglePlay).toHaveBeenCalled();
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("muestra un estado vacío sin canción", () => {
    render(<NowPlayingPanel {...baseProps} song={null} />);
    expect(screen.getByText(/Elige una canción/i)).toBeInTheDocument();
  });
});
