import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("./MusicCover", () => ({
  MusicCover: () => <div data-testid="mock-music-cover" />,
}));

import TrackList from "./TrackList";

const songs = [
  {
    videoId: "v1",
    title: "Canción Uno",
    artist: "Artista",
    thumbnail: "x.jpg",
    duration: 100,
  },
];

const defaultProps = {
  songs,
  currentSong: null,
  accentColor: "#ffffff",
  onPlay: () => {},
  openOptions: vi.fn(),
};

describe("TrackList — contraste sobre acento (regresión portada blanca)", () => {
  it("el check seleccionado usa currentColor sobre --neon-fg, nunca blanco fijo", () => {
    const { container } = render(
      <TrackList {...defaultProps} selectMode selected={new Set(["v1"])} toggleSelect={() => {}} />,
    );
    const check = container.querySelector('polyline[points="20 6 9 17 4 12"]');
    expect(check).toBeTruthy();
    expect(check.closest("svg").getAttribute("stroke")).toBe("currentColor");
    expect(check.closest("svg").parentElement.style.color).toBe("var(--neon-fg)");
  });

  it("sin selección no pinta el check", () => {
    const { container } = render(
      <TrackList {...defaultProps} selectMode selected={new Set()} toggleSelect={() => {}} />,
    );
    expect(container.querySelector('polyline[points="20 6 9 17 4 12"]')).toBeNull();
  });

  it("fuera del modo selección no pinta checkbox", () => {
    const { container } = render(<TrackList {...defaultProps} />);
    expect(container.querySelector('polyline[points="20 6 9 17 4 12"]')).toBeNull();
  });
});
