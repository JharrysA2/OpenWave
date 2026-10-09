import { useEffect, useRef } from "react";
import { getCoverSources } from "../utils/thumbnails";

/**
 * useMediaSession — la tarjeta de medios de la taskbar de Windows.
 *
 * Al pasar el ratón por el botón de OpenWave en la taskbar, Windows muestra
 * una tarjeta con vista previa + controles de transporte. Esa tarjeta lee el
 * SYSTEM MEDIA TRANSPORT CONTROLS (SMTC) de la sesión de medios activa:
 *
 *  - Los controles ya aparecen sin hacer nada: WebView2/Chromium registra la
 *    sesión al reproducir audio.
 *  - Lo que no reenvía por su cuenta son los METADATOS (título, artista,
 *    portada), así que la tarjeta se quedaba con el título de la ventana
 *    («OpenWave») y sin carátula.
 *
 * El puente es la Media Session API: al publicar `navigator.mediaSession.
 * metadata` Chromium la vuelca al SMTC y Windows pinta en la tarjeta el
 * nombre de la canción y su portada. Aquí también se cablean las acciones
 * del sistema (play/pause/prev/next/seekto…) al reproductor de la app y se
 * sincronizan `playbackState` y `positionState`.
 *
 * Todo con feature-detection + try/catch: jsdom no implementa la Media
 * Session (los tests la simulan) y un WebView2 sin una parte concreta de la
 * API no debe romper la reproducción.
 */

/** Segundos por defecto de seekbackward/seekforward si el SO no manda offset. */
const SEEK_STEP = 10;

/** Posición actual en segundos del `<audio>` primario (0 si aún no existe). */
function audioPosition(audioRef) {
  const a = audioRef && audioRef.current;
  return a && Number.isFinite(a.currentTime) ? Math.max(0, a.currentTime) : 0;
}

export function useMediaSession({
  currentSong,
  isPlaying,
  duration,
  togglePlay,
  handleNext,
  handlePrev,
  handleSeek,
  audioRef,
}) {
  // Los manejadores del sistema se registran UNA vez y leen siempre los
  // callbacks más recientes por ref: así no se re-registran en cada render
  // (Chromium reemplaza el handler y avisa por consola en cada montaje).
  const latest = useRef({});
  latest.current = {
    isPlaying,
    duration,
    togglePlay,
    handleNext,
    handlePrev,
    handleSeek,
    audioRef,
  };

  // ── Metadatos: la canción actual → SMTC ──────────────────────────────────
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === "undefined") return undefined;

    if (!currentSong) {
      ms.metadata = null;
      return undefined;
    }

    try {
      const { allSrcs } = getCoverSources({
        thumbnails: currentSong.thumbnails,
        src: currentSong.thumbnail || currentSong.src,
      });
      const artwork = allSrcs.length
        ? [{ src: allSrcs[0], sizes: "512x512", type: "image/jpeg" }]
        : [];
      ms.metadata = new MediaMetadata({
        title: currentSong.title || "",
        artist: currentSong.artist || "",
        album: currentSong.album || currentSong.albumTitle || "",
        artwork,
      });
    } catch {
      // Metadata inválida: mejor la tarjeta anterior que una rota.
    }

    return () => {
      // Al cambiar de canción o desmontar: sin metadatos huérfanos.
      const cur = navigator.mediaSession;
      if (cur) cur.metadata = null;
    };
  }, [currentSong]);

  // ── Estado de reproducción (play/pausa en la tarjeta) ────────────────────
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.playbackState = isPlaying ? "playing" : "paused";
    } catch {
      // WebView2 sin playbackState: lo pinta el SO con lo que haya.
    }
  }, [isPlaying]);

  // ── Acciones del sistema → reproductor de la app ─────────────────────────
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || typeof ms.setActionHandler !== "function") return undefined;

    const guarded = (fn, ...args) => {
      try {
        fn(...args);
      } catch {
        // Acción llegada con la app en un estado transitorio (stream cargando):
        // que el usuario reintente, no que reviente el handler del SO.
      }
    };

    const handlers = {
      play: () => {
        const l = latest.current;
        if (!l.isPlaying) guarded(l.togglePlay);
      },
      pause: () => {
        const l = latest.current;
        if (l.isPlaying) guarded(l.togglePlay);
      },
      stop: () => {
        const l = latest.current;
        if (l.isPlaying) guarded(l.togglePlay);
      },
      previoustrack: () => guarded(latest.current.handlePrev),
      nexttrack: () => guarded(latest.current.handleNext),
      seekto: (e) => {
        if (e && Number.isFinite(e.seekTime)) guarded(latest.current.handleSeek, e.seekTime);
      },
      seekbackward: (e) => {
        const l = latest.current;
        const step = (e && Number.isFinite(e.seekOffset) && e.seekOffset) || SEEK_STEP;
        guarded(l.handleSeek, Math.max(0, audioPosition(l.audioRef) - step));
      },
      seekforward: (e) => {
        const l = latest.current;
        const step = (e && Number.isFinite(e.seekOffset) && e.seekOffset) || SEEK_STEP;
        guarded(l.handleSeek, audioPosition(l.audioRef) + step);
      },
    };

    for (const action of Object.keys(handlers)) {
      try {
        ms.setActionHandler(action, handlers[action]);
      } catch {
        // Acción no soportada por este motor (p. ej. seekto antiguo): seguimos
        // con el resto — Chromium lanza NotSupportedError por acción.
      }
    }

    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // Ya no soportada al desmontar: nada que limpiar.
        }
      }
    };
  }, []);

  // ── Línea de tiempo (posición/duración para el SO) ───────────────────────
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || typeof ms.setPositionState !== "function") return undefined;
    const audio = audioRef && audioRef.current;
    if (!audio || typeof audio.addEventListener !== "function") return undefined;

    let lastSync = 0;
    const sync = () => {
      const now = Date.now();
      if (now - lastSync < 1000) return; // timeupdate llega 4×/s: máx. 1/s basta
      lastSync = now;
      const l = latest.current;
      const a = l.audioRef && l.audioRef.current;
      const dur =
        a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(l.duration) || 0;
      if (!dur || !Number.isFinite(dur)) return;
      const rate = a && Number.isFinite(a.playbackRate) && a.playbackRate > 0 ? a.playbackRate : 1;
      try {
        ms.setPositionState({
          duration: dur,
          position: Math.min(audioPosition(l.audioRef), dur),
          playbackRate: rate,
        });
      } catch {
        // Estado inconsistente (seek a mitad de carga): el siguiente sincroniza.
      }
    };

    const events = ["timeupdate", "play", "pause", "seeked", "loadedmetadata"];
    for (const ev of events) audio.addEventListener(ev, sync);
    sync();

    return () => {
      for (const ev of events) audio.removeEventListener(ev, sync);
    };
    // Se reengancha al cambiar de canción/estado por si el `<audio>` se recreó.
  }, [audioRef, currentSong, isPlaying, duration]);
}
