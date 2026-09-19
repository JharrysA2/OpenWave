import React, { useState, useCallback } from "react";
import { api } from "../utils/api";
import { SongOptionsSheet } from "../components/SongOptionsSheet";

export function useSongOptions({
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
}) {
  const [optionsSong, setOptionsSong] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [optionsLiked, setOptionsLiked] = useState(false);

  const openOptions = useCallback(
    (song) => {
      setOptionsSong(song);
      setOptionsLiked(liked.has(song.videoId));
      setShowOptions(true);
    },
    [liked],
  );

  const closeOptions = useCallback(() => setShowOptions(false), []);

  const songOptionsSheet = (
    <SongOptionsSheet
      song={optionsSong}
      open={showOptions}
      onClose={closeOptions}
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
  );

  return { optionsSong, openOptions, closeOptions, songOptionsSheet };
}
