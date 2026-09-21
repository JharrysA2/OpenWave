import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDynamicTheme } from "./useDynamicTheme";

// ═══════════════════════════════════════════════════════════════════════════════
//  Extracción de colores: vía canvas (con Image + canvas mockeados)
// ═══════════════════════════════════════════════════════════════════════════════

const SETTINGS = {
  dynamicTheme: true,
  pureBlack: false,
  colorTransitionSpeed: 0, // sin transición CSS → el color se aplica de inmediato
  cornerRadius: 12,
};

const songA = {
  videoId: "vidAAA",
  title: "A",
  artist: "X",
  thumbnail: "https://i.ytimg.com/vi/vidAAA/hqdefault.jpg",
};

const songB = {
  videoId: "vidBBB",
  title: "B",
  artist: "Y",
  thumbnail: "https://i.ytimg.com/vi/vidBBB/hqdefault.jpg",
};

// ── Helpers de color ─────────────────────────────────────────────────────────

/** Pinta un canvas 64x64 repitiendo el patrón de píxeles dado. */
function makePixels(pattern) {
  const total = 64 * 64;
  const data = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i++) {
    const [r, g, b] = pattern[i % pattern.length];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Hue (0-360) de un hex, para comparar sin depender del boost de saturación. */
function hueOf(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hueDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// ── Mocks de Image / canvas ──────────────────────────────────────────────────

let createdImages = [];
let pixelPattern = [];

class FakeImage {
  constructor() {
    this.crossOrigin = null;
    this.onload = null;
    this.onerror = null;
    this._src = null;
    createdImages.push(this);
  }

  set src(value) {
    this._src = value;
  }

  get src() {
    return this._src;
  }
}

let fakeCtx;
let fakeCanvas;

function installCanvasMock() {
  fakeCtx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: makePixels(pixelPattern) })),
  };
  fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => fakeCtx),
  };

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, ...rest) =>
    tag === "canvas" ? fakeCanvas : originalCreateElement(tag, ...rest),
  );
}

/** Carga la última imagen creada (simula el onload del navegador). */
async function fireLastImageLoad() {
  const img = createdImages[createdImages.length - 1];
  await act(async () => {
    img.onload?.();
  });
  return img;
}

beforeEach(() => {
  createdImages = [];
  // El rojo es mayoritario y muy saturado (peso OKLCH C²×ventanaL); azul y
  // ámbar existen para que el histograma de tono no sea de un solo bin.
  pixelPattern = [
    [200, 40, 40],
    [200, 40, 40],
    [200, 40, 40],
    [40, 120, 200],
    [240, 190, 60],
  ];
  vi.stubGlobal("Image", FakeImage);
  installCanvasMock();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════════

describe("useDynamicTheme — extracción por canvas", () => {
  it("sin canción usa el acento por defecto", () => {
    const { result } = renderHook(() => useDynamicTheme({ settings: SETTINGS, currentSong: null }));

    expect(result.current.neonColor).toBe("#a78bfa");
    expect(result.current.hasAccent).toBeFalsy();
    expect(createdImages).toHaveLength(0);
  });

  it("con dynamicTheme apagado no extrae nada", () => {
    const { result } = renderHook(() =>
      useDynamicTheme({
        settings: { ...SETTINGS, dynamicTheme: false },
        currentSong: songA,
      }),
    );

    expect(createdImages).toHaveLength(0);
    expect(result.current.neonColor).toBe("#a78bfa");
  });

  it("extrae el color dominante cuando la API no devuelve colores", async () => {
    const { result } = renderHook(() =>
      useDynamicTheme({ settings: SETTINGS, currentSong: songA }),
    );

    // El hook pide la portada directa (sin CORS taint gracias a crossOrigin)
    expect(createdImages).toHaveLength(1);
    expect(createdImages[0].src).toBe(songA.thumbnail);
    expect(createdImages[0].crossOrigin).toBe("anonymous");

    await fireLastImageLoad();

    expect(fakeCtx.drawImage).toHaveBeenCalled();
    expect(result.current.neonColor).not.toBe("#a78bfa");
    // El rojo dominante conserva su hue (el boost solo toca saturación/luz)
    expect(hueDistance(hueOf(result.current.neonColor), 0)).toBeLessThan(25);
    expect(result.current.hasAccent).toBe(true);
  });

  it("ignora píxeles casi-blancos y casi-grises al elegir el dominante", async () => {
    // 50% blanco + 25% gris + azul/rojo/ámbar: los filtros deben descartar
    // blanco y gris para que gane un color vivo (el bug que se documentó).
    pixelPattern = [
      [250, 250, 250],
      [150, 150, 150],
      [30, 80, 220],
      [30, 80, 220],
      [220, 60, 40],
      [240, 180, 40],
    ];

    const { result } = renderHook(() =>
      useDynamicTheme({ settings: SETTINGS, currentSong: songA }),
    );
    await fireLastImageLoad();

    const hue = hueOf(result.current.neonColor);
    expect(result.current.neonColor).not.toBe("#ffffff");
    expect(result.current.neonColor).not.toBe("#a78bfa");
    // Gana el azul (mayoría tras filtrar), no el blanco ni el gris
    expect(hueDistance(hue, 226)).toBeLessThan(30);
  });

  it("reintenta vía proxy del backend si la carga directa falla", async () => {
    const { result } = renderHook(() =>
      useDynamicTheme({ settings: SETTINGS, currentSong: songA }),
    );

    const direct = createdImages[0];
    expect(direct.src).toBe(songA.thumbnail);

    await act(async () => {
      direct.onerror?.();
    });

    // Se creó una segunda Image apuntando al proxy
    expect(createdImages).toHaveLength(2);
    const proxied = createdImages[1];
    expect(proxied.src).toContain("/thumbnail-proxy");
    expect(proxied.src).toContain(encodeURIComponent(songA.thumbnail));

    await fireLastImageLoad();
    expect(result.current.neonColor).not.toBe("#a78bfa");
  });

  it("no reintenta por proxy dos veces: falla en silencio", async () => {
    const { result } = renderHook(() =>
      useDynamicTheme({ settings: SETTINGS, currentSong: songA }),
    );

    await act(async () => {
      createdImages[0].onerror?.();
    });
    await act(async () => {
      createdImages[1].onerror?.();
    });

    expect(createdImages).toHaveLength(2);
    expect(result.current.neonColor).toBe("#a78bfa");
  });

  it("descarta la extracción de una canción ya reemplazada", async () => {
    const { result, rerender } = renderHook(
      ({ song }) => useDynamicTheme({ settings: SETTINGS, currentSong: song }),
      { initialProps: { song: songA } },
    );

    const imageForA = createdImages[createdImages.length - 1];

    // El usuario salta a otra canción antes de que cargue la portada anterior
    rerender({ song: songB });

    await act(async () => {
      imageForA.onload?.(); // respuesta tardía de la canción A
    });
    expect(result.current.neonColor).toBe("#a78bfa");

    // La portada de B sí se aplica
    await fireLastImageLoad();
    expect(result.current.neonColor).not.toBe("#a78bfa");
  });

  it("cae al tema acromático (blanco) cuando la imagen no tiene croma suficiente", async () => {
    // Imagen prácticamente en blanco: todos los píxeles son acromáticos (C < 0.04)
    pixelPattern = [
      [255, 255, 255],
      [250, 250, 250],
      [245, 245, 245],
    ];

    const { result } = renderHook(() =>
      useDynamicTheme({ settings: SETTINGS, currentSong: songA }),
    );
    await fireLastImageLoad();

    // extractOklchAccent → null → ACHROMATIC_THEME: acento blanco puro
    expect(result.current.neonColor).toBe("#ffffff");
    expect(result.current.hasAccent).toBe(true);
  });
});
