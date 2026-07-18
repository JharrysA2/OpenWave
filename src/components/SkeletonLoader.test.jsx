import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  SkeletonSongRow,
  SkeletonCard,
  SkeletonGrid,
  SkeletonHorizontalRow,
  SkeletonSection,
  SkeletonPage,
  SkeletonAlbumView,
  SkeletonArtistView,
  SkeletonLyrics,
} from "./SkeletonLoader";

describe("SkeletonLoader", () => {
  it("SkeletonSongRow renders", () => {
    const { container } = render(<SkeletonSongRow />);
    expect(container.firstChild).toBeTruthy();
  });

  it("SkeletonCard renders", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toBeTruthy();
  });

  it("SkeletonGrid renders the default number of cards", () => {
    const { container } = render(<SkeletonGrid />);
    expect(container.firstChild.childNodes.length).toBe(6);
  });

  it("SkeletonGrid respects custom count", () => {
    const { container } = render(<SkeletonGrid count={3} />);
    expect(container.firstChild.childNodes.length).toBe(3);
  });

  it("SkeletonHorizontalRow renders the default number of items", () => {
    const { container } = render(<SkeletonHorizontalRow />);
    expect(container.firstChild.childNodes.length).toBe(5);
  });

  it("SkeletonSection renders a grid + header", () => {
    const { container } = render(<SkeletonSection />);
    expect(container.firstChild).toBeTruthy();
    expect(container.firstChild.childNodes.length).toBeGreaterThanOrEqual(2);
  });

  it("SkeletonPage renders full page", () => {
    const { container } = render(<SkeletonPage />);
    expect(container.firstChild).toBeTruthy();
  });

  it("SkeletonAlbumView renders", () => {
    const { container } = render(<SkeletonAlbumView />);
    expect(container.firstChild).toBeTruthy();
  });

  it("SkeletonArtistView renders", () => {
    const { container } = render(<SkeletonArtistView />);
    expect(container.firstChild).toBeTruthy();
  });

  it("SkeletonLyrics renders its 15 simulated lyric lines", () => {
    const { container } = render(<SkeletonLyrics fontSize="20px" />);
    const lines = container.querySelectorAll(".skeleton");
    expect(lines.length).toBe(15);
    // La altura deriva del fontSize (px calculado en JS, sin calc() CSS)
    expect(parseFloat(lines[0].style.height)).toBeCloseTo(8);
  });

  it("SkeletonLyrics accepts (and ignores) a deprecated accent color", () => {
    const { container } = render(<SkeletonLyrics accentColor="#ff0000" />);
    expect(container.firstChild).toBeTruthy();
  });
});
