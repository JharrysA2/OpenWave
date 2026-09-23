import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DownloadsView from "./DownloadsView";

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
};

function renderDownloads(props = {}) {
  return render(<DownloadsView {...defaultProps} {...props} />);
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
});
