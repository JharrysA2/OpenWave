import React, { Suspense } from "react";
import { api } from "../utils/api";

// Lazy imports para code splitting
const HomeView = React.lazy(() => import("./HomeView"));
const SearchView = React.lazy(() => import("./SearchView"));
const LikedView = React.lazy(() => import("./LikedView"));
const HistoryView = React.lazy(() => import("./HistoryView"));
const DownloadsView = React.lazy(() => import("./DownloadsView"));
const PlaylistView = React.lazy(() => import("./PlaylistView"));
const AlbumView = React.lazy(() => import("./AlbumView"));
const ArtistView = React.lazy(() => import("./ArtistView"));
const SettingsPanel = React.lazy(() => import("./SettingsPanel"));

export const MainRouter = React.memo(function MainRouter({
  showSettingsPanel,
  onCloseSettings,
  neonColor,
  crossfadeDuration,
  setCrossfadeDuration,
  downloads,
  onClearDownloads,
  onClearHistory,
  onHistoryCleared,
  onDownloadsCleared,
  liked,
  history,
  playlists,
  toast,
  albumBrowseId,
  artistBrowseId,
  goToArtist,
  goToAlbum,
  goBackFromDetail,
  tab,
  currentSong,
  isPlaying,
  playSong,
  toggleLike,
  openOptions,
  historyItems,
  onHomeSearch,
  query,
  onQueryChange,
  searchTab,
  onSearchTabChange,
  results,
  searchArtists,
  searchAlbums,
  songsVisible,
  onShowMore,
  searchLoading,
  videoResults,
  videoLoading,
  videoError,
  searchInputRef,
  likedSongs,
  selectedPlaylist,
  onPlaylistBack,
  onPlaylistUpdated,
  refreshPlaylists,
}) {
  if (showSettingsPanel) {
    return (
      <SettingsPanel
        open={showSettingsPanel}
        onClose={onCloseSettings}
        neonColor={neonColor}
        crossfadeDuration={crossfadeDuration}
        setCrossfadeDuration={setCrossfadeDuration}
        downloads={downloads}
        onClearDownloads={onClearDownloads}
        onClearHistory={onClearHistory}
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
      <Suspense fallback={<div>Cargando álbum...</div>}>
        <AlbumView
          browseId={albumBrowseId}
          accentColor={neonColor}
          currentSong={currentSong}
          playSong={playSong}
          toggleLike={toggleLike}
          liked={liked}
          openOptions={openOptions}
          onGoToArtist={handleGoToArtist}
          onBack={goBackFromDetail}
          toast={toast}
          playlists={playlists}
          refreshPlaylists={refreshPlaylists}
        />
      </Suspense>
    );
  }

  if (artistBrowseId) {
    const handleGoToAlbum = (album) => {
      if (album?.browseId) goToAlbum(album.browseId);
    };
    return (
      <Suspense fallback={<div>Cargando artista...</div>}>
        <ArtistView
          browseId={artistBrowseId}
          accentColor={neonColor}
          currentSong={currentSong}
          playSong={playSong}
          toggleLike={toggleLike}
          liked={liked}
          openOptions={openOptions}
          onGoToAlbum={handleGoToAlbum}
          onGoToRelatedArtist={goToArtist}
          onBack={goBackFromDetail}
        />
      </Suspense>
    );
  }

  switch (tab) {
    case "home":
      return (
        <Suspense fallback={<div>Cargando home...</div>}>
          <HomeView
            currentSong={currentSong}
            isPlaying={isPlaying}
            playSong={playSong}
            history={historyItems}
            accentColor={neonColor}
            onSearch={onHomeSearch}
            openOptions={(song) => song && openOptions(song)}
          />
        </Suspense>
      );

    case "search":
      return (
        <Suspense fallback={<div>Cargando búsqueda...</div>}>
          <SearchView
            query={query}
            onQueryChange={onQueryChange}
            searchTab={searchTab}
            onSearchTabChange={onSearchTabChange}
            results={results}
            searchArtists={searchArtists}
            searchAlbums={searchAlbums}
            songsVisible={songsVisible}
            onShowMore={onShowMore}
            searchLoading={searchLoading}
            videoResults={videoResults}
            videoLoading={videoLoading}
            videoError={videoError}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            toggleLike={toggleLike}
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
        </Suspense>
      );

    case "liked":
      return (
        <Suspense fallback={<div>Cargando lista de canciones guardadas...</div>}>
          <LikedView
            likedSongs={likedSongs}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            toggleLike={toggleLike}
            openOptions={openOptions}
          />
        </Suspense>
      );

    case "history":
      return (
        <Suspense fallback={<div>Cargando historial...</div>}>
          <HistoryView
            history={history}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            openOptions={openOptions}
            toast={toast}
            onHistoryCleared={onHistoryCleared}
          />
        </Suspense>
      );

    case "downloads":
      return (
        <Suspense fallback={<div>Cargando descargas...</div>}>
          <DownloadsView
            downloads={downloads}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            openOptions={openOptions}
            toast={toast}
            onDownloadsCleared={onDownloadsCleared}
          />
        </Suspense>
      );

    case "playlist":
      return (
        <Suspense fallback={<div>Cargando playlist...</div>}>
          <PlaylistView
            playlist={selectedPlaylist}
            currentSong={currentSong}
            accentColor={neonColor}
            playSong={playSong}
            openOptions={openOptions}
            toast={toast}
            onBack={onPlaylistBack}
            onPlaylistUpdated={onPlaylistUpdated}
            playlists={playlists}
            refreshPlaylists={refreshPlaylists}
          />
        </Suspense>
      );

    default:
      return null;
  }
});
