import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Mock MusicCover ────────────────────────────────────────────────────────────

vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => (
    <div data-testid="mock-music-cover" aria-label={alt} style={style} />
  ),
}));

import { SelectionModal } from "./SelectionModal";

const songs = [
  { videoId: "v1", title: "Canción 1", artist: "Artista 1", thumbnail: "t1.jpg" },
  { videoId: "v2", title: "Canción 2", artist: "Artista 2", thumbnail: "t2.jpg" },
  { videoId: "v3", title: "Canción 3", artist: "Artista 3", thumbnail: "t3.jpg" },
];

const defaultProps = {
  open: true,
  onClose: () => {},
  songs,
  currentSong: null,
  onDelete: () => {},
};

describe("SelectionModal", () => {
  it("should render nothing when closed", () => {
    const { container } = render(<SelectionModal {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render nothing when songs is undefined", () => {
    const { container } = render(<SelectionModal {...defaultProps} songs={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render all songs", () => {
    render(<SelectionModal {...defaultProps} />);
    expect(screen.getByText("Canción 1")).toBeInTheDocument();
    expect(screen.getByText("Canción 2")).toBeInTheDocument();
    expect(screen.getByText("Canción 3")).toBeInTheDocument();
  });

  it("should toggle selection when clicking a song", () => {
    render(<SelectionModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Canción 1"));
    expect(screen.getByText(/Eliminar 1 canción/)).toBeInTheDocument();
    // Deseleccionar
    fireEvent.click(screen.getByText("Canción 1"));
    expect(screen.getByText("Selecciona canciones")).toBeInTheDocument();
  });

  it("should use plural when multiple songs selected", () => {
    render(<SelectionModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Canción 1"));
    fireEvent.click(screen.getByText("Canción 2"));
    expect(screen.getByText(/Eliminar 2 canciones/)).toBeInTheDocument();
  });

  it("should select all with the Todas button", () => {
    render(<SelectionModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Todas"));
    expect(screen.getByText(/Eliminar 3 canciones/)).toBeInTheDocument();
    // El botón cambia a "Ninguna"
    expect(screen.getByText("Ninguna")).toBeInTheDocument();
  });

  it("should deselect all with the Ninguna button", () => {
    render(<SelectionModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Todas"));
    fireEvent.click(screen.getByText("Ninguna"));
    expect(screen.getByText("Selecciona canciones")).toBeInTheDocument();
    expect(screen.getByText("Todas")).toBeInTheDocument();
  });

  it("should call onDelete with selected ids", () => {
    const onDelete = vi.fn();
    render(<SelectionModal {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText("Canción 1"));
    fireEvent.click(screen.getByText("Canción 3"));
    fireEvent.click(screen.getByText(/Eliminar 2 canciones/));
    expect(onDelete).toHaveBeenCalledWith(["v1", "v3"]);
  });

  it("should not call onDelete when nothing is selected", () => {
    const onDelete = vi.fn();
    render(<SelectionModal {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText("Selecciona canciones"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("should highlight the current song with a play indicator", () => {
    render(<SelectionModal {...defaultProps} currentSong={{ videoId: "v2" }} />);
    expect(screen.getByText("▶")).toBeInTheDocument();
  });

  it("should close when clicking the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(<SelectionModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should reset selection when reopened", () => {
    const { rerender } = render(<SelectionModal {...defaultProps} open={false} />);
    rerender(<SelectionModal {...defaultProps} open />);
    fireEvent.click(screen.getByText("Canción 1"));
    expect(screen.getByText(/Eliminar 1 canción/)).toBeInTheDocument();

    rerender(<SelectionModal {...defaultProps} open={false} />);
    rerender(<SelectionModal {...defaultProps} open />);
    expect(screen.getByText("Selecciona canciones")).toBeInTheDocument();
  });
});
