import React from "react";
import { api } from "../utils/api";

export function AudioElements({
  audioRef,
  nextAudioRef,
  progressRef,
  loggedSongRef,
  currentlyPlayingSongRef,
  setDuration,
  handleSongEnded,
  handleAudioError,
  toast,
}) {
  const audioProps = {
    hidden: true,
    onTimeUpdate: (e) => {
      if (e.target !== audioRef.current) return;
      progressRef.current = e.target.currentTime;
      const song30 = currentlyPlayingSongRef.current;
      if (e.target.currentTime >= 30 && song30 && loggedSongRef.current !== song30.videoId) {
        loggedSongRef.current = song30.videoId;
        api.logHistory(song30, toast);
      }
    },
    onEnded: handleSongEnded,
    onDurationChange: (e) => {
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
    },
    onError: handleAudioError,
  };

  return (
    <>
      <audio ref={audioRef} {...audioProps} />
      <audio ref={nextAudioRef} {...audioProps} />
    </>
  );
}
