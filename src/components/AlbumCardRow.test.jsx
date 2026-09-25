import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("./MusicCover", () => ({
  MusicCover: () => <div data-testid="mock-music-cover" />,
}));

import AlbumCardRow from "./AlbumCardRow";

const album = {
  title: "Álbum de prueba",
  artist: "Artista",
  thumbnail: "a.jpg",
  thumbnails: [{ url: "a.jpg", width: 200 }],
};

describe("AlbumCardRow — rendimiento", () => {
  it("la tarjeta no lleva backdrop-filter de pie (regresión por fila)", () => {
    const { container } = render(<AlbumCardRow album={album} onClick={() => {}} />);
    const card = container.firstChild;
    expect(card).toBeTruthy();
    expect(card.style.backdropFilter ?? "").toBe("");
  });

  it("el botón ⋮ no aplica backdrop-filter", () => {
    const onOptions = vi.fn();
    render(<AlbumCardRow album={album} onClick={() => {}} onOptions={onOptions} />);
    const btn = screen.getByTitle("Más opciones");
    expect(btn.style.backdropFilter ?? "").toBe("");
    fireEvent.click(btn);
    expect(onOptions).toHaveBeenCalledWith(album);
  });
});
