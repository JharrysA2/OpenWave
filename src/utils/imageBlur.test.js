import { describe, it, expect, vi, afterEach } from "vitest";
import { preblurToDataUrl } from "./imageBlur";

describe("preblurToDataUrl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve null si la imagen no tiene dimensiones", () => {
    expect(preblurToDataUrl(null)).toBeNull();
    expect(preblurToDataUrl({})).toBeNull();
    expect(preblurToDataUrl({ naturalWidth: 0, naturalHeight: 100 })).toBeNull();
  });

  it("dibuja con la cadena de filtros del fondo y devuelve la data URL", () => {
    const ctx = { filter: "", drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,x");

    const url = preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 });

    expect(url).toBe("data:image/jpeg;base64,x");
    expect(ctx.filter).toContain("blur(2px)");
    expect(ctx.filter).toContain("saturate(1.2)");
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 320, 180);
  });

  it("devuelve null si toDataURL lanza (canvas contaminado por CORS)", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      filter: "",
      drawImage: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new Error("Tainted canvases may not be exported");
    });

    expect(preblurToDataUrl({ naturalWidth: 640, naturalHeight: 360 })).toBeNull();
  });
});
