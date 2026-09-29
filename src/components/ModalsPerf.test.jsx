import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithSettings, expectOverlayGlassBudget, inlineBlurred } from "../test-utils";
import { ConfirmModal } from "./ConfirmModal";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { PlaylistPickerModal } from "./PlaylistPickerModal";
import { TransferModal } from "./TransferModal";
import { TrackPickerModal } from "./TrackPickerModal";
import { SelectionModal } from "./SelectionModal";
import { SongOptionsSheet } from "./SongOptionsSheet";
import { EntityOptionsSheet } from "./EntityOptionsSheet";
import SettingsPanel from "./SettingsPanel";
import { BarStyleModal } from "./settings/BarStyleModal";
import { BtnShapeModal } from "./settings/BtnShapeModal";

// Presupuesto de GPU de overlays: ver `expectOverlayGlassBudget` en
// test-utils.jsx y docs/PERFORMANCE.md. Resumen: 0 backdrop-filter en
// cualquier capa de un overlay (ni scrim, ni hoja: el filtro full-screen se
// re-ejecutaba en cada repintado de detrás) y `html.overlay-open` montado
// mientras el overlay está abierto (pausa animaciones, repaints y blurs de
// la shell que quedan tapados).

const mockApiGet = vi.fn();
vi.mock("../utils/api", () => ({
  api: {
    base: "http://127.0.0.1:8765",
    get: (...args) => mockApiGet(...args),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock("./MusicCover", () => ({
  MusicCover: ({ alt, style }) => <div data-testid="music-cover" aria-label={alt} style={style} />,
}));

const song = {
  videoId: "abc123",
  title: "Test Song",
  artist: "Test Artist",
  thumbnail: "https://example.com/thumb.jpg",
  thumbnails: [{ url: "https://example.com/thumb.jpg", width: 200, height: 200 }],
  duration: 200,
};

const noop = () => {};
const overlayOpen = () => document.documentElement.classList.contains("overlay-open");

// ── Overlays a pantalla completa ───────────────────────────────────────────

const overlays = [
  ["ConfirmModal", <ConfirmModal key="a" open title="Borrar" message="¿Seguro?" onCancel={noop} />],
  ["CreatePlaylistModal", <CreatePlaylistModal key="b" open onClose={noop} toast={noop} />],
  [
    "PlaylistPickerModal",
    <PlaylistPickerModal
      key="c"
      open
      playlists={[]}
      song={song}
      songs={[song]}
      toast={noop}
      refreshPlaylists={noop}
      onClose={noop}
    />,
  ],
  ["TransferModal", <TransferModal key="d" open onClose={noop} playlists={[]} onSelect={noop} />],
  [
    "TrackPickerModal",
    <TrackPickerModal
      key="e"
      open
      playlist={{ name: "Mi lista" }}
      tracks={[song]}
      onClose={noop}
      onConfirm={noop}
    />,
  ],
  [
    "SelectionModal",
    <SelectionModal
      key="f"
      open
      songs={[song]}
      currentSong={null}
      onClose={noop}
      onDelete={noop}
    />,
  ],
  [
    "SongOptionsSheet",
    <SongOptionsSheet
      key="g"
      song={song}
      open
      onClose={noop}
      onDownload={noop}
      onDownloadStart={noop}
      onPlayNext={noop}
      liked={false}
      onLike={noop}
      toast={noop}
      onGoToAlbum={noop}
      onGoToArtist={noop}
      onOpenPlaylistPicker={noop}
      onRadio={noop}
    />,
  ],
  [
    "EntityOptionsSheet",
    <EntityOptionsSheet
      key="h"
      open
      onClose={noop}
      type="album"
      entity={{ title: "Álbum X", browseId: "b1", artist: "Artista" }}
      onToggleLike={noop}
    />,
  ],
  [
    "SettingsPanel",
    <SettingsPanel
      key="i"
      open
      onClose={noop}
      neonColor="#a78bfa"
      crossfadeDuration={0}
      setCrossfadeDuration={noop}
      downloads={[]}
      onClearDownloads={noop}
      onClearHistory={noop}
      liked={new Set()}
      history={[]}
      playlists={[]}
      toast={noop}
    />,
  ],
  [
    "BarStyleModal",
    <BarStyleModal key="j" accent="#a78bfa" settings={{}} updateSetting={noop} onClose={noop} />,
  ],
  [
    "BtnShapeModal",
    <BtnShapeModal key="k" accent="#a78bfa" settings={{}} updateSetting={noop} onClose={noop} />,
  ],
];

describe("presupuesto de glass en overlays", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("overlay-open");
    mockApiGet.mockImplementation(() => Promise.resolve({}));
  });

  it.each(overlays)("%s: 0 backdrop-filter y overlay-open", (name, element) => {
    const { unmount } = renderWithSettings(element);

    expectOverlayGlassBudget();
    // Clase que pausa shimmer/pulse/conexión y apaga los blurs de la shell
    expect(overlayOpen()).toBe(true);

    unmount();
    expect(overlayOpen()).toBe(false);
  });

  it("el blur viejo (10px/saturate/8px/6px) no reaparece en los overlays", () => {
    renderWithSettings(overlays[7][1]); // EntityOptionsSheet (hoja con acciones)
    const html = document.body.innerHTML;
    expect(html).not.toContain("blur(10px)");
    expect(html).not.toContain("blur(6px)");
    expect(html).not.toContain("saturate(");
    expect(html).not.toContain("blur(8px)");
    // Ninguna capa del overlay difumina: 0 filtros, no "6px"
    expect(inlineBlurred().length).toBe(0);
    expectOverlayGlassBudget();
  });
});
