import { describe, it, expect } from "vitest";
import {
  VIDEO_DRIFT_TOLERANCE,
  VIDEO_PREP,
  VIDEO_PREP_INITIAL,
  altoPantalla,
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

    it("conserva el desfase medido y descarta los inválidos", () => {
      expect(normalizeStatus({ prepared: true, desfase: 12.34 }).desfase).toBe(12.34);
      expect(normalizeStatus({ prepared: true, desfase: "x" }).desfase).toBe(0);
      expect(normalizeStatus({ prepared: true }).desfase).toBe(0);
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

    it("el frame done arrastra el desfase medido", () => {
      expect(normalizePrepareFrame({ status: "done", desfase: -3.2 }).desfase).toBe(-3.2);
      expect(normalizePrepareFrame({ status: "downloading", progress: 10 }).desfase).toBe(0);
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

  describe("altoPantalla", () => {
    it("pide 4K a una pantalla 2160 (altura física, no CSS)", () => {
      expect(altoPantalla({ screen: { height: 2160 }, devicePixelRatio: 1 })).toBe(2160);
      // 4K al 150% de escalado del sistema: 1440 CSS × 1.5.
      expect(altoPantalla({ screen: { height: 1440 }, devicePixelRatio: 1.5 })).toBe(2160);
    });

    it("una pantalla HD se queda en 1080p", () => {
      expect(altoPantalla({ screen: { height: 1080 }, devicePixelRatio: 1 })).toBe(1080);
    });

    it("acota al rango que admite el backend", () => {
      expect(altoPantalla({ screen: { height: 4320 }, devicePixelRatio: 1 })).toBe(2160);
      expect(altoPantalla({ screen: { height: 600 }, devicePixelRatio: 1 })).toBe(720);
    });

    it("si la pantalla no informa, usa el tope histórico de 1080p", () => {
      expect(altoPantalla({ devicePixelRatio: 1 })).toBe(1080);
      expect(altoPantalla({ screen: { height: 0 }, devicePixelRatio: 1 })).toBe(1080);
      expect(altoPantalla({})).toBe(1080);
    });

    it("sin pantalla, cae a la altura de la ventana", () => {
      expect(altoPantalla({ innerHeight: 900, devicePixelRatio: 1 })).toBe(900);
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

    it("con desfase positivo el vídeo va por delante del audio", () => {
      const plan = planVideoSync({
        audioTime: 30,
        videoTime: 0,
        audioPaused: false,
        desfase: 12,
      });
      expect(plan.play).toBe(true);
      expect(plan.seekTo).toBe(42);
    });

    it("con desfase negativo el vídeo espera en su primer fotograma", () => {
      // Objetivo = 3 - 5 = -2: el clip aún no empieza, se queda en su fotograma 0.
      expect(
        planVideoSync({ audioTime: 3, videoTime: 0, audioPaused: false, desfase: -5 }),
      ).toEqual({ play: false, seekTo: 0 });
    });
  });
});
