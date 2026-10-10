import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";

// ── Importaciones del proyecto refactorizado ──────────────────────────────────
import { FONT } from "./constants";
import { api } from "./utils/api";
import { ANIMATIONS, GLASS } from "./utils/theme";
import { SettingsProvider } from "./contexts/SettingsContext";
import { PerformanceProvider } from "./contexts/PerformanceContext";
import { useSettings } from "./contexts/useSettings";
import { usePlayer } from "./hooks/usePlayer";
import { useDynamicTheme } from "./hooks/useDynamicTheme";
import { useSearch } from "./hooks/useSearch";
import { useLibrary } from "./hooks/useLibrary";
import { useToast } from "./hooks/useToast";
import { useSongOptions } from "./hooks/useSongOptions";
import { useEscBack } from "./hooks/useEscape";
import { useSavedEntities } from "./hooks/useSavedEntities";
import { useEntityOptions } from "./hooks/useEntityOptions";
import { useMediaSession } from "./hooks/useMediaSession";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TrackPickerModal } from "./components/TrackPickerModal";
import { SelectionModal } from "./components/SelectionModal";
import { PlayerBar } from "./components/PlayerBar";
import { CreatePlaylistModal } from "./components/CreatePlaylistModal";
import { Toasts } from "./components/Toast";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { BootScreen } from "./components/BootScreen";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { PlaylistPickerModal } from "./components/PlaylistPickerModal";
import { MainRouter } from "./components/MainRouter";
import { AudioElements } from "./components/AudioElements";
import { startHeartbeat, stopHeartbeat, subscribeReconnect } from "./utils/backendHealth";

// Letras: el panel + @dnd-kit (~182 kB) solo se cargan la primera vez que se
// abre (mismo patrón lazy que MainRouter). Memo además: con la ventana de
// letras abierta, los renders de App por volumen/play-pause no tocan el overlay.
const LyricsView = React.memo(
  lazy(() => import("./components/LyricsView").then((m) => ({ default: m.LyricsView }))),
);

// ═══════════════════════════════════════════════════════════════════════════════
//  AppInner — lógica principal de la aplicación
// ═══════════════════════════════════════════════════════════════════════════════

function AppInner() {
  const { settings, updateSetting } = useSettings();

  // ── Hooks personalizados ────────────────────────────────────────────────────
  const { toasts, show: toast } = useToast();
  const {
    query,
    results,
    searchArtists,
    searchAlbums,
    songsVisible,
    setSongsVisible,
    searchTab,
    setSearchTab,
    videoResults,
    videoLoading,
    videoError,
    videoErrorCode,
    searchError,
    searchLoading,
    searchInputRef,
    handleSearchChange,
    doSearch,
    doSearchVideos,
    setQuery,
  } = useSearch(settings.defaultSearchTab || "music");
  // Cambiar la pestaña por defecto en Ajustes → Contenido aplica en caliente:
  // searchTab vive en App durante toda la sesión, no en SearchView.
  useEffect(() => {
    setSearchTab(settings.defaultSearchTab || "music");
  }, [settings.defaultSearchTab, setSearchTab]);
  const {
    liked,
    setLiked,
    likedMeta,
    history,
    setHistory,
    downloads,
    setDownloads,
    playlists,
    toggleLike,
    mostPlayed,
    refreshPlaylists,
    status: libraryStatus,
    error: libraryError,
    refreshLibrary,
  } = useLibrary();

  // Ids de canciones descargadas — PlaylistView los usa para marcar
  // `downloaded: true` y reproducir desde el archivo local (sin conexión).
  const downloadedIds = useMemo(
    () => new Set((downloads || []).map((d) => d.videoId || d.video_id)),
    [downloads],
  );
  const player = usePlayer(
    toast,
    results,
    settings.crossfade || 0,
    settings.playbackQuality || "standard",
    settings.downloadQuality || "192",
    settings.queueRecommendations ?? false,
    settings.pauseHistory ?? false,
  );
  const {
    currentSong,
    queue,
    queueIndex,
    setQueueIndex,
    isPlaying,
    streamLoading,
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
    streamCacheRef,
    lyricsCacheRef,
    proxyRetryRef,
    sendFeedback,
    playSong,
    togglePlay,
    handleNext,
    handleSongEnded,
    handlePrev,
    handleSeek,
    handleVolume,
    playNext,
    removeFromQueue,
    moveUp,
    moveDown,
    moveInQueue,
  } = player;

  // ── Tarjeta de medios de la taskbar de Windows (SMTC) ────────────────────
  // Publica título/artista/portada de la canción actual (y no el «OpenWave»
  // genérico de la ventana) + cablea play/pausa/prev/next del SO al
  // reproductor. Todo con feature-detection: ver hooks/useMediaSession.js.
  useMediaSession({
    currentSong,
    isPlaying,
    duration,
    togglePlay,
    handleNext,
    handlePrev,
    handleSeek,
    audioRef,
  });

  // ── Navegación a detalle: Álbum / Artista ─────────────────────────────
  const [albumBrowseId, setAlbumBrowseId] = useState(null);
  const [artistBrowseId, setArtistBrowseId] = useState(null);
  const [prevTab, setPrevTab] = useState(null); // para volver atrás

  // Cierra las vistas de detalle (álbum/artista) al cambiar de pestaña/lista:
  // MainRouter las muestra con early-return, así que sin limpiar los ids la
  // vista de detalle "ganaría" sobre cualquier tab seleccionado en la sidebar.
  const closeDetailViews = useCallback(() => {
    setAlbumBrowseId(null);
    setArtistBrowseId(null);
  }, []);

  // ── Estado de UI ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(() => settings.defaultTab || "home");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // ── Temporizador de apagado (Ajustes → Reproductor y sonido) ──────────────
  // `sleep` = { at: timestamp (ms) en el que pausar, minutes: preset elegido };
  // null = inactivo. Vive aquí (no en la página de ajustes) para que siga
  // contando aunque el panel de ajustes se cierre o se cambie de sección.
  const [sleep, setSleep] = useState(null);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    if (!sleep) return undefined;
    const fire = () => {
      setSleep(null);
      if (isPlayingRef.current) togglePlay();
      toast("Temporizador: reproducción pausada", "info");
    };
    const remaining = sleep.at - Date.now();
    if (remaining <= 0) {
      fire();
      return undefined;
    }
    const id = setTimeout(fire, remaining);
    return () => clearTimeout(id);
  }, [sleep, togglePlay, toast]);

  // ── useCallback para evitar re-renders en Sidebar ────────────────────────────
  const onSelectPlaylist = useCallback(
    (pl) => {
      setSelectedPlaylist(pl);
      setTab("playlist");
      closeDetailViews();
      setShowSettingsPanel(false);
    },
    [setSelectedPlaylist, setTab, closeDetailViews],
  );

  const onOpenSettings = useCallback(() => setShowSettingsPanel((v) => !v), [setShowSettingsPanel]);

  const handleTabChange = useCallback(
    (t) => {
      // Click en la sección ya activa → volver a Inicio (así se "sale" de
      // Me gusta/Descargas pulsando su propia entrada en la sidebar). Desde
      // una vista de detalle, en cambio, se cierra y muestra su sección.
      const inDetail = !!albumBrowseId || !!artistBrowseId;
      setTab((prev) => (t !== "home" && !inDetail && prev === t ? "home" : t));
      closeDetailViews();
      setShowSettingsPanel(false);
    },
    [albumBrowseId, artistBrowseId, closeDetailViews],
  );

  const onCreatePlaylist = useCallback(
    () => setShowCreatePlaylistModal(true),
    [setShowCreatePlaylistModal],
  );

  // ── Playlist picker (desde el botón "Agregar a") ───────────────────────
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [playlistPickerSong, setPlaylistPickerSong] = useState(null);
  // Selección múltiple (pistas de un álbum desde EntityOptionsSheet)
  const [playlistPickerSongs, setPlaylistPickerSongs] = useState(null);

  // ── Track Picker ────────────────────────────────────────────────────────────
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [trackPickerPlaylist, _setTrackPickerPlaylist] = useState(null);
  const [trackPickerTracks, _setTrackPickerTracks] = useState([]);
  const [trackPickerLoading, _setTrackPickerLoading] = useState(false);

  // ── Selection Modal ─────────────────────────────────────────────────────────
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [selectionModalSongs, _setSelectionModalSongs] = useState([]);
  const [selectionModalMode, setSelectionModalMode] = useState(null);

  // ── Conexión con el backend ────────────────────────────────────────────────
  //    El heartbeat vive en utils/backendHealth (external store). Aquí solo lo
  //    arrancamos/paramos y reaccionamos a las reconexiones.
  useEffect(() => {
    startHeartbeat();
    return () => stopHeartbeat();
  }, []);

  useEffect(
    () =>
      subscribeReconnect(() => {
        // La caché pudo llenarse con respuestas inválidas mientras el backend
        // estaba caído (o quedar obsoleta): se limpia y se refresca la
        // biblioteca COMPLETA (playlists, descargas e historial). Sin toast:
        // el banner de conexión ya cubre la caída y basta con que desaparezca
        // al reconectar.
        api.clearCache();
        refreshLibrary();
      }),
    [refreshLibrary],
  );

  // ── Dynamic theme: color de portada + CSS vars (--neon, overlay) ──
  const { neonColor, bgStyle } = useDynamicTheme({
    settings,
    currentSong,
  });
  // ── Error handler compartido para ambos audio elements ─────────────────
  //    Suprime errores causados por crossfade cleanup (src="") y aborts.
  const handleAudioError = useCallback(
    (e) => {
      if (!e.target.error) return;
      const code = e.target.error.code;
      const msg = (e.target.error.message || "").toLowerCase();
      // Errores por abort (cambio rápido de canción) o crossfade (src vacío)
      if (code === 1) return; // MEDIA_ERR_ABORTED
      if (msg.includes("abort") || msg.includes("cancel")) return;
      // Silenciar errores cuando src está vacío (crossfade cleanup puso src="")
      if (!e.target.src || e.target.src === window.location.href) return;
      // Suprimir errores durante ventana de reintento proxy
      // (la URL directa de YouTube falla, pero el proxy del backend funciona)
      if (proxyRetryRef?.current) return;
      // No mostrar si el audio se está reproduciendo correctamente
      try {
        if (!e.target.paused && e.target.currentTime > 0) return;
      } catch {}
      // Errores de reproducción visibles (petición): mensaje flotante con
      // estilo liquid glass en blanco y negro (Toast pinta el variant "error").
      // useToast deduplica si el mismo fallo llega también de playSong.
      console.warn(`[audio] playback error (code=${code})`);
      toast("No se pudo reproducir la canción", "error");
    },
    [proxyRetryRef, toast],
  );

  // ── Wrapper de toggleLike que también envía feedback ───────────────────────

  const handleToggleLike = useCallback(
    (videoId, song) => {
      const wasLiked = liked.has(videoId);
      toggleLike(videoId, song);
      if (sendFeedback) {
        sendFeedback(wasLiked ? "unlike" : "like", song || { videoId });
      }
    },
    [liked, toggleLike, sendFeedback],
  );

  // ── Canciones que te gustan (de todas las fuentes) ──────────────────────────
  //    Ya no depende solo de la cola: incluye historial, descargas y los
  //    metadatos guardados al dar like (sw_liked_meta_v1) — así las canciones
  //    gustadas no desaparecen al cambiar de cola.

  const likedSongs = useMemo(() => {
    const byId = new Map();
    const add = (s) => {
      if (!s?.videoId || !liked.has(s.videoId)) return;
      const prev = byId.get(s.videoId);
      // El primero en entrar manda; los siguientes solo completan huecos
      byId.set(s.videoId, prev ? { ...s, ...prev } : s);
    };
    // Orden: metadatos de "me gusta" (orden en que se dieron) primero
    for (const [id, meta] of Object.entries(likedMeta || {})) add({ videoId: id, ...meta });
    for (const s of queue) add(s);
    for (const s of downloads) add(s);
    for (const s of history) add(s);
    if (currentSong) add(currentSong);
    for (const id of liked) if (!byId.has(id)) byId.set(id, { videoId: id });
    return [...byId.values()];
  }, [liked, likedMeta, queue, currentSong, history, downloads]);

  // ── Handlers de navegación a detalle ──────────────────────────────────────

  const goToAlbum = useCallback(
    (browseIdOrItem) => {
      const bid = typeof browseIdOrItem === "string" ? browseIdOrItem : browseIdOrItem?.browseId;
      if (!bid) return;
      setPrevTab(tab);
      setAlbumBrowseId(bid);
      setArtistBrowseId(null);
    },
    [tab],
  );

  const goToArtist = useCallback(
    (browseIdOrArtistName) => {
      if (!browseIdOrArtistName) return;
      // Si es un objeto con browseId, usarlo directamente
      if (typeof browseIdOrArtistName === "object" && browseIdOrArtistName?.browseId) {
        setPrevTab(tab);
        setArtistBrowseId(browseIdOrArtistName.browseId);
        setAlbumBrowseId(null);
        return;
      }
      setPrevTab(tab);
      setArtistBrowseId(browseIdOrArtistName);
      setAlbumBrowseId(null);
    },
    [tab],
  );

  /** Ir a álbum desde una canción (buscar browseId vía API) */
  const goToAlbumFromSong = useCallback(
    async (song) => {
      if (!song?.videoId) return;
      toast("Buscando álbum...", "info");
      try {
        const d = await api.get(`/song/album/${song.videoId}`);
        if (d?.browseId) {
          // Aterrizar en la pantalla del álbum DESDE CUALQUIER pantalla:
          // cierra ajustes y la pantalla de letras, que taparían la vista
          // de detalle (MainRouter renderiza ajustes por delante).
          setShowSettingsPanel(false);
          setLyricsOpen(false);
          setPrevTab(tab);
          setAlbumBrowseId(d.browseId);
          setArtistBrowseId(null);
        } else {
          toast("Álbum no encontrado", "info");
        }
      } catch {
        toast("Error al buscar álbum", "error");
      }
    },
    [tab, toast],
  );

  /** Ir a artista desde una canción (buscar browseId vía API) */
  const goToArtistFromSong = useCallback(
    async (song) => {
      if (!song?.artist || song.artist === "Desconocido") {
        toast("Artista no disponible", "info");
        return;
      }
      toast("Buscando artista...", "info");
      // Buscar el artista en search para obtener browseId
      try {
        const d = await api.get(`/search?q=${encodeURIComponent(song.artist)}&limit=3`);
        const artists = d?.artists || [];
        if (artists.length > 0 && artists[0].browseId) {
          // Igual que goToAlbumFromSong: navega aunque ajustes o las
          // letras estén abiertas por encima.
          setShowSettingsPanel(false);
          setLyricsOpen(false);
          setPrevTab(tab);
          setArtistBrowseId(artists[0].browseId);
          setAlbumBrowseId(null);
        } else {
          toast(`No se encontró el artista: ${song.artist}`, "info");
        }
      } catch {
        toast("Error al buscar artista", "error");
      }
    },
    [tab, toast],
  );

  const goBackFromDetail = useCallback(() => {
    setAlbumBrowseId(null);
    setArtistBrowseId(null);
    setTab(prevTab || "home");
  }, [prevTab]);

  // ── Opciones de canción (estado + hoja de opciones) ──────────────────────────
  //    Se declara tras los handlers de navegación, ya que la hoja los usa.

  const { openOptions, songOptionsSheet } = useSongOptions({
    liked,
    toggleLike,
    sendFeedback,
    playlists,
    playNext,
    playSong,
    setShuffleActive,
    setLiked,
    setDownloads,
    setPlaylistPickerOpen,
    setPlaylistPickerSong,
    goToAlbumFromSong,
    goToArtistFromSong,
    toast,
  });

  // ── Entidades guardadas (álbumes con ♥ y artistas que sigues) ──────────────

  const {
    likedAlbums,
    followedArtists,
    isAlbumLiked,
    isArtistFollowed,
    toggleAlbumLike,
    toggleFollow,
  } = useSavedEntities();

  // ── Opciones de álbum/artista (hoja compartida + descarga de álbum) ────────

  const { openEntityOptions, entityOptionsSheet, downloadAlbum, playAlbum, fetchAlbumTracks } =
    useEntityOptions({
      toast,
      isAlbumLiked,
      toggleAlbumLike,
      isArtistFollowed,
      toggleFollow,
      goToAlbum,
      goToArtist,
      playSong,
      setShuffleActive,
      setDownloads,
      playlists,
      setPlaylistPickerOpen,
      setPlaylistPickerSongs,
      downloadQuality: settings.downloadQuality,
    });

  // ── Navegación ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setTab(settings.defaultTab || "home");
    closeDetailViews();
  }, [settings.defaultTab, closeDetailViews]);

  // ── Búsqueda desde HomeView ────────────────────────────────────────────────
  //    Cuando el usuario presiona Enter en la barra de búsqueda de HomeView,
  //    navega automáticamente al tab de búsqueda con la query ejecutada.

  const handleHomeSearch = useCallback(
    (value) => {
      if (!value.trim()) return;
      setQuery(value);
      setTab("search");
      doSearch(value);
      doSearchVideos(value);
    },
    [setQuery, setTab, doSearch, doSearchVideos],
  );

  // ── Reintento de búsqueda (estado de error con código) ────────────────────
  const handleRetrySearch = useCallback(() => {
    if (!query.trim()) return;
    doSearch(query);
    doSearchVideos(query);
  }, [query, doSearch, doSearchVideos]);

  // ── Callbacks estables para MainRouter y PlayerBar ─────────────────────────
  //    Ambos son React.memo: con lambdas inline, CADA render de App
  //    (mousemove del slider de volumen, play/pause, toasts, abrir/cerrar
  //    letras…) re-renderizaba el árbol visible completo. Con identidades
  //    estables los memos sujetan de verdad y esos eventos solo actualizan
  //    la barra.

  const handleCloseSettings = useCallback(() => setShowSettingsPanel(false), []);

  const handleClearDownloads = useCallback(() => {
    api.del("/downloads/all").catch(() => toast("Error al limpiar descargas", "error"));
    setDownloads([]);
    toast("Descargas eliminadas", "info");
  }, [toast, setDownloads]);

  const handleClearHistory = useCallback(() => {
    api.del("/history/all").catch(() => toast("Error al limpiar historial", "error"));
    setHistory([]);
  }, [toast, setHistory]);

  const handleDownloadsCleared = useCallback(() => setDownloads([]), [setDownloads]);

  const handleDownloadsRemoved = useCallback(
    (videoIds) =>
      setDownloads((prev) =>
        (prev || []).filter((d) => !videoIds.includes(d.videoId || d.video_id)),
      ),
    [setDownloads],
  );

  const handleHistoryCleared = useCallback(() => setHistory([]), [setHistory]);

  const handleShowMore = useCallback(() => setSongsVisible((v) => v + 10), [setSongsVisible]);

  const handlePlaylistBack = useCallback(() => {
    setSelectedPlaylist(null);
    setTab("home");
  }, []);

  // ── ESC = atrás ─────────────────────────────────────────────────────────────
  //    Con cualquier overlay montado no se navega (lo cierra useEscClose si
  //    está en su pila); sin overlay, ESC «sale» de la vista actual: detalle
  //    de álbum/artista → la sección de la que vino, vista de playlist →
  //    Inicio, cualquier otra vista → Inicio. Desde Inicio no hay nada atrás.
  //    Ajustes se excluye aquí: su ESC (volver al menú / cerrar el panel) vive
  //    en el propio SettingsPanel vía useEscClose, para no cerrarlo por detrás
  //    de un modal interno.
  const handleEscBack = useCallback(() => {
    if (showSettingsPanel) return;
    if (albumBrowseId || artistBrowseId) {
      goBackFromDetail();
      return;
    }
    if (tab === "playlist") {
      handlePlaylistBack();
      return;
    }
    if (tab !== "home") setTab("home");
  }, [showSettingsPanel, albumBrowseId, artistBrowseId, goBackFromDetail, tab, handlePlaylistBack]);

  useEscBack(handleEscBack);

  // ── Barra lateral retráctil ────────────────────────────────────────────────
  // Visible u oculta según el ajuste persistido (por defecto visible).
  // Se alterna con el botón « de la cabecera, el botón » flotante, desde
  // Ajustes → Apariencia y con Ctrl+B. La app no usa contentEditable, así
  // que el atajo no choca con ningún "negrita" del sistema.
  const sidebarVisible = settings.sidebarVisible !== false;
  const toggleSidebar = useCallback(
    () => updateSetting("sidebarVisible", !sidebarVisible),
    [sidebarVisible, updateSetting],
  );

  useEffect(() => {
    const onCtrlB = (e) => {
      if (e.key?.toLowerCase() !== "b") return;
      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onCtrlB);
    return () => window.removeEventListener("keydown", onCtrlB);
  }, [toggleSidebar]);

  const handlePlaylistUpdated = useCallback(() => refreshPlaylists(), [refreshPlaylists]);

  const handleToggleLyrics = useCallback(() => setLyricsOpen((v) => !v), [setLyricsOpen]);

  const handleLyricsClose = useCallback(() => setLyricsOpen(false), [setLyricsOpen]);

  const handleOpenCurrentOptions = useCallback(
    () => currentSong && openOptions(currentSong),
    [currentSong, openOptions],
  );

  // ── Modo de reproducción ────────────────────────────────────────────────────

  const handlePlayModeToggle = useCallback(
    (mode) => {
      if (mode === "shuffle") setShuffleActive((v) => !v);
      if (mode === "repeat") toggleRepeatMode();
    },
    [setShuffleActive, toggleRepeatMode],
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  //  Renderizado principal
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: FONT,
        color: "#fff",
        ...bgStyle,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Aviso de desconexión con el backend ───────────────────────── */}
      <ConnectionBanner />

      {/* ── Pantalla de arranque: logo → primer health-check → lista ──── */}
      <BootScreen />

      {/* ── Custom Title Bar — glassmorphism ──── */}
      <TitleBar />

      {/* Sidebar + Main area — fills entire height below title bar */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* ── Sidebar — glassmorphism structural material ── */}
        <Sidebar
          tab={tab}
          accentColor={neonColor}
          likedCount={liked.size}
          playlists={playlists}
          selectedPlaylist={selectedPlaylist}
          onTabChange={handleTabChange}
          onSelectPlaylist={onSelectPlaylist}
          onOpenSettings={onOpenSettings}
          onCreatePlaylist={onCreatePlaylist}
          visible={sidebarVisible}
          onToggle={toggleSidebar}
        />

        {/* ── Mostrar barra lateral: botón » mientras esté oculta ── */}
        {!sidebarVisible && (
          <button
            data-testid="sidebar-show-btn"
            className="sidebar-show-btn"
            onClick={toggleSidebar}
            title="Mostrar barra lateral"
            aria-label="Mostrar barra lateral"
            style={{
              position: "absolute",
              left: "10px",
              top: "10px",
              zIndex: 6,
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              // Liquid Glass canónico de superficie flotante sobre contenido
              // en movimiento (mismo cristal que Toasts/popups): gradiente,
              // rim light, sombra flotante y backdrop blur(6px) sin saturate.
              // perf-blur-off / perf-solid / app-hidden / app-sleep lo apagan
              // solos; html.overlay-open lo apaga vía .sidebar-show-btn.
              ...GLASS.popup,
              color: "rgba(255,255,255,.75)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition:
                "background .15s cubic-bezier(.16,1,.3,1), color .15s cubic-bezier(.16,1,.3,1), transform .15s cubic-bezier(.16,1,.3,1)",
              ...ANIMATIONS.fadeIn(0),
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.9)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,.75)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.5 6 L15.5 12 L9.5 18" />
            </svg>
          </button>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div key={tab} style={{ height: "100%", ...ANIMATIONS.fadeIn(50) }}>
            <MainRouter
              showSettingsPanel={showSettingsPanel}
              onCloseSettings={handleCloseSettings}
              neonColor={neonColor}
              crossfadeDuration={crossfadeDuration}
              setCrossfadeDuration={setCrossfadeDuration}
              sleep={sleep}
              setSleep={setSleep}
              downloads={downloads}
              onClearDownloads={handleClearDownloads}
              onClearHistory={handleClearHistory}
              onDownloadsCleared={handleDownloadsCleared}
              onDownloadsRemoved={handleDownloadsRemoved}
              downloadedIds={downloadedIds}
              onHistoryCleared={handleHistoryCleared}
              liked={liked}
              history={history}
              playlists={playlists}
              onSelectPlaylist={onSelectPlaylist}
              toast={toast}
              albumBrowseId={albumBrowseId}
              artistBrowseId={artistBrowseId}
              goToArtist={goToArtist}
              goToAlbum={goToAlbum}
              goBackFromDetail={goBackFromDetail}
              tab={tab}
              currentSong={currentSong}
              isPlaying={isPlaying}
              playSong={playSong}
              toggleLike={handleToggleLike}
              openOptions={openOptions}
              historyItems={mostPlayed}
              libraryStatus={libraryStatus}
              libraryErrorCode={libraryError?.code}
              onRetryLibrary={refreshLibrary}
              onHomeSearch={handleHomeSearch}
              query={query}
              onQueryChange={handleSearchChange}
              searchTab={searchTab}
              onSearchTabChange={setSearchTab}
              results={results}
              searchArtists={searchArtists}
              searchAlbums={searchAlbums}
              songsVisible={songsVisible}
              onShowMore={handleShowMore}
              searchLoading={searchLoading}
              videoResults={videoResults}
              videoLoading={videoLoading}
              videoError={videoError}
              videoErrorCode={videoErrorCode}
              searchError={searchError}
              onRetrySearch={handleRetrySearch}
              searchInputRef={searchInputRef}
              likedSongs={likedSongs}
              selectedPlaylist={selectedPlaylist}
              onPlaylistBack={handlePlaylistBack}
              onPlaylistUpdated={handlePlaylistUpdated}
              refreshPlaylists={refreshPlaylists}
              likedAlbums={likedAlbums}
              followedArtists={followedArtists}
              isAlbumLiked={isAlbumLiked}
              toggleAlbumLike={toggleAlbumLike}
              isArtistFollowed={isArtistFollowed}
              toggleFollow={toggleFollow}
              openEntityOptions={openEntityOptions}
              playAlbum={playAlbum}
              downloadAlbum={downloadAlbum}
              fetchAlbumTracks={fetchAlbumTracks}
            />
          </div>
        </div>
      </div>

      {/* Audio elements */}
      <AudioElements
        audioRef={audioRef}
        nextAudioRef={nextAudioRef}
        progressRef={progressRef}
        loggedSongRef={loggedSongRef}
        currentlyPlayingSongRef={currentlyPlayingSongRef}
        setDuration={setDuration}
        handleSongEnded={handleSongEnded}
        handleAudioError={handleAudioError}
        pauseHistory={settings.pauseHistory ?? false}
        toast={toast}
      />

      {/* Toasts */}
      <Toasts toasts={toasts} />

      {/* Song Options Sheet */}
      {songOptionsSheet}

      {/* Entity Options Sheet (álbum / artista) */}
      {entityOptionsSheet}

      {/* Track Picker Modal */}
      <TrackPickerModal
        open={trackPickerOpen}
        playlist={trackPickerPlaylist}
        tracks={trackPickerTracks}
        loadingTracks={trackPickerLoading}
        onClose={() => setTrackPickerOpen(false)}
        onConfirm={(videoIds) => {
          if (trackPickerPlaylist) {
            // Build songs metadata for the backend
            const songsMeta = videoIds.map((vid) => {
              const s = trackPickerTracks.find((t) => t.videoId === vid);
              return s
                ? {
                    videoId: s.videoId,
                    title: s.title || "",
                    artist: s.artist || "",
                    thumbnail: s.thumbnail || "",
                    thumbnails: s.thumbnails || [],
                    duration: s.duration || 0,
                  }
                : null;
            });
            api
              .post(`/playlists/${trackPickerPlaylist.id}/songs`, { videoIds, songs: songsMeta })
              .then(async () => {
                toast("Canciones agregadas", "success");
                setTrackPickerOpen(false);
                await refreshPlaylists();
              })
              .catch(() => toast("Error al agregar", "error"));
          }
        }}
      />

      {/* Playlist Picker Modal — mejorado con tokens de tema y animación */}
      <PlaylistPickerModal
        open={playlistPickerOpen}
        playlists={playlists}
        song={playlistPickerSong}
        songs={playlistPickerSongs}
        toast={toast}
        refreshPlaylists={refreshPlaylists}
        onClose={() => {
          setPlaylistPickerOpen(false);
          setPlaylistPickerSong(null);
          setPlaylistPickerSongs(null);
        }}
      />

      {/* Selection Modal */}
      <SelectionModal
        open={selectionModalOpen}
        onClose={() => {
          setSelectionModalOpen(false);
          setSelectionModalMode(null);
        }}
        songs={selectionModalSongs}
        currentSong={currentSong}
        onDelete={
          selectionModalMode === "delete"
            ? (videoIds) => {
                api
                  .del("/downloads", { videoIds })
                  .then(() => {
                    setDownloads((prev) =>
                      prev.filter((d) => !videoIds.includes(d.videoId || d.video_id)),
                    );
                    toast("Descargas eliminadas", "info");
                    setSelectionModalOpen(false);
                  })
                  .catch(() => toast("Error al eliminar", "error"));
              }
            : null
        }
      />

      {/* ── Lyrics View (overlay) ─────────────────────────────────────────── */}
      {/* Create Playlist Modal */}
      <CreatePlaylistModal
        open={showCreatePlaylistModal}
        onClose={() => setShowCreatePlaylistModal(false)}
        onCreated={async (newPlaylist) => {
          // Refrescar desde el servidor — la fuente de verdad
          await refreshPlaylists();
          setSelectedPlaylist(newPlaylist);
          closeDetailViews();
          setTab("playlist");
        }}
        toast={toast}
      />

      {/* Montaje condicional: cerrar letras desmonta el overlay (y su chunk
          dnd-kit) — `open` interno queda siempre true, sin cambio visual
          (LyricsView ya devolvía null sin animación de salida). */}
      {lyricsOpen && (
        <Suspense fallback={null}>
          <LyricsView
            song={currentSong}
            open={lyricsOpen}
            onClose={handleLyricsClose}
            queue={queue}
            queueIndex={queueIndex}
            setQueueIndex={setQueueIndex}
            playSong={playSong}
            onSeek={handleSeek}
            progressRef={progressRef}
            audioRef={audioRef}
            accentColor={neonColor}
            lyricsCacheRef={lyricsCacheRef}
            onRemoveFromQueue={removeFromQueue}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onMoveInQueue={moveInQueue}
            streamCacheRef={streamCacheRef}
          />
        </Suspense>
      )}

      {/* Player bar — absolute overlay at bottom, floating over content */}
      {!showSettingsPanel && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 999999,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "all" }}>
            <PlayerBar
              song={currentSong}
              isPlaying={isPlaying}
              streamLoading={streamLoading}
              duration={duration}
              volume={volume}
              onPlayPause={togglePlay}
              onNext={handleNext}
              onPrev={handlePrev}
              onSeek={handleSeek}
              onVolume={handleVolume}
              onPlayModeToggle={handlePlayModeToggle}
              accentColor={neonColor}
              onLyrics={handleToggleLyrics}
              lyricsOpen={lyricsOpen}
              onOpenOptions={handleOpenCurrentOptions}
              shuffleActive={shuffleActive}
              repeatMode={repeatMode}
              crossfadeDuration={crossfadeDuration}
              onCrossfadeDuration={setCrossfadeDuration}
              progressRef={progressRef}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  App — Entry point
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  return (
    <SettingsProvider>
      <PerformanceProvider>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </PerformanceProvider>
    </SettingsProvider>
  );
}
