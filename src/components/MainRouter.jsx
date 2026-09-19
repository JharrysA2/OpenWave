import React from "react";
import { api } from "../utils/api";
import { SettingsPanel } from "./SettingsPanel";
import { AlbumView } from "./AlbumView";
import { ArtistView } from "./ArtistView";
import { HomeView } from "./HomeView";
import { SearchView } from "./SearchView";
import { LikedView } from "./LikedView";
import { HistoryView } from "./HistoryView";
import { DownloadsView } from "./DownloadsView";
import { PlaylistView } from "./PlaylistView";

export function MainRouter({
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
        toggleLike={toggleLike}
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
          history={historyItems}
          accentColor={neonColor}
          onSearch={onHomeSearch}
          openOptions={(song) => song && openOptions(song)}
        />
      );

    case "search":
      return (
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
      );

    case "liked":
      return (
        <LikedView
          likedSongs={likedSongs}
          currentSong={currentSong}
          accentColor={neonColor}
          playSong={playSong}
          toggleLike={toggleLike}
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
          onHistoryCleared={onHistoryCleared}
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
          onDownloadsCleared={onDownloadsCleared}
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
          onBack={onPlaylistBack}
          onPlaylistUpdated={onPlaylistUpdated}
          playlists={playlists}
          refreshPlaylists={refreshPlaylists}
        />
      );

    default:
      return null;
  }
}
