import { describe, it, expect, vi, afterEach } from "vitest";
import { preblurToDataUrl, preblurUrlToDataUrl, filtroCanvasSoportado } from "./imageBlur";
import tauriConf from "../../src-tauri/tauri.conf.json";

describe("CSP de producción — cadena del pre-difuminado de Letras", () => {
  it("img-src permite el proxy de miniaturas del backend (127.0.0.1:8765)", () => {
    // Regresión real (2026-10-03): `img-src` no incluía el origen del
    // backend, así que la Image con crossOrigin del pre-blur era bloqueada
    // por CSP en la app instalada (evento securitypolicyviolation →
    // img-src), el canvas caía contaminado por el fallback directo y
    // bgBlurUrl quedaba vacío: la capa de Letras rotaba SIEMPRE con el
    // filtro CSS blur(12px) en vez del flujo diseñado (cadena aplicada en
    // canvas, capa sin filter). connect-src y media-src sí lo traían: solo
    // img-src se había quedado corto.
    const csp = tauriConf.app.security.csp;
    expect(csp).toContain("img-src");
    expect(csp).toMatch(/img-src[^;]*http:\/\/127\.0\.0\.1:8765/);
  });
});

describe("preblurToDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resuelve null si la imagen no tiene dimensiones", async () => {
    expect(await preblurToDataUrl(null)).toBeNull();
    expect(await preblurToDataUrl({})).toBeNull();
    expect(await preblurToDataUrl({ naturalWidth: 0, naturalHeight: 100 })).toBeNull();
  });

  it("cubre el viewport con ~1.5x de subida y codifica en WebP", async () => {
    const ctx = { filter: "", drawImage: vi.fn(), imageSmoothingQuality: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/webp;base64,x");

    const url = await preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 });

    expect(url).toBe("data:image/webp;base64,x");
    expect(toDataURL).toHaveBeenCalledWith("image/webp", 0.9);
    expect(ctx.imageSmoothingQuality).toBe("high");
    // jsdom: innerWidth=1024, dpr=1 → ancho = max(960, 1024/1.5) = 960
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 960, 540);
    // r = 12 × 960 / 1024 = 11.3px (tras el upsample equivale a blur(12px) CSS)
    expect(ctx.filter).toContain("blur(11.3px)");
    expect(ctx.filter).toContain("saturate(1.2)");
    expect(ctx.filter).toContain("brightness(0.7)");
  });

  it("elige el radio equivalente a blur(12px) del viewport (12 x ancho/viewport)", async () => {
    const ctx = { filter: "", drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,x");

    await preblurToDataUrl(
      { naturalWidth: 1920, naturalHeight: 1080 },
      { width: 1280, viewportWidth: 1536 },
    );

    // 12 × 1280 / 1536 = 10px exactos
    expect(ctx.filter).toContain("blur(10px)");
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 720);
  });

  it("cae a JPEG de mayor calidad si el motor no soporta WebP", async () => {
    const ctx = { filter: "", drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockImplementation((type) =>
        type === "image/webp" ? "data:," : "data:image/jpeg;base64,y",
      );

    const url = await preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 });

    expect(url).toBe("data:image/jpeg;base64,y");
    expect(toDataURL).toHaveBeenNthCalledWith(1, "image/webp", 0.9);
    expect(toDataURL).toHaveBeenNthCalledWith(2, "image/jpeg", 0.92);
  });

  it("resuelve null si toDataURL lanza (canvas contaminado por CORS)", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      filter: "",
      drawImage: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new Error("Tainted canvases may not be exported");
    });

    expect(await preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 })).toBeNull();
  });

  it("codifica con OffscreenCanvas.convertToBlob si existe (sin bloquear el hilo)", async () => {
    const ctx = { filter: "", drawImage: vi.fn(), imageSmoothingQuality: "" };
    const convertToBlob = vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    class FakeOffscreenCanvas {
      constructor(w, h) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return ctx;
      }
      convertToBlob(opts) {
        return convertToBlob(opts);
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/webp;base64,x");

    const url = await preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 });

    expect(url).toMatch(/^data:image\/webp/);
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.9 });
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 960, 540);
    expect(ctx.filter).toContain("blur(11.3px)");
    // el fallback síncrono no se usa cuando convertToBlob resuelve WebP
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("cae al camino síncrono si convertToBlob rechaza (canvas contaminado)", async () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { filter: "", drawImage: vi.fn() };
        }
        convertToBlob() {
          return Promise.reject(new Error("SecurityError"));
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      filter: "",
      drawImage: vi.fn(),
    });
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/webp;base64,x");

    const url = await preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 });

    expect(url).toBe("data:image/webp;base64,x");
    expect(toDataURL).toHaveBeenCalledWith("image/webp", 0.9);
  });
});

describe("preblurUrlToDataUrl — descarga por blob (nunca contamina el canvas)", () => {
  // Regresión real (2026-10-19, app instalada): el pre-difuminado se pedía con
  // un `<img crossOrigin>` al proxy de miniaturas. Si el proxy fallaba UNA vez
  // (5xx/red), el respaldo cargaba la URL directa del CDN sin CORS: el canvas
  // quedaba contaminado, `bgBlurUrl` vacío y la capa de fondo se quedaba con
  // el `filter: blur(12px)` de respaldo re-ejecutándose en cada repintado
  // (70% de iGPU con el vídeo apagado frente a 36% con él). El blob de fetch
  // es del mismo origen, así que el canvas siempre se puede leer.
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resuelve null sin URL o si la descarga falla", async () => {
    expect(await preblurUrlToDataUrl("")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502 })),
    );
    expect(await preblurUrlToDataUrl("http://127.0.0.1:8765/x")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await preblurUrlToDataUrl("http://127.0.0.1:8765/x")).toBeNull();
  });

  it("descarta respuestas que no son imagen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["<html></html>"], { type: "text/html" }),
      })),
    );
    expect(await preblurUrlToDataUrl("http://127.0.0.1:8765/x")).toBeNull();
  });

  it("difumina el bitmap y lo cierra", async () => {
    const bitmap = { width: 640, height: 360, close: vi.fn() };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["jpg"], { type: "image/jpeg" }),
      })),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    const ctx = { filter: "", drawImage: vi.fn(), imageSmoothingQuality: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,x");

    const url = await preblurUrlToDataUrl("http://127.0.0.1:8765/thumbnail-proxy?url=x");

    expect(url).toBe("data:image/webp;base64,x");
    // jsdom: innerWidth=1024 → ancho 960 y alto 540
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 960, 540);
    expect(ctx.filter).toContain("blur(");
    expect(bitmap.close).toHaveBeenCalled();
  });
});

describe("filtroCanvasSoportado — WebKitGTK ignora ctx.filter al rasterizar", () => {
  // Regresión real (CachyOS, 2026-10-24): el motor devuelve el filtro que se
  // le asigna —`ctx.filter` lee "blur(10px)"— pero NO lo aplica al dibujar
  // (tira del borde [0,…,0,255,…,255] probada en `<canvas>` y en
  // OffscreenCanvas, con fillRect y con drawImage). El pre-difuminado salía
  // NÍTIDO, `bgBlurUrl` quedaba con valor y la capa de Letras retiraba su
  // `filter` CSS de respaldo: el fondo de la pantalla de letras se veía sin
  // desenfoque con el vídeo apagado. El filtro CSS sí funciona en ese motor
  // (rampa 22→254 medida con snapshot del WebView).
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Contexto cuyo píxel de borde queda en `valor` tras dibujar con filtro. */
  const ctxMedible = (valor) => ({
    fillStyle: "",
    filter: "",
    fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray([valor, valor, valor, 255]) }),
  });

  it("devuelve false si el filtro no entremezcla el borde, y nada de pre-difuminado", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxMedible(255));

    expect(filtroCanvasSoportado()).toBe(false);
    // Una data URL nítida taparía el respaldo CSS y dejaría la portada a vista.
    expect(await preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 })).toBeNull();
    // …y ni siquiera merece la descarga de la miniatura.
    expect(await preblurUrlToDataUrl("http://127.0.0.1:8765/thumbnail-proxy?url=x")).toBeNull();
  });

  it("devuelve true si el borde queda entremezclado (motor con filtro operativo)", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxMedible(128));
    expect(filtroCanvasSoportado()).toBe(true);
  });

  it("asume que funciona cuando no se puede medir (motores sin getImageData)", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      filter: "",
      drawImage: vi.fn(),
    });
    expect(filtroCanvasSoportado()).toBe(true);
  });
});
