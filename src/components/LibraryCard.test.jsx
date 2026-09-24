import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AlbumGridCard, ArtistGridCard } from "./LibraryCard";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const ACCENT = "rgb(167, 139, 250)";

const album = {
  browseId: "MPREb_hover1",
  title: "Álbum Hover",
  artist: "Artista Hover",
  type: "Álbum",
  thumbnail: "https://example.com/a.jpg",
};

const artist = {
  browseId: "UC_hover1",
  name: "Artista Hover",
  thumbnail: "https://example.com/u.jpg",
};

function renderAlbum(props = {}) {
  return render(
    <AlbumGridCard
      album={album}
      accentColor={ACCENT}
      subtitle="Álbum"
      onClick={() => {}}
      onPlay={() => {}}
      onOptions={() => {}}
      {...props}
    />,
  );
}

describe("LibraryCard — hover declarativo (regresión del botón 'pegado')", () => {
  it("el ▶ conserva su acento tras pasar y retirar el cursor", () => {
    renderAlbum();
    const play = screen.getByTitle("Reproducir");

    // Base: color de acento del caller
    expect(play.style.background).toContain("167");

    fireEvent.mouseEnter(play);
    // Nunca debe pasar a negro en hover (bug: rgba(0,0,0,.75) hardcodeado)
    expect(play.style.background).toContain("167");
    expect(play.style.transform).toBe("scale(1.08)");

    fireEvent.mouseLeave(play);
    // Regresión clave: antes el mouseleave escribía rgba(0,0,0,.55) y el
    // acento se perdía hasta el siguiente re-render.
    expect(play.style.background).toContain("167");
    expect(play.style.transform).not.toBe("scale(1.08)");
    expect(play.style.filter).toBe("");
  });

  it("el ▶ no aplica backdrop-filter anidado (la tarjeta ya difumina)", () => {
    renderAlbum();
    const play = screen.getByTitle("Reproducir");
    expect(play.style.backdropFilter ?? "").toBe("");
    expect(play.style.webkitBackdropFilter ?? play.style.WebkitBackdropFilter ?? "").toBe("");
  });

  it("el ⋮ responde al hover y restaura su superficie al salir", () => {
    renderAlbum();
    const dots = screen.getByTitle("Más opciones");
    const baseBg = dots.style.background;
    fireEvent.mouseEnter(dots);
    expect(dots.style.background).not.toBe(baseBg);
    fireEvent.mouseLeave(dots);
    expect(dots.style.background).toBe(baseBg);
  });

  it("la tarjeta levanta y baja con el hover sin estilos residuales", () => {
    renderAlbum();
    const card = screen.getByText("Álbum Hover").parentElement.parentElement;
    fireEvent.mouseEnter(card);
    expect(card.style.transform).toBe("translateY(-2px)");
    fireEvent.mouseLeave(card);
    expect(card.style.transform).toBe("translateY(0)");
  });

  it("ArtistGridCard también restaura su hover", () => {
    render(
      <ArtistGridCard
        artist={artist}
        subtitle="Artista"
        onClick={() => {}}
        onOptions={() => {}}
      />,
    );
    const card = screen.getByText("Artista Hover").parentElement.parentElement;
    fireEvent.mouseEnter(card);
    expect(card.style.transform).toBe("translateY(-2px)");
    fireEvent.mouseLeave(card);
    expect(card.style.transform).toBe("translateY(0)");
  });
});
