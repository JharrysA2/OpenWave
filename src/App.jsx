import React, { useState, useEffect, useCallback, useMemo } from "react";

// ── Importaciones del proyecto refactorizado ──────────────────────────────────
import { FONT } from "./constants";
import { api } from "./utils/api";
import { ANIMATIONS } from "./utils/theme";
import { SettingsProvider } from "./contexts/SettingsContext";
import { PerformanceProvider } from "./contexts/PerformanceContext";
import { useSettings } from "./contexts/useSettings";
import { usePlayer } from "./hooks/usePlayer";
import { useDynamicTheme } from "./hooks/useDynamicTheme";
import { useSearch } from "./hooks/useSearch";
import { useLibrary } from "./hooks/useLibrary";
import { useToast } from "./hooks/useToast";
import { useSongOptions } from "./hooks/useSongOptions";
import { useSavedEntities } from "./hooks/useSavedEntities";
import { useEntityOptions } from "./hooks/useEntityOptions";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LyricsView } from "./components/LyricsView";
import { TrackPickerModal } from "./components/TrackPickerModal";
import { SelectionModal } from "./components/SelectionModal";
import { PlayerBar } from "./components/PlayerBar";
import { CreatePlaylistModal } from "./components/CreatePlaylistModal";
import { Toasts } from "./components/Toast";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { DynamicBackground } from "./components/DynamicBackground";
import { PlaylistPickerModal } from "./components/PlaylistPickerModal";
import { MainRouter } from "./components/MainRouter";
import { AudioElements } from "./components/AudioElements";
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
    likedMeta,
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

  const onOpenSettings = useCallback(() => setShowSettingsPanel(v => !v), [setShowSettingsPanel]);

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
        // estaba caído (o quedar obsoleta): se limpia y se refresca la biblioteca.
        api.clearCache();
        refreshPlaylists();
        toast(t.reconnected, "success");
      }),
    [refreshPlaylists, toast, t],
  );

  // ── Dynamic theme: color de portada + CSS vars (--neon, overlay) ──
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
      {/* ── Vignette del fondo ───────────────────────────────────────── */}
      <DynamicBackground
        enabled={settings.dynamicTheme}
        hasAccent={hasAccent}
        overlayOpacity={overlayOpacity}
        cfTransitionSpeed={cfTransitionSpeed}
      />

      {/* ── Aviso de desconexión con el backend ───────────────────────── */}
      <ConnectionBanner />

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
        />

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div key={tab} style={{ height: "100%", ...ANIMATIONS.fadeIn(50) }}>
            <MainRouter
              showSettingsPanel={showSettingsPanel}
              onCloseSettings={() => setShowSettingsPanel(false)}
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
              onDownloadsCleared={() => setDownloads([])}
              onDownloadsRemoved={(videoIds) =>
                setDownloads((prev) =>
                  (prev || []).filter((d) => !videoIds.includes(d.videoId || d.video_id)),
                )
              }
              onHistoryCleared={() => setHistory([])}
              liked={liked}
              history={history}
              playlists={playlists}
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
              onHomeSearch={handleHomeSearch}
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
              searchInputRef={searchInputRef}
              likedSongs={likedSongs}
              selectedPlaylist={selectedPlaylist}
              onPlaylistBack={() => {
                setSelectedPlaylist(null);
                setTab("home");
              }}
              onPlaylistUpdated={() => refreshPlaylists()}
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
              onLyrics={() => setLyricsOpen((v) => !v)}
              lyricsOpen={lyricsOpen}
              onOpenOptions={() => currentSong && openOptions(currentSong)}
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
