import { describe, it, expect, vi, afterEach } from "vitest";
import { preblurToDataUrl } from "./imageBlur";

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
