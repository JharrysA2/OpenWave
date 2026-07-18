import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Mock MusicCover ────────────────────────────────────────────────────────────

vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => (
    <div data-testid="mock-music-cover" aria-label={alt} style={style} />
  ),
}));

// ── Sample data ────────────────────────────────────────────────────────────────

import { TrackPickerModal } from "./TrackPickerModal";

const playlist = { id: "pl1", name: "Mi Playlist" };

const tracks = [
  { videoId: "v1", title: "Canción 1", artist: "Artista 1", thumbnail: "thumb1.jpg" },
  { videoId: "v2", title: "Canción 2", artist: "Artista 2", thumbnail: "thumb2.jpg" },
  { videoId: "v3", title: "Canción 3", artist: "Artista 3", thumbnail: "thumb3.jpg" },
];

const defaultProps = {
  open: true,
  playlist,
  tracks,
  loadingTracks: false,
  onClose: () => {},
  onConfirm: () => {},
};

function renderModal(props = {}) {
  return render(<TrackPickerModal {...defaultProps} {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TrackPickerModal", () => {
  // ── Render condicional ──────────────────────────────────────────────────────

  it("should return null when open is false", () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it("should render when open is true", () => {
    renderModal();
    expect(screen.getByText("Mi Playlist")).toBeInTheDocument();
  });

  // ── Encabezado ──────────────────────────────────────────────────────────────

  it("should display the playlist name", () => {
    renderModal();
    expect(screen.getByText("Mi Playlist")).toBeInTheDocument();
  });

  it("should display the subtitle text", () => {
    renderModal();
    expect(screen.getByText("Elige las canciones a agregar")).toBeInTheDocument();
  });

  it("should have a close button that calls onClose", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const closeBtn = screen.getByTitle("Cerrar");
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Canciones ───────────────────────────────────────────────────────────────

  it("should display all tracks from the tracks prop", () => {
    renderModal();
    expect(screen.getByText("Canción 1")).toBeInTheDocument();
    expect(screen.getByText("Canción 2")).toBeInTheDocument();
    expect(screen.getByText("Canción 3")).toBeInTheDocument();
  });

  it("should display artist names for each track", () => {
    renderModal();
    expect(screen.getByText("Artista 1")).toBeInTheDocument();
    expect(screen.getByText("Artista 2")).toBeInTheDocument();
    expect(screen.getByText("Artista 3")).toBeInTheDocument();
  });

  it("should render a MusicCover for each track", () => {
    renderModal();
    const covers = screen.getAllByTestId("mock-music-cover");
    expect(covers).toHaveLength(3);
  });

  it("should show track numbers", () => {
    renderModal();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  // ── Selección (usando findByText async para esperar al useEffect) ───────────

  it("should select all tracks by default when opened", async () => {
    renderModal();
    // useEffect se ejecuta después del render inicial, findByText espera
    const btn = await screen.findByText("Agregar 3 canciones");
    expect(btn).toBeInTheDocument();
  });

  it("should toggle track selection when clicking a track", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");

    // Deselect first track
    fireEvent.click(screen.getByText("Canción 1"));
    expect(await screen.findByText("Agregar 2 canciones")).toBeInTheDocument();

    // Re-select first track
    fireEvent.click(screen.getByText("Canción 1"));
    expect(await screen.findByText("Agregar 3 canciones")).toBeInTheDocument();
  });

  it("should show 'Selecciona canciones' when no tracks selected", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");

    // Deselect all tracks one by one
    fireEvent.click(screen.getByText("Canción 1"));
    fireEvent.click(screen.getByText("Canción 2"));
    fireEvent.click(screen.getByText("Canción 3"));
    expect(await screen.findByText("Selecciona canciones")).toBeInTheDocument();
  });

  // ── Botón Todas/Ninguna ─────────────────────────────────────────────────────

  it("should show 'Ninguna' button when all tracks are selected", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");
    expect(screen.getByText("Ninguna")).toBeInTheDocument();
  });

  it("should deselect all when clicking 'Ninguna'", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");
    fireEvent.click(screen.getByText("Ninguna"));
    expect(await screen.findByText("Selecciona canciones")).toBeInTheDocument();
    expect(screen.getByText("Todas")).toBeInTheDocument();
  });

  it("should select all when clicking 'Todas'", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");

    // First deselect all
    fireEvent.click(screen.getByText("Ninguna"));
    await screen.findByText("Todas");

    // Then select all
    fireEvent.click(screen.getByText("Todas"));
    expect(await screen.findByText("Agregar 3 canciones")).toBeInTheDocument();
    expect(screen.getByText("Ninguna")).toBeInTheDocument();
  });

  // ── Botón Confirmar ─────────────────────────────────────────────────────────

  it("should call onConfirm with selected videoIds when confirm button clicked", async () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    await screen.findByText("Agregar 3 canciones");

    // Deselect one track and confirm
    fireEvent.click(screen.getByText("Canción 2"));
    await screen.findByText("Agregar 2 canciones");
    fireEvent.click(screen.getByText("Agregar 2 canciones"));
    expect(onConfirm).toHaveBeenCalledWith(["v1", "v3"]);
  });

  it("should not call onConfirm when no tracks selected", async () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    await screen.findByText("Agregar 3 canciones");

    // Deselect all
    fireEvent.click(screen.getByText("Canción 1"));
    fireEvent.click(screen.getByText("Canción 2"));
    fireEvent.click(screen.getByText("Canción 3"));
    await screen.findByText("Selecciona canciones");

    fireEvent.click(screen.getByText("Selecciona canciones"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── Cerrar haciendo clic en el overlay ──────────────────────────────────────

  it("should call onClose when clicking the overlay background", () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });

    const overlay = container.firstChild;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should not call onClose when clicking inside the modal", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("Mi Playlist"));
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Estado de carga ─────────────────────────────────────────────────────────

  it("should show loading message when loadingTracks is true", () => {
    renderModal({ loadingTracks: true });
    expect(screen.getByText("Cargando canciones...")).toBeInTheDocument();
  });

  it("should not show tracks list when loading", () => {
    renderModal({ loadingTracks: true });
    expect(screen.queryByText("Canción 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Canción 2")).not.toBeInTheDocument();
  });

  it("should transition from loading to showing tracks", async () => {
    const { rerender } = render(<TrackPickerModal {...defaultProps} loadingTracks />);
    expect(screen.getByText("Cargando canciones...")).toBeInTheDocument();

    rerender(<TrackPickerModal {...defaultProps} loadingTracks={false} />);
    expect(await screen.findByText("Canción 1")).toBeInTheDocument();
    expect(screen.queryByText("Cargando canciones...")).not.toBeInTheDocument();
  });

  // ── Botón de confirmar deshabilitado ────────────────────────────────────────

  it("should have disabled confirm button when no tracks selected", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");

    fireEvent.click(screen.getByText("Canción 1"));
    fireEvent.click(screen.getByText("Canción 2"));
    fireEvent.click(screen.getByText("Canción 3"));

    const confirmBtn = await screen.findByText("Selecciona canciones");
    expect(confirmBtn).toBeDisabled();
  });

  // ── Tracks sin videoId ─────────────────────────────────────────────────────

  it("should handle tracks without videoId gracefully", () => {
    const tracksWithoutId = [{ title: "No ID Track", artist: "Artist", thumbnail: "thumb.jpg" }];
    renderModal({ tracks: tracksWithoutId });
    expect(screen.getByText("No ID Track")).toBeInTheDocument();
  });

  // ── Playlist sin nombre ────────────────────────────────────────────────────

  it("should handle playlist without name", () => {
    renderModal({ playlist: { id: "pl2" } });
    expect(screen.getByText("Elige las canciones a agregar")).toBeInTheDocument();
  });

  // ── Singular/plural en botón ────────────────────────────────────────────────

  it("should show singular 'canción' when exactly 1 selected", async () => {
    renderModal();
    await screen.findByText("Agregar 3 canciones");

    fireEvent.click(screen.getByText("Canción 2"));
    fireEvent.click(screen.getByText("Canción 3"));
    expect(await screen.findByText("Agregar 1 canción")).toBeInTheDocument();
  });
});
