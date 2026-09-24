import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  api: {
    deleteDownloads: vi.fn(),
    deleteSelectedDownloads: vi.fn(),
    addToPlaylist: vi.fn(),
  },
}));

vi.mock("./ConfirmModal", () => ({
  ConfirmModal: ({ open, onConfirm, confirmLabel }) =>
    open ? (
      <button data-testid="confirm-action" onClick={onConfirm}>
        {confirmLabel || "Confirmar"}
      </button>
    ) : null,
}));

import DownloadsView from "./DownloadsView";
import { api } from "../utils/api";

// Mock MusicCover
vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = (id, overrides = {}) => ({
  videoId: id,
  title: `Downloaded Song ${id}`,
  artist: `Artist ${id}`,
  thumbnail: `https://example.com/${id}.jpg`,
  thumbnails: [{ url: `https://example.com/${id}.jpg`, width: 200, height: 200 }],
  duration: 180,
  ...overrides,
});

const defaultProps = {
  downloads: [],
  currentSong: null,
  accentColor: "#a78bfa",
  playSong: vi.fn(),
  openOptions: vi.fn(),
  openEntityOptions: vi.fn(),
  goToAlbum: vi.fn(),
  toast: vi.fn(),
  onDownloadsRemoved: vi.fn(),
  playlists: [],
  refreshPlaylists: vi.fn(),
};

function renderDownloads(props = {}) {
  return render(<DownloadsView {...defaultProps} {...props} />);
}

/**
 * Harness que imita a App: mantiene `downloads` en estado y lo filtra al
 * recibir `onDownloadsRemoved` / `onDownloadsCleared`, como hace App.jsx.
 */
function DownloadsHarness({ initialDownloads = [], onRemoved, onCleared, ...props }) {
  const [downloads, setDownloads] = React.useState(initialDownloads);
  return (
    <DownloadsView
      {...defaultProps}
      {...props}
      downloads={downloads}
      onDownloadsRemoved={(ids) => {
        onRemoved?.(ids);
        setDownloads((prev) => prev.filter((d) => !ids.includes(d.videoId || d.video_id)));
      }}
      onDownloadsCleared={() => {
        onCleared?.();
        setDownloads([]);
      }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DownloadsView", () => {
  // ── Estado vacío ────────────────────────────────────────────────

  it("should show empty state when no downloads", () => {
    renderDownloads();
    expect(screen.getByText("Descargas")).toBeInTheDocument();
    expect(
      screen.getByText("Descarga canciones para escucharlas sin conexión"),
    ).toBeInTheDocument();
  });

  it("should render the 2 library tabs (sin Artistas)", () => {
    renderDownloads();
    expect(screen.getByText("Canciones")).toBeInTheDocument();
    expect(screen.getByText("Álbumes")).toBeInTheDocument();
    expect(screen.queryByText("Artistas")).toBeNull();
  });

  // ── Pestaña Canciones ───────────────────────────────────────────

  it("should render list of downloaded songs", () => {
    const downloads = [song("1"), song("2")];
    renderDownloads({ downloads });
    expect(screen.getByText("Downloaded Song 1")).toBeInTheDocument();
    expect(screen.getByText("Downloaded Song 2")).toBeInTheDocument();
    expect(screen.getByText("Artist 1")).toBeInTheDocument();
    expect(screen.getByText("Artist 2")).toBeInTheDocument();
  });

  it("should show OFFLINE badge for each downloaded song", () => {
    renderDownloads({ downloads: [song("1")] });
    expect(screen.getAllByText("OFFLINE")).toHaveLength(1);
  });

  it("should show file size when available", () => {
    renderDownloads({ downloads: [song("1", { size: 3 * 1024 * 1024 })] });
    expect(screen.getByText("3.0 MB")).toBeInTheDocument();
  });

  it("should call playSong with downloaded:true and list as queue", () => {
    const playSong = vi.fn();
    renderDownloads({ downloads: [song("1")], playSong });
    fireEvent.click(screen.getByText("Downloaded Song 1"));
    expect(playSong.mock.calls[0][0]).toMatchObject({
      videoId: "1",
      title: "Downloaded Song 1",
      downloaded: true,
    });
    expect(playSong.mock.calls[0][3]).toHaveLength(1);
  });

  it("should call openOptions with the normalized songData", () => {
    const openOptions = vi.fn();
    renderDownloads({ downloads: [song("1")], openOptions });
    fireEvent.click(screen.getByTitle("Más opciones"));
    expect(openOptions.mock.calls[0][0]).toMatchObject({
      videoId: "1",
      downloaded: true,
    });
  });

  it("should handle songs with video_id instead of videoId", () => {
    renderDownloads({
      downloads: [{ video_id: "legacy1", title: "Legacy Song", artist: "Legacy Artist" }],
    });
    expect(screen.getByText("Legacy Song")).toBeInTheDocument();
  });

  it("should render multiple OFFLINE badges", () => {
    renderDownloads({ downloads: [song("1"), song("2"), song("3")] });
    expect(screen.getAllByText("OFFLINE")).toHaveLength(3);
  });

  // ── Pestaña Álbumes (agrupación de descargas) ───────────────────

  it("should group downloads into album cards", () => {
    const downloads = [
      song("1", { album: "Álbum X", albumBrowseId: "MPREb_x", size: 1024 }),
      song("2", { album: "Álbum X", albumBrowseId: "MPREb_x", size: 2048 }),
    ];
    renderDownloads({ downloads });
    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.getByText("Álbum X")).toBeInTheDocument();
    expect(screen.getByText("2 canciones · 3 KB")).toBeInTheDocument();
  });

  it("should play all album tracks from the card ▶", () => {
    const playSong = vi.fn();
    const downloads = [
      song("1", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
      song("2", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
    ];
    renderDownloads({ downloads, playSong });
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByTitle("Reproducir"));
    expect(playSong.mock.calls[0][0]).toMatchObject({ videoId: "1" });
    expect(playSong.mock.calls[0][3]).toHaveLength(2);
  });

  it("should open entity options with the album tracks from ⋮", () => {
    const openEntityOptions = vi.fn();
    const downloads = [
      song("1", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
      song("2", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
    ];
    renderDownloads({ downloads, openEntityOptions });
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByTitle("Más opciones"));
    expect(openEntityOptions).toHaveBeenCalledTimes(1);
    const [type, entity, tracks] = openEntityOptions.mock.calls[0];
    expect(type).toBe("album");
    expect(entity).toMatchObject({ browseId: "MPREb_x", title: "Álbum X" });
    expect(tracks).toHaveLength(2);
  });

  it("should show empty state in Álbumes tab when no downloads", () => {
    renderDownloads();
    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.getByText(/Los álbumes de tus descargas/)).toBeInTheDocument();
  });

  // ── Reproducción por pestaña ───────────────────────────────────

  it("Reproducir in Canciones plays the first download with the full queue", () => {
    const playSong = vi.fn();
    renderDownloads({ downloads: [song("1"), song("2")], playSong });
    fireEvent.click(screen.getByTestId("hero-play"));
    expect(playSong.mock.calls[0][0]).toMatchObject({ videoId: "1" });
    expect(playSong.mock.calls[0][3]).toHaveLength(2);
  });

  it("Reproducir in Álbumes plays only the FIRST album's songs", () => {
    const playSong = vi.fn();
    const downloads = [
      song("1", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
      song("2", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
      song("3", { album: "Álbum Y", albumBrowseId: "MPREb_y" }),
    ];
    renderDownloads({ downloads, playSong });
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByTestId("hero-play"));
    expect(playSong.mock.calls[0][0]).toMatchObject({ videoId: "1" });
    expect(playSong.mock.calls[0][3]).toHaveLength(2); // cola = primer álbum
  });

  it("Aleatorio in Álbumes mixes the tracks of ALL downloaded albums", () => {
    const playSong = vi.fn();
    const downloads = [
      song("1", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
      song("2", { album: "Álbum X", albumBrowseId: "MPREb_x" }),
      song("3", { album: "Álbum Y", albumBrowseId: "MPREb_y" }),
    ];
    renderDownloads({ downloads, playSong });
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByTestId("hero-shuffle"));
    expect(playSong).toHaveBeenCalledTimes(1);
    const queueIds = playSong.mock.calls[0][3].map((s) => s.videoId).sort();
    expect(queueIds).toEqual(["1", "2", "3"]);
    expect(playSong.mock.calls[0][0]).toBe(playSong.mock.calls[0][3][0]);
  });

  it("disables play when the ACTIVE tab has no content", () => {
    // Sin álbum en la canción → la pestaña Álbumes queda vacía
    renderDownloads({ downloads: [song("1")] });
    expect(screen.getByTestId("hero-play")).toBeEnabled();
    fireEvent.click(screen.getByText("Álbumes"));
    expect(screen.getByTestId("hero-play")).toBeDisabled();
    fireEvent.click(screen.getByText("Canciones"));
    expect(screen.getByTestId("hero-play")).toBeEnabled();
  });

  // ── Selección múltiple y borrado masivo ────────────────────────

  it("deletes the selected downloads after confirm (1 sola petición)", async () => {
    api.deleteSelectedDownloads.mockResolvedValue(true);
    const onDownloadsRemoved = vi.fn();
    render(
      <DownloadsHarness initialDownloads={[song("1"), song("2")]} onRemoved={onDownloadsRemoved} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Downloaded Song 1"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar (1)" }));
    // Confirmación antes de borrar archivos del disco
    expect(screen.getByTestId("confirm-action")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() =>
      expect(api.deleteSelectedDownloads).toHaveBeenCalledWith(["1"], expect.any(Function)),
    );
    expect(onDownloadsRemoved).toHaveBeenCalledWith(["1"]);
    expect(screen.queryByText("Downloaded Song 1")).toBeNull();
    expect(screen.getByText("Downloaded Song 2")).toBeInTheDocument();
  });

  it("keeps the songs when the bulk delete fails", async () => {
    api.deleteSelectedDownloads.mockResolvedValue(false);
    const onDownloadsRemoved = vi.fn();
    renderDownloads({ downloads: [song("1")], onDownloadsRemoved });

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Downloaded Song 1"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar (1)" }));
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() => expect(api.deleteSelectedDownloads).toHaveBeenCalled());
    expect(onDownloadsRemoved).not.toHaveBeenCalled();
    expect(screen.getByText("Downloaded Song 1")).toBeInTheDocument();
  });

  it("clears ALL downloads after confirm (Eliminar todo)", async () => {
    api.deleteDownloads.mockResolvedValue(undefined);
    const onDownloadsCleared = vi.fn();
    render(
      <DownloadsHarness initialDownloads={[song("1"), song("2")]} onCleared={onDownloadsCleared} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Eliminar todo/ }));
    expect(screen.getByTestId("confirm-action")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() => expect(api.deleteDownloads).toHaveBeenCalledTimes(1));
    expect(onDownloadsCleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Downloaded Song 1")).toBeNull();
  });

  it("moves the selected downloads to a playlist", async () => {
    const refreshPlaylists = vi.fn();
    renderDownloads({
      downloads: [song("1"), song("2")],
      playlists: [{ id: 3, name: "Road Trip" }],
      refreshPlaylists,
    });

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Downloaded Song 2"));
    fireEvent.click(screen.getByRole("button", { name: "Mover (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /Road Trip/ }));

    await waitFor(() =>
      expect(api.addToPlaylist).toHaveBeenCalledWith(
        3,
        [expect.objectContaining({ videoId: "2" })],
        expect.any(Function),
      ),
    );
    expect(refreshPlaylists).toHaveBeenCalled();
  });

  it("clears the selection when switching tabs", () => {
    renderDownloads({ downloads: [song("1")] });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByText("Downloaded Song 1"));
    expect(screen.getByRole("button", { name: "Eliminar (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Álbumes"));
    fireEvent.click(screen.getByText("Canciones"));
    expect(screen.queryByRole("button", { name: /Eliminar \(1\)/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Seleccionar" })).toBeInTheDocument();
  });

  // ── Contraste: superficies con el acento de fondo (regresión portada blanca)
  it("el botón primario usa --neon-fg, nunca texto blanco fijo", () => {
    renderDownloads({ downloads: [song("1")], accentColor: "#ffffff" });
    const play = screen.getByTestId("hero-play");
    expect(play.style.background).toBe("rgb(255, 255, 255)");
    expect(play.style.color).toContain("var(--neon-fg)");
  });
});
