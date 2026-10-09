import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaSession } from "./useMediaSession";

/** Canción tipo con portadas (forma normalizada por api.js/thumbnails.js). */
const SONG = {
  title: "Canción X",
  artist: "Artista Y",
  album: "Álbum Z",
  thumbnail: "https://i.ytimg.com/vi/AAA/mqdefault.jpg",
  thumbnails: [
    { url: "https://i.ytimg.com/vi/AAA/mqdefault.jpg", width: 320 },
    { url: "https://i.ytimg.com/vi/AAA/hqdefault.jpg", width: 480 },
  ],
};

/** `navigator.mediaSession` simulado con captura de handlers/posiciones. */
function installMediaSession() {
  const handlers = {};
  const ms = {
    metadata: null,
    playbackState: "none",
    handlers,
    setActionHandler: vi.fn((action, fn) => {
      handlers[action] = fn;
    }),
    setPositionState: vi.fn(),
  };
  Object.defineProperty(navigator, "mediaSession", { value: ms, configurable: true });
  return ms;
}

function makeAudio({ currentTime = 0, duration = 200, playbackRate = 1 } = {}) {
  const audio = new EventTarget();
  audio.currentTime = currentTime;
  audio.duration = duration;
  audio.playbackRate = playbackRate;
  return audio;
}

function baseProps(over = {}) {
  return {
    currentSong: SONG,
    isPlaying: false,
    duration: 200,
    togglePlay: vi.fn(),
    handleNext: vi.fn(),
    handlePrev: vi.fn(),
    handleSeek: vi.fn(),
    audioRef: { current: null },
    ...over,
  };
}

beforeEach(() => {
  // jsdom no trae MediaMetadata: lo simulamos para las rutas que sí publican.
  vi.stubGlobal(
    "MediaMetadata",
    class FakeMediaMetadata {
      constructor(init) {
        Object.assign(this, init);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete navigator.mediaSession;
});

describe("useMediaSession — tarjeta de medios de la taskbar (SMTC)", () => {
  it("publica título, artista, álbum y portada de la canción actual", () => {
    const ms = installMediaSession();

    renderHook(() => useMediaSession(baseProps()));

    expect(ms.metadata).toBeTruthy();
    expect(ms.metadata.title).toBe("Canción X");
    expect(ms.metadata.artist).toBe("Artista Y");
    expect(ms.metadata.album).toBe("Álbum Z");
    // La portada se toma de la mayor resolución disponible (allSrcs ordena
    // por ancho desc), igual que la que pinta MusicCover.
    expect(ms.metadata.artwork).toHaveLength(1);
    expect(ms.metadata.artwork[0].src).toBe("https://i.ytimg.com/vi/AAA/hqdefault.jpg");
  });

  it("limpia la metadata al desmontar y cuando no hay canción", () => {
    const ms = installMediaSession();
    const { rerender, unmount } = renderHook((props) => useMediaSession(props), {
      initialProps: baseProps(),
    });

    expect(ms.metadata).toBeTruthy();

    // Sin canción → sin metadatos en el SO.
    rerender(baseProps({ currentSong: null }));
    expect(ms.metadata).toBeNull();

    // Con canción y al desmontar → la tarjeta no conserva datos huérfanos.
    rerender(baseProps());
    expect(ms.metadata).toBeTruthy();
    unmount();
    expect(ms.metadata).toBeNull();
  });

  it("sincroniza playbackState con el reproductor", () => {
    const ms = installMediaSession();
    const { rerender } = renderHook((props) => useMediaSession(props), {
      initialProps: baseProps({ isPlaying: false }),
    });

    expect(ms.playbackState).toBe("paused");

    rerender(baseProps({ isPlaying: true }));
    expect(ms.playbackState).toBe("playing");

    rerender(baseProps({ isPlaying: false }));
    expect(ms.playbackState).toBe("paused");
  });

  it("cablea los controles del sistema al reproductor de la app", () => {
    const ms = installMediaSession();
    const togglePlay = vi.fn();
    const handleNext = vi.fn();
    const handlePrev = vi.fn();
    const handleSeek = vi.fn();
    const { rerender } = renderHook((props) => useMediaSession(props), {
      initialProps: baseProps({
        isPlaying: false,
        togglePlay,
        handleNext,
        handlePrev,
        handleSeek,
      }),
    });

    // Pausado: «play» arranca, «pause» no hace nada (no alterna a ciegas).
    act(() => ms.handlers.play());
    expect(togglePlay).toHaveBeenCalledTimes(1);
    act(() => ms.handlers.pause());
    expect(togglePlay).toHaveBeenCalledTimes(1);

    // Sonando: «pause» pausa, «play» no hace nada.
    rerender(baseProps({ isPlaying: true, togglePlay, handleNext, handlePrev, handleSeek }));
    act(() => ms.handlers.pause());
    expect(togglePlay).toHaveBeenCalledTimes(2);
    act(() => ms.handlers.play());
    expect(togglePlay).toHaveBeenCalledTimes(2);

    // Canción siguiente/anterior + seek absoluto (segundos, como handleSeek).
    act(() => ms.handlers.nexttrack());
    expect(handleNext).toHaveBeenCalledTimes(1);
    act(() => ms.handlers.previoustrack());
    expect(handlePrev).toHaveBeenCalledTimes(1);
    act(() => ms.handlers.seekto({ seekTime: 42 }));
    expect(handleSeek).toHaveBeenCalledWith(42);
  });

  it("seekbackward/seekforward se calculan desde la posición del audio", () => {
    const ms = installMediaSession();
    const handleSeek = vi.fn();
    const audio = makeAudio({ currentTime: 100 });
    renderHook(() => useMediaSession(baseProps({ handleSeek, audioRef: { current: audio } })));

    act(() => ms.handlers.seekbackward({ seekOffset: 15 }));
    expect(handleSeek).toHaveBeenLastCalledWith(85);
    act(() => ms.handlers.seekforward({ seekOffset: 15 }));
    expect(handleSeek).toHaveBeenLastCalledWith(115);

    // Sin offset del SO → paso por defecto de 10 s, y sin posición negativa.
    audio.currentTime = 4;
    act(() => ms.handlers.seekbackward());
    expect(handleSeek).toHaveBeenLastCalledWith(0);
  });

  it("publica positionState con throttle de 1 s", () => {
    const ms = installMediaSession();
    const audio = makeAudio({ currentTime: 30, duration: 200 });
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    renderHook(() => useMediaSession(baseProps({ audioRef: { current: audio } })));

    expect(ms.setPositionState).toHaveBeenCalledTimes(1);
    expect(ms.setPositionState).toHaveBeenCalledWith({
      duration: 200,
      position: 30,
      playbackRate: 1,
    });

    // timeupdate llega ~4×/s: dentro del segundo se descarta.
    act(() => audio.dispatchEvent(new Event("timeupdate")));
    expect(ms.setPositionState).toHaveBeenCalledTimes(1);

    now += 1500;
    act(() => audio.dispatchEvent(new Event("timeupdate")));
    expect(ms.setPositionState).toHaveBeenCalledTimes(2);
    expect(ms.setPositionState).toHaveBeenLastCalledWith({
      duration: 200,
      position: 30,
      playbackRate: 1,
    });
  });

  it("no revienta sin mediaSession ni MediaMetadata (feature-detection)", () => {
    // Sin navigator.mediaSession instalado y sin MediaMetadata global:
    vi.unstubAllGlobals();

    expect(() => renderHook(() => useMediaSession(baseProps()))).not.toThrow();
    expect(() => renderHook(() => useMediaSession(baseProps({ currentSong: null })))).not.toThrow();
  });
});
