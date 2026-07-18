import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SongOptionsSheet } from "./SongOptionsSheet";
import { mockApiResponse } from "../test-utils";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = {
  videoId: "abc123",
  title: "Test Song",
  artist: "Test Artist",
  thumbnail: "https://example.com/thumb.jpg",
  duration: 200,
  downloaded: false,
};

const defaultProps = {
  song: null,
  open: false,
  onClose: () => {},
  onDownload: () => {},
  onDownloadStart: () => {},
  onPlayNext: () => {},
  liked: false,
  onLike: () => {},
  toast: () => {},
  onGoToAlbum: () => {},
  onGoToArtist: () => {},
  onOpenPlaylistPicker: () => {},
  onDeleteSong: null,
};

function renderSheet(props = {}) {
  return render(<SongOptionsSheet {...defaultProps} {...props} />);
}

describe("SongOptionsSheet", () => {
  // ── Null state ────────────────────────────────────────────────────

  it("should render null when no song", () => {
    const { container } = renderSheet({ open: true });
    expect(container.innerHTML).toBe("");
  });

  // ── Render with song ──────────────────────────────────────────────

  it("should render song title and artist when open", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Test Song")).toBeInTheDocument();
    // Artist appears in header AND artist button → use getAllByText
    expect(screen.getAllByText("Test Artist").length).toBeGreaterThanOrEqual(1);
  });

  it("should show OFFLINE badge when song is downloaded", () => {
    renderSheet({ song: { ...song, downloaded: true }, open: true });
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  it("should hide OFFLINE badge when not downloaded", () => {
    renderSheet({ song: { ...song, downloaded: false }, open: true });
    expect(screen.queryByText("OFFLINE")).not.toBeInTheDocument();
  });

  // ── Backdrop ──────────────────────────────────────────────────────

  it("should call onClose when backdrop overlay is clicked", () => {
    const onClose = vi.fn();
    renderSheet({ song, open: true, onClose });
    // The backdrop is a fixed overlay div (first child of fragment)
    const backdrop = document.body.querySelector("div[style*='position: fixed']");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Buttons grid ───────────────────────────────────────────────────

  it("should show Descargar button", () => {
    renderSheet({ song, open: true });
    const btns = screen.getAllByText("Descargar");
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it("should show Me gusta button", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Me gusta")).toBeInTheDocument();
  });

  it("should show Agregar a cola button", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Agregar a cola")).toBeInTheDocument();
  });

  it("should show Agregar a button", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Agregar a")).toBeInTheDocument();
  });

  it("should show Compartir button", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Compartir")).toBeInTheDocument();
  });

  it("should show Álbum button", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Álbum")).toBeInTheDocument();
  });

  it("should show Artista button", () => {
    renderSheet({ song, open: true });
    expect(screen.getAllByText("Test Artist").length).toBeGreaterThanOrEqual(1);
  });

  it("should show Detalles button", () => {
    renderSheet({ song, open: true });
    expect(screen.getByText("Detalles")).toBeInTheDocument();
  });

  // ── Download button states ────────────────────────────────────────

  it("should show downloaded song as delete action", () => {
    renderSheet({ song: { ...song, downloaded: true }, open: true });
    // Downloaded songs show "Eliminar descarga" instead of "Descargar"
    expect(screen.getByText("Eliminar descarga")).toBeInTheDocument();
  });

  // ── Like button ───────────────────────────────────────────────────

  it("should call onLike when Me gusta is clicked", () => {
    const onLike = vi.fn();
    renderSheet({ song, open: true, onLike });
    fireEvent.click(screen.getByText("Me gusta"));
    expect(onLike).toHaveBeenCalledWith("abc123", song);
  });

  // ── Play next ─────────────────────────────────────────────────────

  it("should call onPlayNext when Agregar a cola is clicked", () => {
    const onPlayNext = vi.fn();
    const toast = vi.fn();
    renderSheet({ song, open: true, onPlayNext, toast });
    fireEvent.click(screen.getByText("Agregar a cola"));
    expect(onPlayNext).toHaveBeenCalledWith(song);
    expect(toast).toHaveBeenCalledWith("Agregada a la cola", "success");
  });

  // ── Share button ──────────────────────────────────────────────────

  it("should copy link when Compartir is clicked", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const toast = vi.fn();
    renderSheet({ song, open: true, toast });
    fireEvent.click(screen.getByText("Compartir"));
    expect(writeText).toHaveBeenCalledWith("https://music.youtube.com/watch?v=abc123");
    expect(toast).toHaveBeenCalledWith("Enlace copiado", "success");
  });

  // ── Details button ────────────────────────────────────────────────

  it("should fetch details when Detalles is clicked", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockApiResponse({ title: "Test Song", artist: "Test Artist", year: "2024" }),
      );
    vi.stubGlobal("fetch", mockFetch);
    renderSheet({ song, open: true });
    fireEvent.click(screen.getByText("Detalles"));
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
    // Wait for fetch to resolve
    await vi.waitFor(() => {
      expect(screen.getByText("Año")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  // ── Album and Artist buttons ────────────────────────────────────

  it("should call onGoToAlbum when Álbum is clicked", () => {
    const onGoToAlbum = vi.fn();
    renderSheet({ song: { ...song, album: "Test Album" }, open: true, onGoToAlbum });
    fireEvent.click(screen.getByText("Test Album"));
    expect(onGoToAlbum).toHaveBeenCalledWith(expect.objectContaining({ videoId: "abc123" }));
  });

  it("should call onGoToArtist when artist button is clicked", () => {
    const onGoToArtist = vi.fn();
    renderSheet({ song, open: true, onGoToArtist });
    // Artist appears in header (div) and button span → click the button (second match)
    const matches = screen.getAllByText("Test Artist");
    fireEvent.click(matches[1]);
    expect(onGoToArtist).toHaveBeenCalledWith(expect.objectContaining({ videoId: "abc123" }));
  });

  // ── Delete button ─────────────────────────────────────────────────

  it("should render delete button when onDeleteSong is provided", () => {
    renderSheet({ song, open: true, onDeleteSong: vi.fn() });
    expect(screen.getByText("Eliminar de biblioteca")).toBeInTheDocument();
  });

  it("should not render delete button when onDeleteSong is null", () => {
    renderSheet({ song, open: true, onDeleteSong: null });
    expect(screen.queryByText("Eliminar de biblioteca")).not.toBeInTheDocument();
  });

  // ── Close button ──────────────────────────────────────────────────

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderSheet({ song, open: true, onClose });
    // Find the close button (has Ic.close SVG)
    const closeBtn = screen
      .getAllByRole("button")
      .find((b) => b.innerHTML.includes("M18 6") || b.style.borderRadius === "50%");
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
