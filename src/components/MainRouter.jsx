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
const ArtistSongsView = React.lazy(() => import("./ArtistSongsView"));
const SettingsPanel = React.lazy(() => import("./SettingsPanel"));

export const MainRouter = React.memo(function MainRouter({
  showSettingsPanel,
  onCloseSettings,
  neonColor,
  crossfadeDuration,
  setCrossfadeDuration,
  sleep,
  setSleep,
  downloads,
  onClearDownloads,
  onClearHistory,
  onHistoryCleared,
  onDownloadsCleared,
  onDownloadsRemoved,
  downloadedIds,
  liked,
  history,
  playlists,
  onSelectPlaylist,
  toast,
  albumBrowseId,
  artistBrowseId,
  artistSongs,
  goToArtist,
  goToAlbum,
  goToArtistSongs,
  closeArtistSongs,
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
  videoErrorCode,
  searchError,
  onRetrySearch,
  searchInputRef,
  likedSongs,
  selectedPlaylist,
  onPlaylistBack,
  onPlaylistUpdated,
  refreshPlaylists,
  libraryStatus,
  libraryErrorCode,
  onRetryLibrary,
  likedAlbums,
  followedArtists,
  isAlbumLiked,
  toggleAlbumLike,
  isArtistFollowed,
  toggleFollow,
  openEntityOptions,
  playAlbum,
  downloadAlbum,
  fetchAlbumTracks,
}) {
  if (showSettingsPanel) {
    return (
      <Suspense fallback={<div>Cargando ajustes...</div>}>
        <SettingsPanel
          open={showSettingsPanel}
          onClose={onCloseSettings}
          neonColor={neonColor}
          crossfadeDuration={crossfadeDuration}
          setCrossfadeDuration={setCrossfadeDuration}
          sleep={sleep}
          setSleep={setSleep}
          downloads={downloads}
          onClearDownloads={onClearDownloads}
          onClearHistory={onClearHistory}
          liked={liked}
          history={history}
          playlists={playlists}
          toast={toast}
          refreshLibrary={onRetryLibrary}
        />
      </Suspense>
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
          isAlbumLiked={isAlbumLiked}
          toggleAlbumLike={toggleAlbumLike}
          openEntityOptions={openEntityOptions}
          downloadAlbum={downloadAlbum}
        />
      </Suspense>
    );
  }

  // ── «Todas las canciones del artista» (pantalla dedicada) ──────────
  //    Va DESPUÉS del álbum (si desde aquí se navega a un álbum manda
  //    ese) pero ANTES que la página del artista, que queda debajo como
  //    «atrás» (ESC/back cierra solo este estado). Si esta rama va después
  //    del artista, artistBrowseId siguen activo al apilar y MainRouter
  //    devuelve ArtistView: el botón «Ver todas» no hacía nada visible.
  if (artistSongs?.browseId) {
    return (
      <Suspense fallback={<div>Cargando canciones del artista...</div>}>
        <ArtistSongsView
          browseId={artistSongs.browseId}
          name={artistSongs.name}
          accentColor={neonColor}
          currentSong={currentSong}
          playSong={playSong}
          toggleLike={toggleLike}
          liked={liked}
          openOptions={openOptions}
          onBack={closeArtistSongs}
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
          onOpenArtistSongs={goToArtistSongs}
          onBack={goBackFromDetail}
          isArtistFollowed={isArtistFollowed}
          toggleFollow={toggleFollow}
          openEntityOptions={openEntityOptions}
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
            status={libraryStatus}
            errorCode={libraryErrorCode}
            onRetry={onRetryLibrary}
            accentColor={neonColor}
            onSearch={onHomeSearch}
            openOptions={(song) => song && openOptions(song)}
            playlists={playlists}
            onSelectPlaylist={onSelectPlaylist}
            onSelectAlbum={(a) => {
              if (a?.browseId) goToAlbum(a.browseId);
            }}
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
            videoErrorCode={videoErrorCode}
            searchError={searchError}
            onRetrySearch={onRetrySearch}
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
            openEntityOptions={openEntityOptions}
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
            liked={liked}
            likedAlbums={likedAlbums}
            followedArtists={followedArtists}
            openEntityOptions={openEntityOptions}
            playAlbum={playAlbum}
            goToAlbum={goToAlbum}
            goToArtist={goToArtist}
            playlists={playlists}
            refreshPlaylists={refreshPlaylists}
            toast={toast}
            fetchAlbumTracks={fetchAlbumTracks}
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
            status={libraryStatus}
            errorCode={libraryErrorCode}
            onRetry={onRetryLibrary}
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
            status={libraryStatus}
            errorCode={libraryErrorCode}
            onRetry={onRetryLibrary}
            toast={toast}
            onDownloadsCleared={onDownloadsCleared}
            onDownloadsRemoved={onDownloadsRemoved}
            openEntityOptions={openEntityOptions}
            goToAlbum={goToAlbum}
            playlists={playlists}
            refreshPlaylists={refreshPlaylists}
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
            downloadedIds={downloadedIds}
          />
        </Suspense>
      );

    default:
      return null;
  }
});
