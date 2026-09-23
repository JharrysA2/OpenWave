import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "../utils/api";
import { withHDThumbnails } from "../utils/thumbnails";

// ═══════════════════════════════════════════════════════════════════════════════
//  Module-level caches — Rule: js-cache-storage
//  Evita leer localStorage en cada render. Se cachea una vez al cargar el módulo.
// ═══════════════════════════════════════════════════════════════════════════════

const SW_QUEUE_KEY = "sw_queue";
const SW_VOLUME_KEY = "sw_volume";

/** Cache de localStorage — se lee una vez, se reutiliza en todos los renders */
let _cachedQueue = null;
let _cachedVolume = null;

function loadPersistedQueue() {
  if (_cachedQueue !== null) return _cachedQueue;
  try {
    const raw = localStorage.getItem(SW_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _cachedQueue = { queue: parsed.queue || [], queueIndex: parsed.queueIndex ?? -1 };
      return _cachedQueue;
    }
  } catch {}
  _cachedQueue = { queue: [], queueIndex: -1 };
  return _cachedQueue;
}

function loadPersistedVolume() {
  if (_cachedVolume !== null) return _cachedVolume;
  try {
    const v = localStorage.getItem(SW_VOLUME_KEY);
    _cachedVolume = v ? Number(v) : 0.7;
  } catch {
    _cachedVolume = 0.7;
  }
  return _cachedVolume;
}

/** Invalidar cache de volumen (llamar después de escribir) */
function invalidateVolumeCache() {
  _cachedVolume = null;
}

// rAF con fallback (por si el entorno no lo provee, ej: algunos runners de test)
const scheduleFrame =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame.bind(globalThis)
    : (cb) => setTimeout(() => cb(performance.now()), 16);

// ═══════════════════════════════════════════════════════════════════════════════
//  Pure helpers — fuera del hook para evitar re-creación en cada render
//  Rule: rerender-memo — funciones puras no necesitan estar dentro del hook
// ═══════════════════════════════════════════════════════════════════════════════

/** Poblar cola desde resultados de búsqueda. Retorna índice de la canción actual. */
function populateQueueFromResults(song, searchResults, setQueueFn) {
  if (!searchResults || searchResults.length <= 1) return -1;
  const idx = searchResults.findIndex((s) => s?.videoId === song?.videoId);
  if (idx >= 0) {
    const nextSongs = searchResults.slice(idx, idx + 16);
    if (nextSongs.length > 0) {
      setQueueFn(nextSongs);
      return 0;
    }
  }
  return -1;
}

export function usePlayer(toast, results = [], initialCrossfade = 0) {
  const [currentSong, setCurrentSong] = useState(null);
  const [queue, setQueue] = useState(() => loadPersistedQueue().queue);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(loadPersistedVolume);
  const [crossfadeDuration, setCrossfadeDuration] = useState(initialCrossfade);
  const [shuffleActive, setShuffleActive] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off"); // "off" | "one" | "all"
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [queueIndex, setQueueIndex] = useState(() => loadPersistedQueue().queueIndex);

  // ── Persistir cola en localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(SW_QUEUE_KEY, JSON.stringify({ queue, queueIndex }));
    } catch {}
  }, [queue, queueIndex]);

  const audioRef = useRef(null);
  const nextAudioRef = useRef(null);
  const progressRef = useRef(0);
  const loggedSongRef = useRef(null);
  const currentlyPlayingSongRef = useRef(null);
  const isSwappedRef = useRef(false);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const queueIndexRef = useRef(queueIndex);
  queueIndexRef.current = queueIndex;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const fetchSongIdRef = useRef(null); // Para ignorar respuestas API de canciones anteriores

  // ── Pre-cache: stream URLs, lyrics, thumbnails de las siguientes canciones ──
  const streamCacheRef = useRef({});
  const lyricsCacheRef = useRef({});
  const thumbnailCacheRef = useRef({}); // thumbnails HD por videoId
  const proxyRetryRef = useRef(false); // true durante la ventana de reintento proxy
  const crossfadeActiveRef = useRef(false); // true durante crossfade activo
  const crossfadeIdRef = useRef(0); // cada crossfade tiene un ID único (para invalidar)
  const crossfadePendingRef = useRef(false); // true mientras playSong está ejecutándose (B3)
  const crossfadeStartedAtRef = useRef(0); // timestamp cuando el crossfade empezó (para debug)
  const preloadedImgsRef = useRef([]); // acumula img elements del pre-cache para limpieza (P5)
  const volumeRef = useRef(volume); // volumen actual para el fade loop (evita stale closures)
  volumeRef.current = volume;
  const handleNextRef = useRef(null); // red de seguridad: avanzar si el crossfade falla tras "ended"

  // ── normalizeThumbnails: Asegura que un song tenga thumbnails[] HD ─────────
  //    Si el song viene de history/downloads sin thumbnails[], genera las
  //    resoluciones HD desde la URL única y cachea el resultado.
  const normalizeThumbnails = useCallback((song) => {
    if (!song?.videoId) return song;

    // Si ya tiene thumbnails[] con al menos 2 entradas, usar tal cual
    if (song.thumbnails && Array.isArray(song.thumbnails) && song.thumbnails.length >= 2) {
      // Cachear por si otro song igual aparece sin thumbs
      if (!thumbnailCacheRef.current[song.videoId]) {
        thumbnailCacheRef.current[song.videoId] = song.thumbnails;
      }
      return song;
    }

    // Verificar cache primero
    const cached = thumbnailCacheRef.current[song.videoId];
    if (cached) {
      return { ...song, thumbnails: cached, thumbnail: cached[cached.length - 1].url };
    }

    // Siempre generar desde src URL o videoId — lógica compartida en utils/thumbnails
    const normalized = withHDThumbnails(song);
    if (normalized.thumbnails) {
      thumbnailCacheRef.current[song.videoId] = normalized.thumbnails;
    }
    return normalized;
  }, []);

  // ── performCrossfade: Spotify-style simultaneous fade ────────────────────
  //    Monitorea el progreso y cuando currentTime >= duration - crossfadeDuration,
  //    fade-out del audio actual (audioRef) mientras fade-in del siguiente (nextAudioRef).
  //    Usa crossfadeIdRef para detectar si el usuario cambió de canción durante el fade.
  //
  //    ⭐ CORRECCIÓN B2: NO usar `currentSong` del closure (puede ser stale).
  //    Leer siempre `currentlyPlayingSongRef.current` para enviar el feedback
  //    correcto de la canción que REALMENTE estaba sonando.
  const performCrossfade = useCallback(
    async (cfId) => {
      // Encontrar la siguiente canción en la cola
      const currentQ = queueRef.current;
      const currentIdx = queueIndexRef.current;

      let nextSong = null;
      if (currentQ.length > 0 && currentIdx >= 0 && currentIdx < currentQ.length - 1) {
        nextSong = currentQ[currentIdx + 1];
      }
      if (!nextSong || !nextSong.videoId) {
        crossfadeActiveRef.current = false;
        return;
      }

      // Obtener stream URL
      let streamUrl = null;
      if (nextSong.downloaded) {
        // Descargada: usar el MP3 local del backend (funciona offline)
        streamUrl = `${api.base}/stream/${nextSong.videoId}`;
      } else {
        const cached = streamCacheRef.current[nextSong.videoId];
        if (cached?.url) {
          streamUrl = cached.url;
          delete streamCacheRef.current[nextSong.videoId]; // consumir cache
        } else {
          try {
            const d = await api.get(`/stream-url/${nextSong.videoId}`);
            streamUrl = d?.url;
          } catch {}
        }
      }
      // ⭐ Red de seguridad (failSafely): si el crossfade falla por sí solo —
      //    sin abort del usuario — y la canción actual ya terminó mientras
      //    esperábamos el stream, nadie volverá a disparar onEnded → avanzar
      //    manualmente para evitar "dead air" (silencio eterno). Envía también
      //    el feedback "complete" pendiente de esa canción.
      const failSafely = (audio) => {
        crossfadeActiveRef.current = false;
        crossfadeStartedAtRef.current = 0;
        if (!audio?.ended) return;
        const finishedSong = currentlyPlayingSongRef.current;
        if (finishedSong?.videoId) {
          api
            .post("/queue/feedback", {
              videoId: finishedSong.videoId,
              action: "complete",
              artist: finishedSong.artist || "",
              title: finishedSong.title || "",
            })
            .catch(() => {});
        }
        handleNextRef.current?.();
      };

      // Verificar que este crossfade sigue siendo válido: si el usuario saltó,
      // pausó o buscó durante el fetch, cancelCrossfade ya restauró todo → salir.
      if (cfId !== crossfadeIdRef.current) return;

      const currentAudio = audioRef.current;
      const nextAudio = nextAudioRef.current;
      if (!streamUrl || !currentAudio || !nextAudio) {
        failSafely(currentAudio);
        return;
      }

      // ⭐ Marcar el inicio del crossfade para que el progress-monitoring
      //    sepa que el crossfade está en ejecución (útil para tests)
      crossfadeStartedAtRef.current = Date.now();

      // Normalizar nextSong para tener thumbnails HD
      const normalizedNext = normalizeThumbnails(nextSong);

      // Configurar nextAudio
      nextAudio.src = streamUrl;
      nextAudio.currentTime = 0;
      nextAudio.volume = 0;
      try {
        await nextAudio.play();
      } catch (e) {
        console.warn("[Crossfade] nextAudio.play() failed:", e?.message);
        failSafely(currentAudio);
        return;
      }

      // ⭐ Capturar la canción que SUENA antes de sobreescribir
      //    currentlyPlayingSongRef: el feedback "complete" debe ir para esta.
      const finishedSong = currentlyPlayingSongRef.current;

      // ⭐ Crossfade simultáneo: fade-OUT en currentAudio, fade-IN en nextAudio.
      //    Equal-power (seno/coseno) = potencia constante, igual que el CrossFade
      //    de Tone.js y los faders de los players nativos. En vez de pasos fijos
      //    (setTimeout), usamos requestAnimationFrame con progreso por TIEMPO
      //    REAL: curva suave a 60fps para fades de 1s o de 12s, y tolerante a
      //    jank del hilo principal.
      const fadeMs = crossfadeDuration * 1000;
      const fadeStart = performance.now();

      await new Promise((resolve) => {
        const step = () => {
          // ⭐ Abortado (skip/pausa/seek → cancelCrossfade bumpió el id):
          //    restaurar volumen y salir; cancelCrossfade ya hizo el resto.
          if (cfId !== crossfadeIdRef.current) {
            nextAudio.pause();
            nextAudio.src = "";
            currentAudio.volume = volumeRef.current;
            resolve();
            return;
          }
          const progress = Math.min((performance.now() - fadeStart) / fadeMs, 1);
          // ⭐ Equal-power: coseno (1→0) + seno (0→1) = potencia constante
          const fadeOut = Math.cos((progress * Math.PI) / 2);
          const fadeIn = Math.sin((progress * Math.PI) / 2);
          currentAudio.volume = Math.max(0, volumeRef.current * fadeOut);
          nextAudio.volume = volumeRef.current * fadeIn;
          if (progress < 1) {
            scheduleFrame(step);
          } else {
            resolve();
          }
        };
        scheduleFrame(step);
      });

      // Fade abortado → cancelCrossfade ya restauró el estado → salir.
      if (cfId !== crossfadeIdRef.current) return;

      // ⭐ Crossfade completado: snap final a volúmenes exactos (evita valores
      //    residuales del último frame del fade)
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio.volume = volumeRef.current; // reset para uso futuro
      nextAudio.volume = volumeRef.current;

      // Swappear refs para que el onEnded (en el PRIMER audio element)
      // ahora apunte al elemento que reproduce la NUEVA canción
      audioRef.current = nextAudio;
      nextAudioRef.current = currentAudio;

      // ⭐ Actualizar estado: currentSong, queueIndex, duration
      setCurrentSong(normalizedNext);
      currentlyPlayingSongRef.current = normalizedNext;
      // ⭐ Duración de la nueva canción: preferir la metadata de la cola; si no
      //    la tiene, usar la duración REAL del elemento (su metadata ya cargó
      //    durante el fade). Necesario junto al guard de durationchange en App:
      //    ese guard ignora los eventos del audio ENTRANTE durante el fade para
      //    que la barra no salte a la escala de la siguiente canción, así que
      //    este swap es el punto donde la UI adopta la nueva duración.
      const nextDuration = nextSong.duration > 0 ? nextSong.duration : nextAudio?.duration || 0;
      if (nextDuration > 0) {
        setDuration(nextDuration);
      }
      // ⚠️  Sincronizar progressRef con el currentTime REAL del nuevo audio.
      //    nextAudio ha estado reproduciéndose DURANTE el crossfade (~5s).
      //    Usar su currentTime actual evita que la barra muestre un valor
      //    stale del audio anterior (~180s) durante los ~250ms hasta el
      //    próximo onTimeUpdate.
      if (nextAudio && typeof nextAudio.currentTime === "number" && nextAudio.currentTime > 0) {
        progressRef.current = nextAudio.currentTime;
      }
      setIsPlaying(true);

      if (currentIdx >= 0 && currentIdx < currentQ.length - 1) {
        setQueueIndex((prev) => prev + 1);
      }

      crossfadeActiveRef.current = false;
      crossfadeStartedAtRef.current = 0;

      // Enviar feedback de completado para la canción anterior.
      // ⭐ CORRECCIÓN B2: usar currentlyPlayingSongRef (la canción REAL que sonaba)
      //    en vez de currentSong (closure que puede ser stale si el usuario cambió rápido).
      // ⭐ CORRECCIÓN B7: usar finishedSong — capturada ANTES de sobreescribir
      //    currentlyPlayingSongRef. La versión anterior leía la ref DESPUÉS del
      //    swap y enviaba el "complete" de la canción NUEVA en vez de la que
      //    realmente terminó.
      const songThatWasPlaying = finishedSong;
      if (songThatWasPlaying?.videoId) {
        api
          .post("/queue/feedback", {
            videoId: songThatWasPlaying.videoId,
            action: "complete",
            artist: songThatWasPlaying.artist || "",
            title: songThatWasPlaying.title || "",
          })
          .catch(() => {});
      }

      // Log 30s si aplica
      if (normalizedNext?.videoId) {
        setTimeout(() => {
          const s30 = currentlyPlayingSongRef.current;
          if (s30 && loggedSongRef.current !== s30.videoId) {
            loggedSongRef.current = s30.videoId;
            api.logHistory(s30, () => {}).catch(() => {});
          }
        }, 30000);
      }
    },
    [crossfadeDuration, normalizeThumbnails],
  );

  // ── Reproducción (SIN crossfade inline — el crossfade se maneja vía progress monitoring) ──
  //
  //  ⭐ CORRECCIÓN B3: evitar race condition entre playSong y performCrossfade.
  //    spawnCrossfade es el único lugar que puede iniciar un crossfade. playSong
  //    llama a cancelCrossfade() ANTES de reproducir, pero hay un race window: si
  //    el progress-monitoring dispara performCrossfade al mismo tiempo que playSong
  //    está en ejecución, el crossfade puede empezar después de que playSong ya
  //    limpió los refs. La solución: un mutex flag (crossfadePendingRef) que hace
  //    que performCrossfade se aborte si detecta que playSong está active.

  const playSong = useCallback(
    async (song, startFrom = 0, fromQueue = false, initialQueue = null) => {
      if (!song || !song.videoId) return;

      // ⭐ If same song is already playing, toggle pause/resume instead of restart
      if (currentSong?.videoId === song.videoId && !initialQueue) {
        const audio = audioRef.current;
        if (audio) {
          if (isPlaying) {
            // Si había un crossfade en curso, cancelarlo también aquí
            cancelCrossfade();
            audio.pause();
            setIsPlaying(false);
          } else {
            audio.play().catch(() => {});
            setIsPlaying(true);
          }
        }
        return;
      }

      // ⭐ CORRECCIÓN B3: cancelar crossfade activo ANTES de reproducir.
      //    crossfadePendingRef se setea aquí para que si el progress-monitoring
      //    intenta iniciar un crossfade durante este playSong, se aborte.
      cancelCrossfade();

      // Marca de que playSong está en ejecución — usada por performCrossfade
      // para evitar iniciar un crossfade mientras playSong está en medio de
      // configurar el audio (race window entre cancelCrossfade y setSrc).
      crossfadePendingRef.current = true;

      // Limpiar flag de retry proxy para cada canción nueva
      proxyRetryRef.current = false;

      // ═══ NORMALIZAR THUMBNAILS antes de actualizar UI ═══
      const normalizedSong = normalizeThumbnails(song);

      // ═══ ACTUALIZAR UI INMEDIATAMENTE antes de empezar la reproducción ═══
      setCurrentSong(normalizedSong);
      currentlyPlayingSongRef.current = normalizedSong;
      setIsPlaying(true);
      setDuration(normalizedSong.duration || 0);
      progressRef.current = 0;
      setStreamLoading(true);

      // ═══ MANEJO DE COLA ═══════════════════════════════════════════════════
      //    initialQueue != null: usar cola proporcionada (ej: canciones del álbum)
      //    fromQueue = true: la canción viene de la cola → NO tocar la cola
      //    fromQueue = false: canción externa → rebuildear cola (siempre, aunque ya esté)

      if (initialQueue && Array.isArray(initialQueue) && initialQueue.length > 0) {
        // Cola proporcionada (ej: desde AlbumView con las canciones del álbum)
        console.info(`[Queue] Using provided initialQueue with ${initialQueue.length} tracks`);
        setQueue(initialQueue);
        setQueueIndex(0);
        fetchSongIdRef.current = song.videoId;
      } else if (!fromQueue) {
        // Canción externa — siempre rebuildear cola (incluso si ya estaba en la cola)
        const qIdx = populateQueueFromResults(song, resultsRef.current, setQueue);
        setQueueIndex(qIdx);

        // ── Poblar cola DESDE API DE RELACIONADOS (async, ignorar si stale) ──
        fetchSongIdRef.current = song.videoId;
        api
          .get(`/queue/${song.videoId}?limit=15&artist=${encodeURIComponent(song.artist || "")}`)
          .then((data) => {
            // Si el usuario ya cambió a otra canción, ignorar esta respuesta
            if (fetchSongIdRef.current !== song.videoId) return;
            if (data?.tracks?.length > 0) {
              const filtered = data.tracks
                .filter((t) => t.videoId && t.videoId !== song.videoId)
                .slice(0, 10);
              if (filtered.length > 0) {
                console.info(`[Queue] Auto-populated from API: ${filtered.length} tracks`);
                // La canción actual va PRIMERA (index 0), seguidas de las relacionadas
                setQueue([normalizedSong, ...filtered]);
                setQueueIndex(0);
              }
            }
          })
          .catch((err) => {
            console.warn("[Queue] API fetch failed, using search results fallback:", err?.message);
          });
      } else {
        // fromQueue=true: la canción viene de la cola — NO tocar la cola,
        // pero SÍ actualizar fetchSongIdRef para ignorar API responses
        // de la canción anterior que pudieran llegar después.
        fetchSongIdRef.current = song.videoId;
      }

      // ═══ REPRODUCCIÓN DE AUDIO ═════════════════════════════════════
      //    Verificar cache primero (pre-cargado por el efecto de pre-cache)
      //    Crossfade SOLO se activa cuando handleSongEnded lo habilita
      //    (crossfadeEnabledRef). Así el fade-in solo ocurre al final
      //    natural de la canción y NO en saltos manuales (handleNext/Prev).
      let usedProxy = false;
      // Canción descargada: primer intento con el MP3 local del backend
      // (GET /stream/{id}, disponible sin internet). Si el archivo no existe,
      // play() rechaza y el bucle reintenta con streaming online.
      const tryLocalFirst = !!song.downloaded;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const useLocal = tryLocalFirst && attempt === 0;
          let d = null;
          if (!useLocal) {
            d = streamCacheRef.current[song.videoId];
            if (d) {
              delete streamCacheRef.current[song.videoId]; // consumir cache
            } else if (attempt === 0) {
              d = await api.get(`/stream-url/${song.videoId}`);
            }
            if (!d?.url && attempt === 0) throw new Error("No stream URL");
          }

          // Si intento 1 y estamos en modo retry, limpiar flag
          if (attempt === 1 && proxyRetryRef.current) {
            proxyRetryRef.current = false;
          }

          // Actualizar duración con la del stream si es más precisa
          if (d?.duration) setDuration(song.duration || d.duration);

          const currentAudio = audioRef.current;
          if (!currentAudio) {
            crossfadePendingRef.current = false;
            return;
          }
          const srcUrl = useLocal
            ? `${api.base}/stream/${song.videoId}`
            : attempt === 0 && !usedProxy
              ? d.url
              : `${api.base}/stream/play/${song.videoId}`;
          currentAudio.src = srcUrl;
          currentAudio.currentTime = startFrom;
          currentAudio.volume = volume;
          await currentAudio.play();
          currentAudio.volume = volume;

          // Si llegamos aquí, la reproducción fue exitosa
          break;
        } catch (e) {
          if (attempt === 0) {
            // Primer intento falló → reintentar con proxy
            console.warn("Direct playback failed, retrying with proxy:", e?.message);
            usedProxy = true;
            // Activar supresión de errores durante la ventana de retry
            proxyRetryRef.current = true;
            setTimeout(() => {
              proxyRetryRef.current = false;
            }, 2000);
          } else {
            // Segundo intento también falló
            console.error("Play error (both attempts):", e);
            toast?.("Error al reproducir", "error");
            setIsPlaying(false);
          }
        } finally {
          setStreamLoading(false);
        }
      }

      // ⭐ FIN del playSong — desmarcar pending. crossfadePendingRef se
      //    usa en performCrossfade para evitar iniciar un crossfade mientras
      //    playSong está configurando el audio (race window B3).
      crossfadePendingRef.current = false;
    },
    [toast, volume, normalizeThumbnails, isPlaying, currentSong],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (isPlaying) {
      // ⭐ Pausar en medio de un crossfade CANCELA el fade (como hace howler.js
      //    con sus fades al pausar/parar): si no, el fade loop seguiría y
      //    nextAudio seguiría sonando después de la pausa — la música
      //    continuaría pese a que el usuario pausó.
      cancelCrossfade();
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, currentSong]);

  // ── sendFeedback: enviar señal al backend para entrenar recomendaciones ────
  //    ⚠️  Debe estar ANTES de performCrossfade que lo referencia.
  const sendFeedback = useCallback((action, song) => {
    if (!song?.videoId) return;
    api
      .post("/queue/feedback", {
        videoId: song.videoId,
        action,
        artist: song.artist || "",
        title: song.title || "",
      })
      .catch(() => {});
  }, []);

  // ── spawnCrossfade: iniciar un crossfade si es válido ────────────────────────
  //    ⭐ CORRECCIÓN B3: esta función es el UNICO lugar que inicia un crossfade.
  //    Reemplaza el code inline en el progress-monitoring effect.
  //    Rechaza iniciar crossfade si:
  //      - playSong está ejecutándose (crossfadePendingRef=true) → evita race
  //      - ya hay un crossfade activo
  //      - el cfId es stale
  const spawnCrossfade = useCallback(
    (cfId) => {
      // Si playSong está en ejecución, no iniciar crossfade (race window B3)
      if (crossfadePendingRef.current) {
        return false;
      }
      if (cfId !== crossfadeIdRef.current) {
        return false;
      }
      if (crossfadeActiveRef.current) {
        return false;
      }
      crossfadeActiveRef.current = true;
      crossfadeStartedAtRef.current = Date.now();
      performCrossfade(cfId);
      return true;
    },
    [performCrossfade],
  );

  // ── cancelCrossfade: cancela un crossfade en curso (skip manual, pausa, seek) ──
  //    A diferencia de la versión anterior (abortCrossfade):
  //    - NO borra el src del audio actual → pausa/seek/handlePrev conservan la
  //      canción y su posición; playSong pondrá otro src cuando toque.
  //    - ⭐ Restaura el volumen del audio actual: antes quedaba a mitad del
  //      fade (ej: 0.3) si el usuario saltaba de canción.
  //    - El fade loop (rAF) detecta el bump de crossfadeIdRef y se detiene solo.
  function cancelCrossfade() {
    if (!crossfadeActiveRef.current) return;
    crossfadeActiveRef.current = false;
    crossfadeIdRef.current += 1; // invalida el cfId → el fade aborta en el próximo frame
    crossfadeStartedAtRef.current = 0;
    const nextAudio = nextAudioRef.current;
    if (nextAudio) {
      nextAudio.pause();
      nextAudio.src = "";
      nextAudio.volume = 0;
    }
    const currentAudio = audioRef.current;
    if (currentAudio) {
      currentAudio.volume = volumeRef.current;
    }
  }

  const handleNext = useCallback(async () => {
    // ⭐ Cancelar crossfade activo si el usuario salta manualmente
    cancelCrossfade();

    // Detectar skip rápido (< 5s) para entrenar recomendaciones
    // ⭐ CORRECCIÓN B2: usar currentlyPlayingSongRef para el feedback,
    //    no currentSong del closure (que puede ser stale si cambió rápido).
    if (currentlyPlayingSongRef.current?.videoId && progressRef.current < 5) {
      sendFeedback("skip", currentlyPlayingSongRef.current);
    }

    if (queue.length > 0 && queueIndex >= 0 && queueIndex < queue.length - 1) {
      let targetSong = queue[queueIndex + 1];

      if (shuffleActive && queue.length > 1) {
        // SHUFFLE: elegir canción aleatoria de las siguientes
        const upcomingCount = queue.length - queueIndex - 1;
        if (upcomingCount > 1) {
          const randOffset = 1 + Math.floor(Math.random() * (upcomingCount - 1));
          const targetIdx = queueIndex + 1 + randOffset;
          targetSong = queue[targetIdx];
          // Intercambiar la siguiente con la aleatoria
          setQueue((q) => {
            const newQ = [...q];
            [newQ[queueIndex + 1], newQ[targetIdx]] = [newQ[targetIdx], newQ[queueIndex + 1]];
            return newQ;
          });
        }
      }
      // Avanzar el índice y reproducir la canción correcta
      setQueueIndex((i) => i + 1);
      await playSong(targetSong, 0, true);
    } else if (queue.length > 0 && queueIndex === -1) {
      // Primer "siguiente" desde cola de API (canción actual NO está en cola)
      setQueueIndex(0);
      await playSong(queue[0], 0, true);
    } else if (queue.length > 0 && queueIndex >= 0 && queueIndex === queue.length - 1) {
      // Última canción de la cola
      if (repeatMode === "all") {
        // REPEAT ALL: volver al inicio de la cola
        setQueueIndex(0);
        await playSong(queue[0], 0, true);
      }
    } else if (results.length > 0) {
      const idx = results.findIndex((s) => s.videoId === currentSong?.videoId);
      if (idx >= 0 && idx < results.length - 1) {
        await playSong(results[idx + 1], 0, false);
      }
    }
  }, [queue, queueIndex, shuffleActive, repeatMode, results, currentSong, playSong, sendFeedback]); // ═══════════════════════════════════════════════════════════════════════════
  // ⭐ Mantener handleNextRef fresco: performCrossfade lo usa como red de
  //    seguridad (failSafely) cuando el crossfade falla después de que la
  //    canción ya terminó — evita "dead air".
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  //  PROGRESS MONITORING: Disparar crossfade ANTES de que termine la canción
  // ═══════════════════════════════════════════════════════════════════════════
  //    Cada ~300ms, verifica si faltan menos de crossfadeDuration segundos.
  //    Si es así, inicia el crossfade simultáneo (fade-OUT + fade-IN).
  //    Solo se activa si crossfadeDuration > 0, isPlaying, y no hay otro
  //    crossfade activo.

  useEffect(() => {
    if (crossfadeDuration <= 0 || !isPlaying || !currentSong?.videoId || duration <= 0) return;
    if (crossfadeActiveRef.current) return;

    // ⭐ repeat-one: no hay "siguiente" que mezclar — el replay lo maneja
    //    handleSongEnded. Cruzar al siguiente con repeat-one activo ignoraría
    //    la preferencia del usuario (Spotify tampoco mezcla en repeat-one).
    if (repeatMode === "one") return;

    // ⭐ Protección: si la canción apenas dura más que el crossfade, no mezclar
    if (duration <= crossfadeDuration + 1) return;

    const checkProgress = () => {
      if (crossfadeActiveRef.current) return;

      const currentTime = progressRef.current;
      if (currentTime <= 0 || duration <= 0) return;

      const timeLeft = duration - currentTime;
      // ⭐ Disparar cuando falten crossfadeDuration segundos (con 200ms de margen)
      if (timeLeft <= crossfadeDuration + 0.2 && timeLeft > 0.5) {
        const cfId = ++crossfadeIdRef.current;
        spawnCrossfade(cfId);
      }
    };

    const interval = setInterval(checkProgress, 300);
    return () => clearInterval(interval);
  }, [crossfadeDuration, isPlaying, currentSong?.videoId, duration, repeatMode, spawnCrossfade]);

  const handlePrev = useCallback(() => {
    // ⭐ Cancelar crossfade activo si el usuario retrocede manualmente.
    //    A diferencia de la versión anterior, el src del audio actual se
    //    conserva → "volver al inicio" (currentTime > 3s) vuelve a funcionar
    //    en medio de un crossfade.
    cancelCrossfade();

    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (queueIndex > 0) {
      // Volver a la canción anterior en la cola
      setQueueIndex((i) => i - 1);
      playSong(queue[queueIndex - 1], 0, true);
    } else if (results.length > 0) {
      const idx = results.findIndex((s) => s.videoId === currentSong?.videoId);
      if (idx > 0) playSong(results[idx - 1], 0, false);
    }
  }, [queue, queueIndex, results, currentSong, playSong]);

  const handleSeek = useCallback((time) => {
    // ⭐ Cancelar crossfade activo: si el usuario busca, cambió de intención
    //    (ej: volvió atrás) — el fade no debe completar el salto de canción.
    cancelCrossfade();
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      progressRef.current = time;
    }
  }, []);

  const handleVolume = useCallback((v) => {
    const vol = Math.max(0, Math.min(1, v));
    setVolume(vol);
    volumeRef.current = vol; // reflejar de inmediato (el fade loop lee la ref)
    const audio = audioRef.current;
    if (audio) audio.volume = vol;
    try {
      localStorage.setItem(SW_VOLUME_KEY, String(vol));
      invalidateVolumeCache();
    } catch {}
  }, []);

  // ── addToQueue: Añade al FINAL de la cola (previene duplicados) ───
  const addToQueue = useCallback((song) => {
    setQueue((q) => {
      if (q.some((s) => s.videoId === song.videoId)) return q; // ya existe
      return [...q, song];
    });
  }, []);

  // ── playNext: Inserta DESPUÉS de la canción actual (previene duplicados) ──
  //    Si la canción ya existe en la cola, la mueve a la nueva posición.
  //    Si no hay canción actual en la cola, al PRINCIPIO.
  //    Ajusta queueIndex si la canción eliminada estaba antes del índice actual.
  const playNext = useCallback((song) => {
    const idx = queueIndexRef.current;
    const currentQueue = queueRef.current;
    const existingIdx = currentQueue.findIndex((s) => s.videoId === song.videoId);

    setQueue((q) => {
      const newQ = q.filter((s) => s.videoId !== song.videoId);
      const insertAt = idx >= 0 ? Math.min(idx + 1, newQ.length) : 0;
      newQ.splice(insertAt, 0, song);
      return newQ;
    });

    // Si la canción eliminada estaba antes del índice actual, decrementar
    if (existingIdx >= 0 && existingIdx < idx) {
      setQueueIndex((prev) => Math.max(0, prev - 1));
    }
  }, []);

  // ── removeFromQueue: Eliminar canción en índice dado ───────────────────
  const removeFromQueue = useCallback((index) => {
    setQueue((q) => q.filter((_, i) => i !== index));
    setQueueIndex((prev) => {
      if (prev === -1) return -1;
      if (index < prev) return prev - 1;
      if (index === prev) return -1; // se eliminó la que se escuchaba
      return prev;
    });
  }, []);

  // ── moveUp: Mover canción hacia arriba en la cola ─────────────────────
  const moveUp = useCallback((index) => {
    if (index <= 0) return;
    setQueue((q) => {
      const newQ = [...q];
      [newQ[index - 1], newQ[index]] = [newQ[index], newQ[index - 1]];
      return newQ;
    });
    setQueueIndex((prev) => {
      if (prev === index) return index - 1;
      if (prev === index - 1) return index;
      return prev;
    });
  }, []);

  // ── moveDown: Mover canción hacia abajo en la cola ────────────────────
  const moveDown = useCallback((index) => {
    setQueue((q) => {
      if (index >= q.length - 1) return q;
      const newQ = [...q];
      [newQ[index], newQ[index + 1]] = [newQ[index + 1], newQ[index]];
      return newQ;
    });
    setQueueIndex((prev) => {
      if (prev === index) return index + 1;
      if (prev === index + 1) return index;
      return prev;
    });
  }, []);

  // ── moveInQueue: Mover canción de fromIndex a toIndex (drag & drop) ──
  const moveInQueue = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setQueue((q) => {
      const newQ = [...q];
      const [removed] = newQ.splice(fromIndex, 1);
      newQ.splice(toIndex, 0, removed);
      return newQ;
    });
    setQueueIndex((prev) => {
      if (prev === -1) return -1;
      if (prev === fromIndex) return toIndex;
      if (fromIndex < prev && toIndex >= prev) return prev - 1;
      if (fromIndex > prev && toIndex <= prev) return prev + 1;
      return prev;
    });
  }, []);

  // ── handleSongEnded: separado de handleNext para repeat-one ──────────────
  //    Cuando el audio termina NATURALMENTE, comprobamos repeatMode.
  //    - "one": reproducir la misma canción de nuevo
  //    - "all": handleNext (que se encarga del bucle)
  //    - "off": handleNext normal
  const handleSongEnded = useCallback(async () => {
    // ⭐ Si hay un crossfade activo, IGNORAR este onEnded.
    //    El audio actual está en medio de un crossfade simultáneo
    //    (performCrossfade está fadeando OUT este audio mientras
    //    fadea IN el siguiente). Si handleSongEnded se ejecuta,
    //    llama a handleNext → cancelCrossfade → playSong, que detiene
    //    el crossfade y arranca la siguiente canción a volumen completo
    //    de golpe, rompiendo la transición suave.
    if (crossfadeActiveRef.current) return;

    // ⭐ CORRECCIÓN B2: usar currentlyPlayingSongRef para el feedback,
    //    no currentSong del closure (que puede ser stale).
    const songThatWasPlaying = currentlyPlayingSongRef.current;
    if (songThatWasPlaying?.videoId) {
      sendFeedback("complete", songThatWasPlaying);
    }

    if (repeatMode === "one" && songThatWasPlaying?.videoId) {
      await playSong(songThatWasPlaying, 0, true);
      return;
    }
    // ⭐ El crossfade ya lo manejó el progress monitoring (performCrossfade)
    //    Si llegamos aquí es porque el crossfade NO estaba habilitado o no alcanzó
    //    handleNext se llama sin parámetro (false) porque el fade ya no va aquí
    await handleNext();
  }, [repeatMode, playSong, handleNext, sendFeedback]);

  // ── toggleRepeatMode: cicla off → one → all → off ──────────────────────
  const toggleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === "off") return "one";
      if (prev === "one") return "all";
      return "off";
    });
  }, []);

  // ── Pre-cache inteligente: solo 1 canción + debounce ──────────────
  //    Solo precargamos 1 canción en lugar de 3 para reducir llamadas API
  //    y asignaciones de memoria. Debounce de 500ms + requestIdleCallback.
  const preCacheTimeoutRef = useRef(null);

  useEffect(() => {
    const prevImgs = preloadedImgsRef.current;
    if (prevImgs) {
      prevImgs.forEach((img) => { img.src = ""; });
    }
    preloadedImgsRef.current = [];

    if (preCacheTimeoutRef.current) {
      clearTimeout(preCacheTimeoutRef.current);
    }

    let nextSong = null;
    if (queueIndex >= 0 && queueIndex < queue.length - 1) {
      nextSong = queue[queueIndex + 1];
    } else if (queue.length > 0 && queueIndex < 0) {
      nextSong = queue[0];
    }

    if (!nextSong || !nextSong.videoId) return;

    preCacheTimeoutRef.current = setTimeout(() => {
      preCacheTimeoutRef.current = null;
      const doPreCache = () => {
        if (!nextSong?.videoId) return;

        if (!streamCacheRef.current[nextSong.videoId] && !nextSong.downloaded) {
          api.get(`/stream-url/${nextSong.videoId}`)
            .then((d) => { if (d?.url) streamCacheRef.current[nextSong.videoId] = d; })
            .catch(() => {});
        }

        if (!lyricsCacheRef.current[nextSong.videoId]) {
          api.get(`/lyrics/${nextSong.videoId}?title=${encodeURIComponent(nextSong.title || "")}&artist=${encodeURIComponent(nextSong.artist || "")}`)
            .then((data) => { if (data?.lyrics) lyricsCacheRef.current[nextSong.videoId] = data; })
            .catch(() => {});
        }

        const normalized = normalizeThumbnails(nextSong);
        const thumbs = normalized.thumbnails || nextSong.thumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0));
          const largestThumb = sorted[0]?.url;
          if (largestThumb) {
            const imgLg = new Image();
            imgLg.fetchPriority = "high";
            imgLg.loading = "eager";
            imgLg.src = largestThumb;
            preloadedImgsRef.current.push(imgLg);
          }
        } else {
          const thumbUrl = nextSong.thumbnail || nextSong.thumbnails?.[0]?.url;
          if (thumbUrl) {
            const img = new Image();
            img.fetchPriority = "high";
            img.loading = "eager";
            img.src = thumbUrl;
            preloadedImgsRef.current.push(img);
          }
        }
      };

      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(doPreCache, { timeout: 1000 });
      } else {
        doPreCache();
      }
    }, 500);

    return () => {
      if (preCacheTimeoutRef.current) {
        clearTimeout(preCacheTimeoutRef.current);
        preCacheTimeoutRef.current = null;
      }
    };
  }, [queue, queueIndex, normalizeThumbnails]);

  // ── Sincronizar volumen con el elemento audio ──────────────────────────────

  // Volumen se sincroniza via handleVolume; no se necesita efecto extra

  return {
    currentSong,
    setCurrentSong,
    queue,
    setQueue,
    queueIndex,
    setQueueIndex,
    isPlaying,
    setIsPlaying,
    streamLoading,
    setStreamLoading,
    duration,
    setDuration,
    volume,
    crossfadeDuration,
    setCrossfadeDuration,
    shuffleActive,
    setShuffleActive,
    repeatMode,
    toggleRepeatMode,
    lyricsOpen,
    setLyricsOpen,
    audioRef,
    nextAudioRef,
    progressRef,
    loggedSongRef,
    currentlyPlayingSongRef,
    isSwappedRef,
    streamCacheRef,
    lyricsCacheRef,
    proxyRetryRef,
    crossfadeActiveRef,
    crossfadePendingRef,
    cancelCrossfade,
    sendFeedback,
    playSong,
    togglePlay,
    handleNext,
    handleSongEnded,
    handlePrev,
    handleSeek,
    handleVolume,
    addToQueue,
    playNext,
    removeFromQueue,
    moveUp,
    moveDown,
    moveInQueue,
  };
}
