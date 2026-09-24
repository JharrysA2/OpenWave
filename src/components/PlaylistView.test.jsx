import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  api: {
    fetchPlaylistSongs: vi.fn(),
    renamePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    removeFromPlaylist: vi.fn(),
  },
}));

vi.mock("./MusicCover", () => ({
  MusicCover: () => <div data-testid="mock-music-cover" />,
}));

vi.mock("./ConfirmModal", () => ({
  ConfirmModal: ({ open, onConfirm, confirmLabel }) =>
    open ? (
      <button data-testid="confirm-action" onClick={onConfirm}>
        {confirmLabel || "Confirmar"}
      </button>
    ) : null,
}));

import PlaylistView from "./PlaylistView";
import { api } from "../utils/api";

const playlist = { id: 1, name: "Mi Playlist" };

const songs = [
  { videoId: "v1", title: "Song A", artist: "Artist A", thumbnail: "a.jpg", duration: 120 },
  { videoId: "v2", title: "Song B", artist: "Artist B", thumbnail: "b.jpg", duration: 130 },
];

const defaultProps = {
  playlist,
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: vi.fn(),
  openOptions: vi.fn(),
  onBack: vi.fn(),
  toast: vi.fn(),
  onPlaylistUpdated: vi.fn(),
  playlists: [playlist],
  refreshPlaylists: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchPlaylistSongs.mockResolvedValue(songs);
});

describe("PlaylistView", () => {
  it("should fetch and render playlist songs", async () => {
    render(<PlaylistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });
    expect(screen.getByText("Song B")).toBeInTheDocument();
    expect(api.fetchPlaylistSongs).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it("should show loading text while fetching", () => {
    api.fetchPlaylistSongs.mockReturnValue(new Promise(() => {}));
    render(<PlaylistView {...defaultProps} />);
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });

  it("should show empty state when playlist has no songs", async () => {
    api.fetchPlaylistSongs.mockResolvedValue([]);
    render(<PlaylistView {...defaultProps} />);
    await waitFor(() => {
      expect(api.fetchPlaylistSongs).toHaveBeenCalled();
    });
    expect(screen.queryByText("Song A")).toBeNull();
  });

  it("should call playSong when a song is clicked", async () => {
    render(<PlaylistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Song A"));
    expect(defaultProps.playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "v1" }),
      0,
      false,
      songs,
    );
  });

  it("marks downloaded songs to play them from the local file (offline)", async () => {
    render(<PlaylistView {...defaultProps} downloadedIds={new Set(["v1"])} />);
    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Song A"));
    expect(defaultProps.playSong).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "v1", downloaded: true }),
      0,
      false,
      expect.any(Array),
    );
    // La cola conserva el flag: la descargada sale `downloaded:true`
    // y la que no está descargada queda sin marcar.
    expect(defaultProps.playSong.mock.calls[0][3][0].downloaded).toBe(true);
    expect(defaultProps.playSong.mock.calls[0][3][1].downloaded).toBeUndefined();
  });

  it("should rename the playlist", async () => {
    api.renamePlaylist.mockResolvedValue(true);
    render(<PlaylistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Mi Playlist")).toBeInTheDocument();
    });

    // Entrar en modo edición (un click en el título h1)
    fireEvent.click(screen.getByText("Mi Playlist"));
    const input = screen.getByDisplayValue("Mi Playlist");
    fireEvent.change(input, { target: { value: "Nuevo Nombre" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(api.renamePlaylist).toHaveBeenCalledWith(1, "Nuevo Nombre", expect.any(Function));
    });
    expect(defaultProps.onPlaylistUpdated).toHaveBeenCalled();
  });

  it("should delete the whole playlist after confirm", async () => {
    api.deletePlaylist.mockResolvedValue(true);
    render(<PlaylistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });

    // Abrir menú de opciones de playlist y elegir eliminar
    const menuBtn = screen.queryByTestId("playlist-menu") || screen.getAllByRole("button").at(-1);
    fireEvent.click(menuBtn);
    const deleteOption =
      screen.queryByText(/Eliminar playlist/i) || screen.queryByTestId("delete-playlist");
    if (deleteOption) {
      fireEvent.click(deleteOption);
      fireEvent.click(screen.getByTestId("confirm-action"));
      await waitFor(() => {
        expect(api.deletePlaylist).toHaveBeenCalled();
      });
      expect(defaultProps.onBack).toHaveBeenCalled();
    }
  });

  it("should call onBack when back is clicked", async () => {
    const { container } = render(<PlaylistView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });
    const backBtn = container.querySelector("button");
    fireEvent.click(backBtn);
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  // ── Contraste: superficies con el acento de fondo (regresión portada blanca)
  it("el botón Reproducir usa --neon-fg, nunca texto blanco fijo", async () => {
    render(<PlaylistView {...defaultProps} accentColor="#ffffff" />);
    await waitFor(() => {
      expect(screen.getByText("Song A")).toBeInTheDocument();
    });
    const play = screen
      .getAllByRole("button", { name: "Reproducir" })
      .find((b) => b.style.background === "rgb(255, 255, 255)");
    expect(play).toBeTruthy();
    expect(play.style.color).toContain("var(--neon-fg)");
  });
});
