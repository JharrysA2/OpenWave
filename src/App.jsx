import React, { useState, useEffect, useCallback, useMemo } from "react";

// ── Importaciones del proyecto refactorizado ──────────────────────────────────
import { FONT } from "./constants";
import { api } from "./utils/api";
import { winCtrl } from "./utils/windowControls";
import { Ic } from "./icons/Icons";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useSettings } from "./contexts/useSettings";
import { usePlayer } from "./hooks/usePlayer";
import { useDynamicTheme } from "./hooks/useDynamicTheme";
import { useSearch } from "./hooks/useSearch";
import { useLibrary } from "./hooks/useLibrary";
import {
  ANIMATIONS,
  sidebarBgGradient,
  vignetteOverlay,
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  GLASS,
} from "./utils/theme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SongOptionsSheet } from "./components/SongOptionsSheet";
import { LyricsView } from "./components/LyricsView";
import { TrackPickerModal } from "./components/TrackPickerModal";
import { SelectionModal } from "./components/SelectionModal";
import { PlayerBar } from "./components/PlayerBar";
import { HomeView } from "./components/HomeView";
import { SearchView } from "./components/SearchView";
import { LikedView } from "./components/LikedView";
import { HistoryView } from "./components/HistoryView";
import { DownloadsView } from "./components/DownloadsView";
import { PlaylistView } from "./components/PlaylistView";
import { CreatePlaylistModal } from "./components/CreatePlaylistModal";
import { AlbumView } from "./components/AlbumView";
import { ArtistView } from "./components/ArtistView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toasts } from "./components/Toast";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { useToast } from "./hooks/useToast";
import { startHeartbeat, stopHeartbeat, subscribeReconnect } from "./utils/backendHealth";

// ═══════════════════════════════════════════════════════════════════════════════
//  AppInner — lógica principal de la aplicación
// ═══════════════════════════════════════════════════════════════════════════════

function AppInner() {
  const { settings, t } = useSettings();

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
    searchLoading,
    searchInputRef,
    handleSearchChange,
    doSearch,
    doSearchVideos,
    setQuery,
  } = useSearch();
  const {
    liked,
    setLiked,
    history,
    setHistory,
    downloads,
    setDownloads,
    playlists,
    toggleLike,
    mostPlayed,
    refreshPlaylists,
  } = useLibrary();
  const player = usePlayer(toast, results, settings.crossfade || 0);
  const {
    currentSong,
    queue,
    queueIndex,
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

  // ── Estado de UI ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(() => settings.defaultTab || "home");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // ── Opciones de canción ─────────────────────────────────────────────────────
  const [optionsSong, setOptionsSong] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [optionsLiked, setOptionsLiked] = useState(false);

  // ── Playlist picker (desde el botón "Agregar a") ───────────────────────
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [playlistPickerSong, setPlaylistPickerSong] = useState(null);

  // ── Track Picker ────────────────────────────────────────────────────────────
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [trackPickerPlaylist, _setTrackPickerPlaylist] = useState(null);
  const [trackPickerTracks, _setTrackPickerTracks] = useState([]);
  const [trackPickerLoading, _setTrackPickerLoading] = useState(false);

  // ── Selection Modal ─────────────────────────────────────────────────────────
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [selectionModalSongs, _setSelectionModalSongs] = useState([]);
  const [selectionModalMode, setSelectionModalMode] = useState(null);

  // ── Navegación a detalle: Álbum / Artista ─────────────────────────────
  const [albumBrowseId, setAlbumBrowseId] = useState(null);
  const [artistBrowseId, setArtistBrowseId] = useState(null);
  const [prevTab, setPrevTab] = useState(null); // para volver atrás

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
        // estaba caído (o quedar obsoleta): se limpia y se refresca la biblioteca.
        api.clearCache();
        refreshPlaylists();
        toast(t.reconnected, "success");
      }),
    [refreshPlaylists, toast, t],
  );

  // ── Dynamic theme: color de portada + CSS vars (--neon, aurora, overlay) ──
  const { neonColor, cfTransitionSpeed, bgStyle, overlayOpacity, hasAccent } = useDynamicTheme({
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
      toast("Error de reproducción", "error");
    },
    [toast, proxyRetryRef],
  );

  // ── Wrapper de toggleLike que también envía feedback ───────────────────────

  const handleToggleLike = useCallback(
    (videoId, song) => {
      const wasLiked = liked.has(videoId);
      toggleLike(videoId);
      if (sendFeedback) {
        sendFeedback(wasLiked ? "unlike" : "like", song || { videoId });
      }
    },
    [liked, toggleLike, sendFeedback],
  );

  // ── Canciones que te gustan (de todas las fuentes) ──────────────────────────

  const likedSongs = useMemo(() => {
    const all = [...(results || []), ...queue, currentSong].filter(Boolean);
    return [...new Map(all.map((s) => [s.videoId, s])).values()].filter((s) =>
      liked.has(s.videoId),
    );
  }, [liked, results, queue, currentSong]);

  // ── Abrir opciones de canción ───────────────────────────────────────────────

  const openOptions = useCallback(
    (song) => {
      setOptionsSong(song);
      setOptionsLiked(liked.has(song.videoId));
      setShowOptions(true);
    },
    [liked],
  );

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

  // ── Navegación ──────────────────────────────────────────────────────────────

  const navItems = useMemo(
    () => [
      ["home", Ic.home, "Inicio"],
      ["search", Ic.search, "Buscar"],
      ["liked", Ic.heart(liked.size > 0, 18), "Me gusta"],
      ["history", Ic.history(18), "Historial"],
      ["downloads", Ic.download(18), "Descargas"],
    ],
    [liked],
  );

  useEffect(() => {
    setTab(settings.defaultTab || "home");
  }, [settings.defaultTab]);

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

  // ── Modo de reproducción ────────────────────────────────────────────────────

  const handlePlayModeToggle = useCallback(
    (mode) => {
      if (mode === "shuffle") setShuffleActive((v) => !v);
      if (mode === "repeat") toggleRepeatMode();
    },
    [setShuffleActive, toggleRepeatMode],
  );

  // ── Render: PlayerBar ───────────────────────────────────────────────────────

  const renderPlayerBar = () => (
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
      onLyrics={() => setLyricsOpen((v) => !v)}
      lyricsOpen={lyricsOpen}
      onOpenOptions={() => currentSong && openOptions(currentSong)}
      shuffleActive={shuffleActive}
      repeatMode={repeatMode}
      crossfadeDuration={crossfadeDuration}
      onCrossfadeDuration={setCrossfadeDuration}
      progressRef={progressRef}
    />
  );

  // ── Render: Main content area ───────────────────────────────────────────────

  const renderMainContent = () => {
    if (showSettingsPanel) {
      return (
        <SettingsPanel
          open={showSettingsPanel}
          onClose={() => setShowSettingsPanel(false)}
          neonColor={neonColor}
          crossfadeDuration={crossfadeDuration}
          setCrossfadeDuration={setCrossfadeDuration}
          downloads={downloads}
          onClearDownloads={() => {
            api.del("/downloads/all").catch(() => toast("Error al limpiar descargas", "error"));
            setDownloads([]);
            toast("Descargas eliminadas", "info");
          }}
          onClearHistory={() => {
            api.del("/history/all").catch(() => toast("Error al limpiar historial", "error"));
            setHistory([]);
          }}
          liked={liked}
          history={history}
          playlists={playlists}
          toast={toast}
        />
      );
    }

    // ── Vistas de detalle (álbum / artista) ────────────────────────────
    if (albumBrowseId) {
      const handleGoToArtist = (param) => {
        // Si ya tenemos el browseId, navegar directamente
        if (typeof param === "object" && param?.browseId) {
          goToArtist(param.browseId);
          return;
        }
        // Fallback: buscar por nombre
        if (param) {
          api
            .get(`/search?q=${encodeURIComponent(param)}&limit=3`)
            .then((d) => {
              if (d?.artists?.[0]?.browseId) goToArtist(d.artists[0].browseId);
            })
            .catch(() => {});
        }
      };
      return (
        <AlbumView
          browseId={albumBrowseId}
          accentColor={neonColor}
          currentSong={currentSong}
          playSong={playSong}
          toggleLike={handleToggleLike}
          liked={liked}
          openOptions={openOptions}
          onGoToArtist={handleGoToArtist}
          onBack={goBackFromDetail}
          toast={toast}
          playlists={playlists}
          refreshPlaylists={refreshPlaylists}
        />
      );
    }

    if (artistBrowseId) {
      const handleGoToAlbum = (album) => {
        if (album?.browseId) goToAlbum(album.browseId);
      };
      return (
        <ArtistView
          browseId={artistBrowseId}
          accentColor={neonColor}
          currentSong={currentSong}
          playSong={playSong}
          toggleLike={handleToggleLike}
          liked={liked}
          openOptions={openOptions}
          onGoToAlbum={handleGoToAlbum}
          onGoToRelatedArtist={goToArtist}
          onBack={goBackFromDetail}
        />
      );
    }

    switch (tab) {
      case "home":
        return (
          <HomeView
            currentSong={currentSong}
            isPlaying={isPlaying}
            playSong={playSong}
            history={mostPlayed}
            accentColor={neonColor}
            onSearch={handleHomeSearch}
            openOptions={(song) => song && openOptions(song)}
          />
        );

      case "search":
        return (
          <SearchView
            query={query}
            onQueryChange={handleSearchChange}
            searchTab={searchTab}
            onSearchTabChange={setSearchTab}
            results={results}
            searchArtists={searchArtists}
            searchAlbums={searchAlbums}
            songsVisible={songsVisible}
            onShowMore={() => setSongsVisible((v) => v + 10)}
            searchLoading={searchLoading}
            videoResults={videoResults}
            videoLoading={videoLoading}
            videoError={videoError}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            toggleLike={handleToggleLike}
            liked={liked}
            openOptions={openOptions}
            searchInputRef={searchInputRef}
            onSelectArtist={(a) => {
              if (a?.browseId) goToArtist(a.browseId);
            }}
            onSelectAlbum={(a) => {
              if (a?.browseId) goToAlbum(a.browseId);
            }}
          />
        );

      case "liked":
        return (
          <LikedView
            likedSongs={likedSongs}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            toggleLike={handleToggleLike}
            openOptions={openOptions}
          />
        );

      case "history":
        return (
          <HistoryView
            history={history}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            openOptions={openOptions}
            toast={toast}
            onHistoryCleared={() => setHistory([])}
          />
        );

      case "downloads":
        return (
          <DownloadsView
            downloads={downloads}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            openOptions={openOptions}
            toast={toast}
            onDownloadsCleared={() => setDownloads([])}
          />
        );

      case "playlist":
        return (
          <PlaylistView
            playlist={selectedPlaylist}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            openOptions={openOptions}
            toast={toast}
            onBack={() => {
              setSelectedPlaylist(null);
              setTab("home");
            }}
            onPlaylistUpdated={async () => {
              await refreshPlaylists();
            }}
            playlists={playlists}
            refreshPlaylists={refreshPlaylists}
          />
        );

      default:
        return null;
    }
  };

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
      {/* ── Aurora Mesh Gradient — animated background blobs ──────────── */}
      {settings.dynamicTheme && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
            opacity: hasAccent ? overlayOpacity * 0.5 : overlayOpacity * 0.25,
            transition: `opacity 1.5s cubic-bezier(.16,1,.3,1)`,
          }}
        >
          <div
            className="aurora-layer aurora-1"
            style={{ opacity: 0.45, transition: `background 2s cubic-bezier(.16,1,.3,1)` }}
          />
          <div
            className="aurora-layer aurora-2"
            style={{ opacity: 0.3, transition: `background 2s cubic-bezier(.16,1,.3,1)` }}
          />
          <div
            className="aurora-layer aurora-3"
            style={{ opacity: 0.18, transition: `background 2s cubic-bezier(.16,1,.3,1)` }}
          />
        </div>
      )}

      {/* ── Aviso de desconexión con el backend ───────────────────────── */}
      <ConnectionBanner />

      {/* ── Vignette sutil para profundidad ──────────────────── */}
      {settings.dynamicTheme && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            background: vignetteOverlay(),
            opacity: hasAccent ? 0.35 : 0.1,
            transition: `opacity ${cfTransitionSpeed} cubic-bezier(.16,1,.3,1)`,
            willChange: "opacity",
          }}
        />
      )}

      {/* ── Custom Title Bar — glassmorphism ──── */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          height: "32px",
          flexShrink: 0,
          padding: "0 0 0 14px",
          userSelect: "none",
          WebkitUserSelect: "none",
          position: "relative",
          zIndex: 100000,
          ...GLASS.titleBar,
          borderBottom: `1px solid color-mix(in srgb, var(--neon) 25%, rgba(255,255,255,.06))`,
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: "800",
            color: "rgba(255,255,255,.45)",
            letterSpacing: ".5px",
            alignSelf: "center",
          }}
        >
          SoundWave
        </span>
        <div style={{ display: "flex", alignItems: "stretch" }}>
          {/* ── Window controls — square, flush, full title-bar height like Windows ── */}
          {[
            {
              onClick: winCtrl.minimize,
              title: "Minimizar",
              svg: (
                <svg width="10" height="10" viewBox="0 0 12 12">
                  <rect x="1" y="9.5" width="10" height="1.5" fill="currentColor" rx="1" />
                </svg>
              ),
            },
            {
              onClick: winCtrl.maximize,
              title: "Maximizar",
              svg: (
                <svg width="10" height="10" viewBox="0 0 12 12">
                  <rect
                    x="2"
                    y="2.5"
                    width="8"
                    height="8"
                    rx="1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
              ),
            },
            {
              onClick: winCtrl.close,
              title: "Cerrar",
              svg: (
                <svg width="10" height="10" viewBox="0 0 12 12">
                  <path
                    d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              ),
              close: true,
            },
          ].map(({ onClick, title, svg, close }) => (
            <button
              key={title}
              onClick={onClick}
              title={title}
              style={{
                width: "46px",
                minWidth: "46px",
                height: "100%",
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,.45)",
                cursor: "pointer",
                borderRadius: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all .1s cubic-bezier(.16,1,.3,1)",
                flexShrink: 0,
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.06)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = close
                  ? "rgba(239,68,68,.85)"
                  : "rgba(255,255,255,.14)";
                e.currentTarget.style.color = close ? "#fff" : "rgba(255,255,255,.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(255,255,255,.45)";
              }}
            >
              {svg}
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar + Main area — fills entire height below title bar */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* ── Sidebar — glassmorphism structural material ── */}
        <div
          style={{
            width: "200px",
            height: "100%",
            flexShrink: 0,
            borderRight: `1px solid color-mix(in srgb, var(--neon) 30%, rgba(255,255,255,.06))`,
            display: "flex",
            flexDirection: "column",
            ...GLASS.sidebar,
            background: sidebarBgGradient(),
          }}
        >
          {/* Logo + controls — Apple-style header */}
          <div
            style={{
              padding: "16px 16px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid rgba(255,255,255,.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              {Ic.waveIcon}
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: "800",
                  letterSpacing: "-.3px",
                  color: "rgba(255,255,255,.92)",
                }}
              >
                SoundWave
              </span>
            </div>
            {/* ── Settings button — Apple-style: circle with subtle glass ── */}
            <button
              data-testid="settings-btn"
              onClick={() => setShowSettingsPanel(true)}
              title="Ajustes"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                flexShrink: 0,
                ...GLASS.btn,
                color: "rgba(255,255,255,.55)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all .15s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.9)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.12)";
                e.currentTarget.style.color = "rgba(255,255,255,.85)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.06)";
                e.currentTarget.style.color = "rgba(255,255,255,.55)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>

          {/* Nav — glass style items con contraste adaptativo */}
          <nav style={{ padding: "4px 10px" }}>
            {" "}
            {navItems.map(([t, icon, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  ...(tab === t ? GLASS.navItemActive(neonColor) : GLASS.navItem),
                  color: tab === t ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)",
                  fontWeight: tab === t ? "700" : "500",
                  fontSize: "13px",
                  marginBottom: "4px",
                  fontFamily: FONT,
                  transition: "all .12s cubic-bezier(.16,1,.3,1)",
                }}
                onMouseDown={(e) => {
                  // Apple: instant feedback on pointer-down
                  e.currentTarget.style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = tab !== t ? "translateY(-1px)" : "scale(1)";
                }}
                onMouseEnter={(e) => {
                  if (tab !== t) {
                    e.currentTarget.style.background = "rgba(255,255,255,.09)";
                    e.currentTarget.style.color = "rgba(255,255,255,.88)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.12)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (tab !== t) {
                    e.currentTarget.style.background =
                      "linear-gradient(135deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)";
                    e.currentTarget.style.color = "rgba(255,255,255,.55)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.06)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                <span style={{ width: "18px", display: "flex", justifyContent: "center" }}>
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </nav>

          {/* ── Playlists section ── */}
          <div style={{ padding: "8px 10px", marginTop: "8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 12px 6px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  color: "rgba(255,255,255,.35)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Playlists
              </span>
              <button
                onClick={() => setShowCreatePlaylistModal(true)}
                style={{
                  ...GLASS.btn,
                  borderRadius: RADIUS.full,
                  width: "24px",
                  height: "24px",
                  cursor: "pointer",
                  color: "rgba(255,255,255,.45)",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: TRANSITIONS.fast,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "rgba(255,255,255,.9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "rgba(255,255,255,.45)";
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            {playlists.length === 0 ? (
              <div
                style={{
                  padding: "12px 12px 8px",
                  fontSize: "11px",
                  color: "rgba(255,255,255,.2)",
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                Sin playlists aún
              </div>
            ) : (
              playlists.map((pl) => {
                const isActive = tab === "playlist" && selectedPlaylist?.id === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => {
                      setSelectedPlaylist(pl);
                      setTab("playlist");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "12px",
                      cursor: "pointer",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.04) 100%)"
                        : "transparent",
                      border: isActive
                        ? `1px solid rgba(255,255,255,.08)`
                        : "1px solid transparent",
                      boxShadow: isActive
                        ? "inset 0 1px 0 rgba(255,255,255,.08), 0 2px 8px rgba(0,0,0,.15)"
                        : "none",
                      color: isActive ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.5)",
                      fontWeight: isActive ? "700" : "500",
                      fontSize: "12.5px",
                      fontFamily: FONT,
                      transition: "all .15s cubic-bezier(.16,1,.3,1)",
                      textAlign: "left",
                      marginBottom: "3px",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background =
                          "linear-gradient(135deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,.05)";
                        e.currentTarget.style.color = "rgba(255,255,255,.85)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "transparent";
                        e.currentTarget.style.color = "rgba(255,255,255,.5)";
                      }
                    }}
                  >
                    {/* Mini portada o icono */}
                    {pl.cover || pl.first_cover ? (
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          flexShrink: 0,
                          boxShadow: "0 2px 8px rgba(0,0,0,.3)",
                        }}
                      >
                        <img
                          src={pl.cover || pl.first_cover}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "8px",
                          flexShrink: 0,
                          background: pl.color
                            ? `linear-gradient(135deg, ${pl.color}44, ${pl.color}15)`
                            : "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: pl.color
                            ? `1px solid ${pl.color}33`
                            : "1px solid rgba(255,255,255,.06)",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={pl.color || "rgba(255,255,255,.3)"}
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {pl.name}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "rgba(255,255,255,.25)",
                          fontWeight: "600",
                          marginTop: "1px",
                        }}
                      >
                        {pl.song_count || 0} canción{(pl.song_count || 0) !== 1 ? "es" : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div key={tab} style={{ height: "100%", ...ANIMATIONS.fadeIn(50) }}>
            {renderMainContent()}
          </div>
        </div>
      </div>

      {/* Audio elements */}
      <audio
        ref={audioRef}
        hidden
        onTimeUpdate={(e) => {
          if (e.target !== audioRef.current) return;
          progressRef.current = e.target.currentTime;
          const song30 = currentlyPlayingSongRef.current;
          if (e.target.currentTime >= 30 && song30 && loggedSongRef.current !== song30.videoId) {
            loggedSongRef.current = song30.videoId;
            api.logHistory(song30, toast);
          }
        }}
        onEnded={handleSongEnded}
        onDurationChange={(e) => {
          // ⭐ Fix barra de progreso en crossfade: SOLO el audio ACTUAL puede
          //    cambiar la duración visible. Sin este guard, la metadata del
          //    audio ENTRANTE (que ya cargó durante el fade) pisa `duration`
          //    con la duración de la SIGUIENTE canción → la barra y los
          //    rótulos se recalculan contra esa escala en medio del fade
          //    (posición/total inconsistentes hasta que termina el swap).
          //    También bloquea el NaN/0 que dispara el audio saliente cuando
          //    performCrossfade le hace src="".
          if (e.target !== audioRef.current) return;
          if (e.target.duration) setDuration(e.target.duration);
        }}
        onError={handleAudioError}
      />
      <audio
        ref={nextAudioRef}
        hidden
        onTimeUpdate={(e) => {
          if (e.target !== audioRef.current) return;
          progressRef.current = e.target.currentTime;
          const song30 = currentlyPlayingSongRef.current;
          if (e.target.currentTime >= 30 && song30 && loggedSongRef.current !== song30.videoId) {
            loggedSongRef.current = song30.videoId;
            api.logHistory(song30, toast);
          }
        }}
        onEnded={handleSongEnded}
        onDurationChange={(e) => {
          // ⭐ Fix barra de progreso en crossfade: SOLO el audio ACTUAL puede
          //    cambiar la duración visible. Sin este guard, la metadata del
          //    audio ENTRANTE (que ya cargó durante el fade) pisa `duration`
          //    con la duración de la SIGUIENTE canción → la barra y los
          //    rótulos se recalculan contra esa escala en medio del fade
          //    (posición/total inconsistentes hasta que termina el swap).
          //    También bloquea el NaN/0 que dispara el audio saliente cuando
          //    performCrossfade le hace src="".
          if (e.target !== audioRef.current) return;
          if (e.target.duration) setDuration(e.target.duration);
        }}
        onError={handleAudioError}
      />

      {/* Toasts */}
      <Toasts toasts={toasts} />

      {/* Song Options Sheet */}
      <SongOptionsSheet
        song={optionsSong}
        open={showOptions}
        onClose={() => setShowOptions(false)}
        onDownload={() => api.fetchDownloads().then(setDownloads)}
        onDownloadStart={(song) => {
          setDownloads((prev) => {
            if (prev.find((d) => (d.videoId || d.video_id) === song.videoId)) return prev;
            return [
              {
                videoId: song.videoId,
                title: song.title,
                artist: song.artist,
                thumbnail: song.thumbnail,
                duration: song.duration,
                downloaded: true,
                progress: 0,
              },
              ...prev,
            ];
          });
        }}
        onPlayNext={playNext}
        liked={optionsLiked}
        onLike={() => {
          const wasLiked = optionsLiked;
          toggleLike(optionsSong?.videoId);
          setOptionsLiked((v) => !v);
          if (optionsSong && sendFeedback) {
            sendFeedback(wasLiked ? "unlike" : "like", optionsSong);
          }
        }}
        toast={toast}
        onRadio={(song) => {
          playSong(song, 0, false);
          setShuffleActive(true);
          toast("Radio iniciada", "success");
        }}
        onGoToAlbum={(song) => {
          goToAlbumFromSong(song);
        }}
        onGoToArtist={(song) => {
          goToArtistFromSong(song);
        }}
        onOpenPlaylistPicker={(song) => {
          setShowOptions(false);
          if (playlists.length === 0) {
            toast("No hay playlists. Crea una en Ajustes", "info");
            return;
          }
          setPlaylistPickerSong(song);
          setPlaylistPickerOpen(true);
        }}
        onDeleteSong={(videoId) => {
          if (!videoId) return;
          setLiked((prev) => {
            const n = new Set(prev);
            n.delete(videoId);
            return n;
          });
          toast("Eliminada de biblioteca", "info");
        }}
      />

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
      {playlistPickerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000010,
            background: "rgba(0,0,0,.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "sw-fade-in .15s ease both",
          }}
          onClick={() => {
            setPlaylistPickerOpen(false);
            setPlaylistPickerSong(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...GLASS.sheet,
              borderRadius: RADIUS.card,
              width: "340px",
              maxWidth: "90vw",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              fontFamily: FONT,
            }}
          >
            {/* Header con botón cerrar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px 12px",
                borderBottom: `1px solid ${COLORS.borderSubtle}`,
              }}
            >
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: "900",
                  color: COLORS.textPrimary,
                  letterSpacing: "-.3px",
                }}
              >
                Agregar a playlist
              </span>
              <button
                onClick={() => {
                  setPlaylistPickerOpen(false);
                  setPlaylistPickerSong(null);
                }}
                style={{
                  ...GLASS.btn,
                  borderRadius: RADIUS.full,
                  width: "32px",
                  height: "32px",
                  cursor: "pointer",
                  color: COLORS.winCtrlDefault,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: TRANSITIONS.fast,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.surfaceCardHover;
                  e.currentTarget.style.color = COLORS.textPrimary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.surfaceNav;
                  e.currentTarget.style.color = COLORS.winCtrlDefault;
                }}
              >
                {Ic.close}
              </button>
            </div>

            {/* Lista de playlists */}
            <div style={{ overflowY: "auto", padding: "6px 10px" }}>
              {playlists.length === 0 && (
                <div
                  style={{
                    padding: "30px",
                    textAlign: "center",
                    color: COLORS.textMuted,
                    fontSize: "13px",
                    fontWeight: "700",
                  }}
                >
                  No hay playlists
                </div>
              )}
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => {
                    api
                      .post(`/playlists/${pl.id}/songs`, {
                        videoIds: [playlistPickerSong?.videoId],
                        songs: [
                          playlistPickerSong
                            ? {
                                videoId: playlistPickerSong.videoId,
                                title: playlistPickerSong.title || "",
                                artist: playlistPickerSong.artist || "",
                                thumbnail: playlistPickerSong.thumbnail || "",
                                thumbnails: playlistPickerSong.thumbnails || [],
                                duration: playlistPickerSong.duration || 0,
                              }
                            : null,
                        ],
                      })
                      .then(async () => {
                        toast(`Agregada a "${pl.name}"`, "success");
                        setPlaylistPickerOpen(false);
                        setPlaylistPickerSong(null);
                        // Refresh playlists to update song count in sidebar
                        await refreshPlaylists();
                      })
                      .catch(() => {
                        toast("Error al agregar", "error");
                        setPlaylistPickerOpen(false);
                      });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.gap.normal,
                    padding: "11px 14px",
                    borderRadius: RADIUS.default,
                    cursor: "pointer",
                    transition: TRANSITIONS.fast,
                    color: COLORS.textPlayerTitle,
                    fontWeight: "700",
                    fontSize: "14px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceNav)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  {pl.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
          const fresh = await refreshPlaylists();
          if (fresh) setPlaylists(fresh);
          setSelectedPlaylist(newPlaylist);
          setTab("playlist");
        }}
        toast={toast}
      />

      <LyricsView
        song={currentSong}
        open={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        queue={queue}
        queueIndex={queueIndex}
        playSong={playSong}
        onSeek={handleSeek}
        progressRef={progressRef}
        accentColor={neonColor}
        lyricsCacheRef={lyricsCacheRef}
        onRemoveFromQueue={removeFromQueue}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onMoveInQueue={moveInQueue}
        streamCacheRef={streamCacheRef}
      />

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
          <div style={{ pointerEvents: "all" }}>{renderPlayerBar()}</div>
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
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </SettingsProvider>
  );
}
