import React, { createRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioElements } from "./AudioElements";
import { api } from "../utils/api";

vi.mock("../utils/api", () => ({
  api: { logHistory: vi.fn(() => Promise.resolve()) },
}));

const SONG = { videoId: "ae_v1", title: "Canción" };

function setup({ pauseHistory = false } = {}) {
  const audioRef = createRef();
  const nextAudioRef = createRef();
  const progressRef = { current: 0 };
  const loggedSongRef = { current: null };
  const currentlyPlayingSongRef = { current: SONG };
  const setDuration = vi.fn();
  const toast = vi.fn();

  const utils = render(
    <AudioElements
      audioRef={audioRef}
      nextAudioRef={nextAudioRef}
      progressRef={progressRef}
      loggedSongRef={loggedSongRef}
      currentlyPlayingSongRef={currentlyPlayingSongRef}
      setDuration={setDuration}
      handleSongEnded={() => {}}
      handleAudioError={() => {}}
      pauseHistory={pauseHistory}
      toast={toast}
    />,
  );

  return { utils, audioRef, nextAudioRef, progressRef, loggedSongRef, setDuration };
}

function setTime(audio, seconds) {
  Object.defineProperty(audio, "currentTime", {
    value: seconds,
    writable: true,
    configurable: true,
  });
}

describe("AudioElements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza los dos elementos de audio ocultos", () => {
    const { utils } = setup();
    expect(utils.container.querySelectorAll("audio").length).toBe(2);
  });

  it("registra la escucha a los 30 s (una sola vez por canción)", () => {
    const { audioRef, loggedSongRef } = setup();

    setTime(audioRef.current, 31);
    fireEvent.timeUpdate(audioRef.current);

    expect(api.logHistory).toHaveBeenCalledTimes(1);
    expect(api.logHistory).toHaveBeenCalledWith(SONG, expect.any(Function));

    // Segundo tick no duplica
    fireEvent.timeUpdate(audioRef.current);
    expect(api.logHistory).toHaveBeenCalledTimes(1);
    expect(loggedSongRef.current).toBe("ae_v1");
  });

  it("con «Pausar historial» activo NO registra la escucha", () => {
    const { audioRef, loggedSongRef } = setup({ pauseHistory: true });

    setTime(audioRef.current, 45);
    fireEvent.timeUpdate(audioRef.current);

    expect(api.logHistory).not.toHaveBeenCalled();
    // Tampoco se marca como logueado: al desactivarlo, la canción en curso
    // se registraría en el siguiente tick.
    expect(loggedSongRef.current).toBeNull();
  });

  it("actualiza progressRef en cada timeupdate", () => {
    const { audioRef, progressRef } = setup();

    setTime(audioRef.current, 12.5);
    fireEvent.timeUpdate(audioRef.current);

    expect(progressRef.current).toBe(12.5);
  });
});
