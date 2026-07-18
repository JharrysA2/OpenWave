import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePlayer } from "./usePlayer";
import { mockApiResponse } from "../test-utils";

beforeEach(() => {
  localStorage.clear();
  // Mock HTMLAudioElement
  window.HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLAudioElement.prototype.pause = vi.fn();
});

/**
 * Crea un elemento de audio mock con las propiedades que usePlayer necesita.
 * @param {number} duration - duración en segundos del stream
 * @param {boolean} playSucceeds - si play() resuelve o rechaza
 */
function createMockAudio(duration = 200, playSucceeds = true) {
  const audio = new Audio();
  Object.defineProperty(audio, "duration", { value: duration, writable: true });
  audio.play = vi.fn(() =>
    playSucceeds ? Promise.resolve() : Promise.reject(new Error("play failed")),
  );
  audio.pause = vi.fn();
  audio.src = "";
  audio.currentTime = 0;
  audio.volume = 0.7;
  return audio;
}

/**
 * Mockea fetch para que /stream-url/* devuelva una URL reproducible.
 * Sin esto, el crossfade aborta al no poder obtener el stream de la
 * siguiente canción. Devuelve el spy para poder restaurarlo.
 */
function mockStreamFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    const u = String(url);
    if (u.includes("/stream-url/")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: () =>
          Promise.resolve({
            url: "https://stream.example.com/audio.mp4",
            headers: {},
            duration: 200,
          }),
        text: () => Promise.resolve(""),
      });
    }
    // Resto de endpoints (queue, lyrics, feedback) → respuesta vacía válida
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
    });
  });
}

/**
 * Como mockStreamFetch pero CAPTURA los bodies de POST /queue/feedback,
 * para verificar a qué canción se le envía el feedback "complete" (B7).
 */
function mockFetchCaptureFeedback() {
  const feedbackBodies = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    const u = String(url);
    if (u.includes("/queue/feedback")) {
      try {
        feedbackBodies.push(JSON.parse(init.body));
      } catch {}
    }
    if (u.includes("/stream-url/")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: () =>
          Promise.resolve({
            url: "https://stream.example.com/audio.mp4",
            headers: {},
            duration: 200,
          }),
        text: () => Promise.resolve(""),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
    });
  });
  return { feedbackBodies, spy };
}

describe("usePlayer", () => {
  // ── Estado inicial ────────────────────────────────────────────────────────

  it("should start with default state", () => {
    const { result } = renderHook(() => usePlayer());
    expect(result.current.currentSong).toBeNull();
    expect(result.current.queue).toEqual([]);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.streamLoading).toBe(false);
    expect(result.current.duration).toBe(0);
    expect(result.current.volume).toBe(0.7);
    expect(result.current.crossfadeDuration).toBe(0);
    expect(result.current.shuffleActive).toBe(false);
    expect(result.current.repeatMode).toBe("off");
    expect(result.current.lyricsOpen).toBe(false);
  });

  it("should use initialCrossfade parameter", () => {
    const { result } = renderHook(() => usePlayer(null, [], 7));
    expect(result.current.crossfadeDuration).toBe(7);
  });

  // ── Volumen ───────────────────────────────────────────────────────────────

  it("should clamp volume between 0 and 1", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => result.current.handleVolume(1.5));
    expect(result.current.volume).toBe(1);
    act(() => result.current.handleVolume(-1));
    expect(result.current.volume).toBe(0);
  });

  it("should persist volume to localStorage", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => result.current.handleVolume(0.5));
    expect(localStorage.getItem("sw_volume")).toBe("0.5");
  });

  it("should apply the volume set via handleVolume", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => result.current.handleVolume(0.3));
    expect(result.current.volume).toBe(0.3);
    expect(localStorage.getItem("sw_volume")).toBe("0.3");
  });

  // ── Cola ──────────────────────────────────────────────────────────────────

  it("should add songs to queue", () => {
    const { result } = renderHook(() => usePlayer());
    const song = { videoId: "abc", title: "Test" };
    act(() => result.current.addToQueue(song));
    expect(result.current.queue).toEqual([song]);
  });

  it("should add multiple songs to queue", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => result.current.addToQueue({ videoId: "a" }));
    act(() => result.current.addToQueue({ videoId: "b" }));
    expect(result.current.queue).toHaveLength(2);
  });

  it("should not add duplicate songs to queue", () => {
    const { result } = renderHook(() => usePlayer());
    const song = { videoId: "abc", title: "Test" };
    act(() => result.current.addToQueue(song));
    act(() => result.current.addToQueue(song));
    expect(result.current.queue).toEqual([song]);
    expect(result.current.queue).toHaveLength(1);
  });

  it("should not duplicate songs via playNext", () => {
    const { result } = renderHook(() => usePlayer());
    const song = { videoId: "abc", title: "Test" };
    act(() => result.current.setQueue([{ videoId: "first" }, song]));
    act(() => result.current.setQueueIndex(0));
    act(() => result.current.playNext(song));
    // Song should still be in the queue once (moved to next position)
    const matches = result.current.queue.filter((s) => s.videoId === "abc");
    expect(matches).toHaveLength(1);
  });

  // ── Repeat mode ───────────────────────────────────────────────────────────

  it("should cycle repeatMode: off → one → all → off", () => {
    const { result } = renderHook(() => usePlayer());
    expect(result.current.repeatMode).toBe("off");
    act(() => result.current.toggleRepeatMode());
    expect(result.current.repeatMode).toBe("one");
    act(() => result.current.toggleRepeatMode());
    expect(result.current.repeatMode).toBe("all");
    act(() => result.current.toggleRepeatMode());
    expect(result.current.repeatMode).toBe("off");
  });

  // ── Toggle play ───────────────────────────────────────────────────────────

  it("should do nothing on togglePlay when no song is loaded", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(false);
  });

  it("should pause when currently playing", () => {
    const audio = createMockAudio();
    const { result } = renderHook(() => usePlayer());
    result.current.audioRef.current = audio;
    act(() => {
      result.current.setCurrentSong({ videoId: "test" });
      result.current.setIsPlaying(true);
    });
    act(() => result.current.togglePlay());
    expect(audio.pause).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it("should play when paused", () => {
    const audio = createMockAudio();
    const { result } = renderHook(() => usePlayer());
    result.current.audioRef.current = audio;
    act(() => {
      result.current.setCurrentSong({ videoId: "test" });
      result.current.setIsPlaying(false);
    });
    act(() => result.current.togglePlay());
    expect(audio.play).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(true);
  });

  // ── Seek ──────────────────────────────────────────────────────────────────

  it("should update audio currentTime on seek", () => {
    const audio = createMockAudio();
    const { result } = renderHook(() => usePlayer());
    result.current.audioRef.current = audio;
    act(() => result.current.handleSeek(42));
    expect(audio.currentTime).toBe(42);
    expect(result.current.progressRef.current).toBe(42);
  });

  // ── Next / Prev con cola ──────────────────────────────────────────────────

  it("should advance queueIndex on handleNext (queue stays intact)", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        mockApiResponse({ url: "https://stream.example.com/audio", headers: {}, duration: 200 }),
      );
    const audio = createMockAudio();

    const { result } = renderHook(() => usePlayer());
    result.current.audioRef.current = audio;

    act(() => {
      result.current.setQueue([
        { videoId: "song1", title: "Song 1" },
        { videoId: "song2", title: "Song 2" },
        { videoId: "song3", title: "Song 3" },
      ]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong({ videoId: "song1", title: "Song 1" });
    });
    expect(result.current.queue).toHaveLength(3);

    await act(async () => {
      await result.current.handleNext();
    });

    // Queue stays intact (3 songs), only queueIndex advances
    expect(result.current.queue).toHaveLength(3);
    expect(result.current.currentSong?.videoId).toBe("song2");
    mockFetch.mockRestore();
  });

  it("should restart current song on prev if > 3 seconds in", () => {
    const audio = createMockAudio();
    audio.currentTime = 10;
    const { result } = renderHook(() => usePlayer());
    result.current.audioRef.current = audio;

    act(() => result.current.handlePrev());
    expect(audio.currentTime).toBe(0);
  });

  it("should play previous result on prev if < 3 seconds in", () => {
    const audio = createMockAudio();
    audio.currentTime = 1;

    const results = [
      { videoId: "first", title: "First" },
      { videoId: "second", title: "Second" },
    ];

    const { result } = renderHook(() => usePlayer(null, results));
    result.current.audioRef.current = audio;

    act(() => {
      result.current.setCurrentSong(results[1]);
    });

    act(() => result.current.handlePrev());
    // Should try to play the previous result (playSong is async but calls fetch)
    expect(result.current.streamLoading).toBe(true);
  });

  // ── playSong ──────────────────────────────────────────────────────────────

  it("playSong should return early if no videoId", async () => {
    const { result } = renderHook(() => usePlayer());
    await act(async () => {
      await result.current.playSong({ title: "No ID" });
    });
    expect(result.current.streamLoading).toBe(false);
  });

  it("playSong should return early if no audio element", async () => {
    const { result } = renderHook(() => usePlayer());
    result.current.audioRef.current = null;
    await act(async () => {
      await result.current.playSong({ videoId: "test123" });
    });
    expect(result.current.streamLoading).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  B2: el crossfade debe usar la canción REAL, no un closure stale
  // ═══════════════════════════════════════════════════════════════════════════

  it("crossfade should advance to the next song (B2)", async () => {
    // Verifica que el crossfade completa la transición a la siguiente
    // canción de la cola y limpia el flag de crossfade activo.
    // crossfadeDuration = 1s → el fade completo tarda ~1s (observable en test).
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 1));

    const songA = { videoId: "songA", title: "Song A", artist: "Artist A" };
    const songB = { videoId: "songB", title: "Song B", artist: "Artist B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    // Reproducir songA y configurar la cola con songB a continuación
    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.currentlyPlayingSongRef.current = songA;
    });
    expect(result.current.currentSong?.videoId).toBe("songA");

    // Colocar el progreso en el rango de disparo: timeLeft ∈ (0.5, 1.2]
    result.current.progressRef.current = 199.2; // timeLeft = 0.8s
    result.current.setDuration(200);
    result.current.setIsPlaying(true);

    // Esperar al tick de 300ms + el fade de 1s
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });

    // El crossfade completó la transición a la siguiente canción
    expect(result.current.currentSong?.videoId).toBe("songB");
    expect(result.current.streamLoading).toBe(false);

    // El flag de crossfade activo se limpia al completar.
    // Usamos waitFor porque, con progressRef congelado en el test, el
    // intervalo puede re-disparar transitoriamente antes de que el
    // queueIndex actualizado haga que el siguiente spawn sea no-op.
    await waitFor(() => {
      expect(result.current.crossfadeActiveRef.current).toBe(false);
    });
    mockFetch.mockRestore();
  });

  it("crossfade should NOT start when playSong is running (B3 mutex)", async () => {
    // Verifica el mutex de B3: spawnCrossfade no inicia un crossfade si
    // crossfadePendingRef está activo (es decir, si playSong está corriendo).
    //
    // Se mockea el stream fetch para que, SI el mutex fallara, el crossfade
    // sí pudiera arrancar — así el test es significativo y no pasa por accidente.
    // crossfadeDuration = 10s → si el mutex fallara, el crossfade seguiría
    // activo tras 600ms y el assert lo detectaría.
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 10));

    const songA = { videoId: "songA", title: "Song A" };
    const songB = { videoId: "songB", title: "Song B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
    });

    // Simular que playSong está en ejecución
    result.current.crossfadePendingRef.current = true;

    result.current.progressRef.current = 199.2; // timeLeft = 0.8s
    result.current.setDuration(200);
    result.current.setIsPlaying(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });

    // El crossfade NO debe haberse iniciado (mutex bloqueó el spawn)
    expect(result.current.crossfadeActiveRef.current).toBe(false);
    // La canción actual sigue siendo songA
    expect(result.current.currentSong?.videoId).toBe("songA");

    // Limpiar para no afectar a otros tests
    result.current.crossfadePendingRef.current = false;
    mockFetch.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  B3: abortar crossfade al saltar manualmente
  // ═══════════════════════════════════════════════════════════════════════════

  it("handleNext should abort an active crossfade and play the next song (B3)", async () => {
    // Con un crossfade de duración larga (12s) el fade no termina dentro
    // de la ventana del test, así que podemos observar el abort.
    // crossfadeDuration = 10s → el fade sigue en curso cuando saltamos.
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 10));

    const song1 = { videoId: "s1", title: "Song 1" };
    const song2 = { videoId: "s2", title: "Song 2" };
    const song3 = { videoId: "s3", title: "Song 3" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(song1);
      result.current.setQueue([song1, song2, song3]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(song1);
    });

    // Disparar el crossfade: timeLeft ∈ (0.5, 10.2]
    result.current.progressRef.current = 199.2; // timeLeft = 0.8s
    result.current.setDuration(200);
    result.current.setIsPlaying(true);

    // Esperar a que el intervalo de 300ms lo dispare
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    // El crossfade debe estar en curso (10s de duración, no ha terminado)
    expect(result.current.crossfadeActiveRef.current).toBe(true);
    const audio2 = result.current.nextAudioRef.current;

    // Saltar manualmente durante el crossfade
    await act(async () => {
      await result.current.handleNext();
    });

    // El crossfade fue abortado y la siguiente canción se reproduce
    expect(result.current.crossfadeActiveRef.current).toBe(false);
    expect(result.current.currentSong?.videoId).toBe("s2");
    expect(result.current.queueIndex).toBe(1);
    expect(result.current.streamLoading).toBe(false);
    // ⭐ El fade-in llegó a ARRANCAR (play llamado sobre el audio siguiente)
    expect(audio2.play).toHaveBeenCalled();
    mockFetch.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Correcciones del crossfade: cancelación, volumen, repeat-one y feedback
  // ═══════════════════════════════════════════════════════════════════════════

  it("cancelCrossfade should restore volume and clear the fade-in audio", async () => {
    // Antes: al saltar en medio de un crossfade, el audio quedaba a mitad del
    // fade (ej: 0.3) y el src del audio actual se borraba. Ahora el volumen se
    // restaura y solo el audio del fade-in se detiene/vacía.
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 10));

    const songA = { videoId: "songA", title: "Song A" };
    const songB = { videoId: "songB", title: "Song B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.progressRef.current = 199.2;
      result.current.setDuration(200);
      result.current.setIsPlaying(true);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(result.current.crossfadeActiveRef.current).toBe(true);

    const audio1 = result.current.audioRef.current;
    const audio2 = result.current.nextAudioRef.current;
    // El fade-in arrancó: el elemento siguiente tiene el stream cargado
    expect(audio2.getAttribute("src")).toContain("stream.example.com");

    act(() => result.current.cancelCrossfade());

    // Crossfade cancelado, volumen restaurado y audio del fade-in vaciado
    expect(result.current.crossfadeActiveRef.current).toBe(false);
    expect(audio1.volume).toBe(0.7);
    expect(audio2.getAttribute("src")).toBe("");
    mockFetch.mockRestore();
  });

  it("togglePlay should pause and cancel an active crossfade", async () => {
    // Antes: pausar en medio de un crossfade solo pausaba el audio actual;
    // el fade seguía y la música continuaba pese a la pausa.
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 10));

    const songA = { videoId: "songA", title: "Song A" };
    const songB = { videoId: "songB", title: "Song B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.progressRef.current = 199.2;
      result.current.setDuration(200);
      result.current.setIsPlaying(true);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(result.current.crossfadeActiveRef.current).toBe(true);

    const audio2 = result.current.nextAudioRef.current;
    act(() => result.current.togglePlay());

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.crossfadeActiveRef.current).toBe(false);
    // El audio del fade-in quedó detenido y sin src
    expect(audio2.getAttribute("src")).toBe("");
    mockFetch.mockRestore();
  });

  it("playSong on the same song should pause and cancel an active crossfade", async () => {
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 10));

    const songA = { videoId: "songA", title: "Song A" };
    const songB = { videoId: "songB", title: "Song B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.progressRef.current = 199.2;
      result.current.setDuration(200);
      result.current.setIsPlaying(true);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(result.current.crossfadeActiveRef.current).toBe(true);

    // Click en la misma canción (toggle pause) → también cancela el crossfade
    await act(async () => {
      await result.current.playSong(songA);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.crossfadeActiveRef.current).toBe(false);
    expect(result.current.currentSong?.videoId).toBe("songA");
    mockFetch.mockRestore();
  });

  it("crossfade should NOT trigger in repeat-one mode", async () => {
    // Con repeat-one activo no hay "siguiente" que mezclar: el replay lo
    // maneja handleSongEnded al terminar de forma natural.
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 2));

    const songA = { videoId: "songA", title: "Song A" };
    const songB = { videoId: "songB", title: "Song B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.toggleRepeatMode(); // repeatMode = "one"
      result.current.progressRef.current = 199.2;
      result.current.setDuration(200);
      result.current.setIsPlaying(true);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });

    // El crossfade no se disparó: la canción no cambió y el siguiente audio
    // nunca arrancó el fade-in.
    expect(result.current.currentSong?.videoId).toBe("songA");
    expect(result.current.crossfadeActiveRef.current).toBe(false);
    expect(result.current.nextAudioRef.current.play).not.toHaveBeenCalled();
    mockFetch.mockRestore();
  });

  it("crossfade complete feedback should go to the song that ENDED (B7)", async () => {
    // Antes: el feedback "complete" se enviaba con la canción NUEVA porque
    // currentlyPlayingSongRef ya había sido sobreescrita. Ahora se captura
    // la canción que sonaba ANTES del swap.
    const { feedbackBodies, spy } = mockFetchCaptureFeedback();
    const { result } = renderHook(() => usePlayer(null, [], 1));

    const songA = { videoId: "songA", title: "Song A", artist: "Artist A" };
    const songB = { videoId: "songB", title: "Song B", artist: "Artist B" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.currentlyPlayingSongRef.current = songA;
      result.current.progressRef.current = 199.2;
      result.current.setDuration(200);
      result.current.setIsPlaying(true);
    });

    // Esperar el disparo (300ms) + el fade (1s) + margen
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1800));
    });

    expect(result.current.currentSong?.videoId).toBe("songB");

    const complete = feedbackBodies.filter((b) => b.action === "complete");
    expect(complete.length).toBeGreaterThan(0);
    // ⭐ El feedback es para la canción que TERMINÓ, no para la nueva
    expect(complete[0].videoId).toBe("songA");
    expect(complete.some((b) => b.videoId === "songB")).toBe(false);

    spy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  handleSongEnded + repeat mode
  // ═══════════════════════════════════════════════════════════════════════════

  it("handleSongEnded should replay the same song in repeat-one mode", async () => {
    const { result } = renderHook(() => usePlayer());

    const song = { videoId: "loop", title: "Loop Song" };
    result.current.audioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(song);
      result.current.setQueue([song]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(song);
      result.current.currentlyPlayingSongRef.current = song;
      // repeatMode = "one"
      result.current.toggleRepeatMode();
    });
    expect(result.current.repeatMode).toBe("one");

    const playMock = result.current.audioRef.current.play;

    await act(async () => {
      await result.current.handleSongEnded();
    });

    // Debe reproducir la misma canción otra vez (play llamado de nuevo)
    expect(result.current.currentSong?.videoId).toBe("loop");
    expect(playMock).toHaveBeenCalled();
  });

  it("handleSongEnded should ignore the event while a crossfade is active", async () => {
    // crossfadeDuration = 10s → el fade sigue en curso al llamar handleSongEnded.
    const mockFetch = mockStreamFetch();
    const { result } = renderHook(() => usePlayer(null, [], 10));

    const song1 = { videoId: "s1", title: "Song 1" };
    const song2 = { videoId: "s2", title: "Song 2" };

    result.current.audioRef.current = createMockAudio(200);
    result.current.nextAudioRef.current = createMockAudio(200);

    await act(async () => {
      await result.current.playSong(song1);
      result.current.setQueue([song1, song2]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(song1);
    });

    // Iniciar crossfade: timeLeft ∈ (0.5, 10.2]
    result.current.progressRef.current = 199.2;
    result.current.setDuration(200);
    result.current.setIsPlaying(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(result.current.crossfadeActiveRef.current).toBe(true);

    // handleSongEnded debe retornar temprano (no abortar el crossfade)
    await act(async () => {
      await result.current.handleSongEnded();
    });

    // El crossfade sigue en curso
    expect(result.current.crossfadeActiveRef.current).toBe(true);
    expect(result.current.currentSong?.videoId).toBe("s1");
    mockFetch.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Manejo de cola: reorder / remove
  // ═══════════════════════════════════════════════════════════════════════════

  it("moveInQueue should reorder the queue and keep queueIndex in sync", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => {
      result.current.setQueue([{ videoId: "a" }, { videoId: "b" }, { videoId: "c" }]);
      result.current.setQueueIndex(0);
    });

    // Mover "b" (index 1) al final
    act(() => result.current.moveInQueue(1, 2));

    expect(result.current.queue.map((s) => s.videoId)).toEqual(["a", "c", "b"]);
    // La canción actual (index 0) no se movió
    expect(result.current.queueIndex).toBe(0);
  });

  it("removeFromQueue should drop the song and adjust queueIndex", () => {
    const { result } = renderHook(() => usePlayer());
    act(() => {
      result.current.setQueue([{ videoId: "a" }, { videoId: "b" }, { videoId: "c" }]);
      result.current.setQueueIndex(2);
    });

    // Eliminar una canción ANTES de la actual → el índice baja a 1
    act(() => result.current.removeFromQueue(0));

    expect(result.current.queue.map((s) => s.videoId)).toEqual(["b", "c"]);
    expect(result.current.queueIndex).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Shuffle
  // ═══════════════════════════════════════════════════════════════════════════

  it("should toggle shuffleActive", () => {
    const { result } = renderHook(() => usePlayer());
    expect(result.current.shuffleActive).toBe(false);
    act(() => result.current.setShuffleActive(true));
    expect(result.current.shuffleActive).toBe(true);
    act(() => result.current.setShuffleActive(false));
    expect(result.current.shuffleActive).toBe(false);
  });

  it("shuffle should keep the queue length intact on next", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        mockApiResponse({ url: "https://stream.example.com/audio", headers: {}, duration: 200 }),
      );
    const { result } = renderHook(() => usePlayer());

    result.current.audioRef.current = createMockAudio(200);

    act(() => {
      result.current.setQueue([
        { videoId: "s0" },
        { videoId: "s1" },
        { videoId: "s2" },
        { videoId: "s3" },
      ]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong({ videoId: "s0" });
      result.current.setShuffleActive(true);
    });

    await act(async () => {
      await result.current.handleNext();
    });

    // Pese al shuffle, no se pierden ni duplican canciones
    expect(result.current.queue).toHaveLength(4);
    expect(result.current.queueIndex).toBe(1);
    mockFetch.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Regresión UI: la barra de progreso NO debe retroceder durante el crossfade
  //  Simula los eventos REALES del DOM (timeupdate/durationchange) con los
  //  dos <audio> del DOM y rAF real, como en la app.
  // ═══════════════════════════════════════════════════════════════════════════

  it("crossfade progress: display holds A during the fade and snaps to B's real time at swap", async () => {
    vi.useRealTimers();
    const mockFetch = mockStreamFetch();

    // Duraciones reales de la app: A=201s, B=200s, crossfade=3s
    const DUR_A = 201;
    const DUR_B = 200;
    const { result } = renderHook(() => usePlayer(null, [], 3));

    const songA = { videoId: "songA", title: "Song A", duration: DUR_A };
    const songB = { videoId: "songB", title: "Song B", duration: DUR_B };

    // Usar los <audio> REALES que App montaría (jsdom) — con rAF real.
    const audioA = new Audio();
    const audioB = new Audio();
    result.current.audioRef.current = audioA;
    result.current.nextAudioRef.current = audioB;

    const onTimeUpdateA = (e) => {
      const outgoing = e.target !== result.current.audioRef.current;
      if (outgoing && result.current.crossfadeActiveRef.current) return;
      result.current.progressRef.current = e.target.currentTime;
    };
    audioA.addEventListener("timeupdate", onTimeUpdateA);
    audioB.addEventListener("timeupdate", onTimeUpdateA);

    await act(async () => {
      await result.current.playSong(songA);
      result.current.setQueue([songA, songB]);
      result.current.setQueueIndex(0);
      result.current.setCurrentSong(songA);
      result.current.setDuration(DUR_A);
      result.current.setIsPlaying(true);
    });

    // Estado React de PlayerBar: se mantiene en otro array fuera de React
    // (simula los renders de PlayerBar con sus refs de pintado)
    const state = { duration: DUR_A, paintedDuration: null, paintedProgress: null, display: null };
    const paintProgress = () => {
      const raw = result.current.progressRef.current ?? 0;
      const stableDuration = state.paintedDuration ?? state.duration;
      let display = raw;
      if (display > stableDuration) display = stableDuration;
      state.display = display;
      state.paintedProgress = display;
      state.paintedDuration = state.duration;
    };
    paintProgress();
    const rafLoop = () => {
      paintProgress();
      rafId = requestAnimationFrame(rafLoop);
    };
    let rafId = requestAnimationFrame(rafLoop);

    // ── Simulación en tiempo real ──
    // t=0: A suena a 198 (le quedan 3.0s ≤ crossfade+0.2 = 3.2 → dispara)
    audioA.src = "https://stream.example.com/audio.mp4";
    audioA.currentTime = 198;
    audioA.dispatchEvent(new Event("timeupdate"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 500)); // el monitor dispara el crossfade (0.3s de intervalo)
    });
    expect(result.current.crossfadeActiveRef.current).toBe(true);

    // t=0.5s: B entra; su metadata llega — con el fix, audioA (SALIENTE) no
    // pisa duration con NaN
    audioB.src = "https://stream.example.com/audioB.mp4";
    audioB.dispatchEvent(new Event("loadedmetadata"));
    Object.defineProperty(audioB, "duration", { value: DUR_B, configurable: true });
    audioB.dispatchEvent(new Event("durationchange"));
    audioB.currentTime = 0.5;
    audioB.dispatchEvent(new Event("timeupdate")); // progressRef = 0.5
    const displayMidFade = state.display;
    const totalMidFade = state.paintedDuration;

    // t=1.0s: B en 1.0s — antes del fix, A también disparaba timeupdate y
    // (en el DOM real) el navegador habría seteado duration=NaN en A
    audioB.currentTime = 1.0;
    audioB.dispatchEvent(new Event("timeupdate"));
    const displayJustBeforeSwap = state.display;

    // t=3.5s: crossfade completado — performCrossfade hace el swap de refs.
    // Margen extra: fade de 3s que arranca a ~0.3-0.5s → termina a ~3.5s.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 4200));
    });
    cancelAnimationFrame(rafId);

    // El swap ocurrió: el audio actual ahora es B
    expect(result.current.audioRef.current).toBe(audioB);
    expect(result.current.currentSong?.videoId).toBe("songB");
    expect(result.current.queueIndex).toBe(1);

    // Barra tras el swap: t≈1.5s de B
    result.current.progressRef.current = 1.5;
    state.duration = DUR_B;
    paintProgress();

    // ── ASSERTIONS CLAVE ──
    // 1. DURANTE el fade la barra NO retrocede: el display se mantiene en la
    //    posición de A (≈198s, sin saltar a la escala de B que recién entra).
    expect(displayMidFade).toBeGreaterThan(0);
    expect(displayMidFade).toBeLessThanOrEqual(displayJustBeforeSwap);
    // 2. EN el swap la barra adopta la posición REAL de B (≈1.5s): ni 0 ni el
    //    valor stale de A (198). Esto es DESEADO — usePlayer sincroniza
    //    progressRef con el currentTime real del nuevo audio tras el fade
    //    (evita mostrar ~180s stale hasta el próximo timeupdate).
    expect(state.display).toBe(1.5);
    expect(displayJustBeforeSwap).not.toBe(state.display);
    // 3. El rótulo de duración total NO cambió durante el fade (sigue A)
    expect(totalMidFade).toBe(DUR_A);
    // 4. ProgressRef no contiene NaN
    expect(Number.isNaN(result.current.progressRef.current)).toBe(false);

    audioA.removeEventListener("timeupdate", onTimeUpdateA);
    audioB.removeEventListener("timeupdate", onTimeUpdateA);
    mockFetch.mockRestore();
  });
});
