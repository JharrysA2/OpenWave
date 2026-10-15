import { describe, it, expect } from "vitest";
import {
  VIDEO_DRIFT_TOLERANCE,
  VIDEO_PREP,
  VIDEO_PREP_INITIAL,
  isVideoReady,
  normalizePrepareFrame,
  normalizeStatus,
  planVideoSync,
  videoFileUrl,
} from "./lyricsVideo";

describe("lyricsVideo", () => {
  describe("normalizeStatus", () => {
    it("vídeo preparado → READY", () => {
      expect(normalizeStatus({ prepared: true })).toEqual({
        ...VIDEO_PREP_INITIAL,
        status: VIDEO_PREP.READY,
        progress: 100,
      });
    });

    it("canción sin videoclip → NO_VIDEO (queda la portada)", () => {
      expect(normalizeStatus({ prepared: false, sin_videoclip: true }).status).toBe(
        VIDEO_PREP.NO_VIDEO,
      );
    });

    it("sin preparar → IDLE", () => {
      expect(normalizeStatus({ prepared: false }).status).toBe(VIDEO_PREP.IDLE);
      expect(normalizeStatus(null).status).toBe(VIDEO_PREP.IDLE);
    });
  });

  describe("normalizePrepareFrame", () => {
    it("traduce done, sin_video y error", () => {
      expect(normalizePrepareFrame({ status: "done" }).status).toBe(VIDEO_PREP.READY);
      expect(normalizePrepareFrame({ status: "sin_video" }).status).toBe(VIDEO_PREP.NO_VIDEO);
      const err = normalizePrepareFrame({ status: "error", error: "boom" });
      expect(err.status).toBe(VIDEO_PREP.ERROR);
      expect(err.error).toBe("boom");
    });

    it("mientras descarga mantiene PREPARING y acota el progreso", () => {
      const frame = normalizePrepareFrame({ status: "downloading", progress: 42 });
      expect(frame.status).toBe(VIDEO_PREP.PREPARING);
      expect(frame.progress).toBe(42);
      expect(normalizePrepareFrame({ status: "downloading", progress: 500 }).progress).toBe(100);
      expect(normalizePrepareFrame({ status: "downloading", progress: -3 }).progress).toBe(0);
    });

    it("un frame no-JSON no rompe: sigue en PREPARING", () => {
      expect(normalizePrepareFrame("basura").status).toBe(VIDEO_PREP.PREPARING);
      expect(normalizePrepareFrame(null).status).toBe(VIDEO_PREP.PREPARING);
    });
  });

  describe("videoFileUrl / isVideoReady", () => {
    it("monta la URL sin dobles barras", () => {
      expect(videoFileUrl("http://127.0.0.1:8765/", "abc")).toBe(
        "http://127.0.0.1:8765/video/file/abc",
      );
    });

    it("solo READY pinta el vídeo", () => {
      expect(isVideoReady({ status: VIDEO_PREP.READY })).toBe(true);
      expect(isVideoReady({ status: VIDEO_PREP.PREPARING })).toBe(false);
      expect(isVideoReady(null)).toBe(false);
    });
  });

  describe("planVideoSync", () => {
    it("con el audio en pausa, el vídeo se pausa", () => {
      expect(planVideoSync({ audioTime: 10, videoTime: 30, audioPaused: true })).toEqual({
        play: false,
        seekTo: null,
      });
    });

    it("con el audio sonando, el vídeo suena y se corrige si hay deriva", () => {
      expect(planVideoSync({ audioTime: 10, videoTime: 10.1, audioPaused: false })).toEqual({
        play: true,
        seekTo: null,
      });
      const plan = planVideoSync({
        audioTime: 30,
        videoTime: 10,
        audioPaused: false,
        tolerance: VIDEO_DRIFT_TOLERANCE,
      });
      expect(plan.play).toBe(true);
      expect(plan.seekTo).toBe(30);
    });

    it("un vídeo terminado no se reposiciona (se queda en su último fotograma)", () => {
      expect(
        planVideoSync({ audioTime: 300, videoTime: 200, audioPaused: false, videoEnded: true }),
      ).toEqual({ play: true, seekTo: null });
    });

    it("sin tiempos conocidos no inventa correcciones", () => {
      expect(planVideoSync({ audioPaused: false })).toEqual({ play: true, seekTo: null });
    });
  });
});
