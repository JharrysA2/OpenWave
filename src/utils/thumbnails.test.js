import { describe, it, expect } from "vitest";
import {
  generateThumbsHD,
  withHDThumbnails,
  withLocalCover,
  localCoverUrl,
  getCoverSources,
  googleThumbBase,
  googleThumbnails,
  isGoogleThumbUrl,
  isYoutubeThumbUrl,
  ytThumbUrl,
  ytThumbnails,
  youtubeVideoIdFromUrl,
  YT_THUMB_SIZES,
  GOOGLE_THUMB_SIZES,
} from "./thumbnails";

const GOOGLE_URL = "https://lh3.googleusercontent.com/abc=h120";
const YT_URL = "https://i.ytimg.com/vi/test123/hqdefault.jpg";

describe("thumbnails — detección de URLs", () => {
  it("detects googleusercontent URLs", () => {
    expect(isGoogleThumbUrl(GOOGLE_URL)).toBe(true);
    expect(isGoogleThumbUrl(YT_URL)).toBe(false);
    expect(isGoogleThumbUrl(undefined)).toBe(false);
  });

  it("detects youtube thumbnail URLs", () => {
    expect(isYoutubeThumbUrl(YT_URL)).toBe(true);
    expect(isYoutubeThumbUrl(GOOGLE_URL)).toBe(false);
    expect(isYoutubeThumbUrl(null)).toBe(false);
  });

  it("extracts the videoId from a youtube URL", () => {
    expect(youtubeVideoIdFromUrl(YT_URL)).toBe("test123");
    expect(youtubeVideoIdFromUrl("https://i.ytimg.com/vi/a_B-1c/mqdefault.jpg")).toBe("a_B-1c");
    expect(youtubeVideoIdFromUrl(GOOGLE_URL)).toBeNull();
    expect(youtubeVideoIdFromUrl(undefined)).toBeNull();
  });

  it("strips google size parameters to build the base URL", () => {
    expect(googleThumbBase(GOOGLE_URL)).toBe("https://lh3.googleusercontent.com/abc");
    expect(googleThumbBase(YT_URL)).toBeNull();
  });
});

describe("thumbnails — generadores", () => {
  it("builds a youtube URL for a given resolution", () => {
    expect(ytThumbUrl("vid1", "maxresdefault")).toBe(
      "https://i.ytimg.com/vi/vid1/maxresdefault.jpg",
    );
    expect(ytThumbUrl(null, "hqdefault")).toBeNull();
  });

  it("generates 4 youtube sizes sorted from largest to smallest", () => {
    const thumbs = ytThumbnails("vid1");
    expect(thumbs).toHaveLength(4);
    expect(thumbs.map((t) => t.width)).toEqual([1280, 640, 480, 320]);
    expect(thumbs[0].url).toContain("maxresdefault.jpg");
    expect(thumbs[thumbs.length - 1].url).toContain("mqdefault.jpg");
    expect(thumbs.map((t) => t.height)).toEqual([720, 480, 360, 180]);
    expect(ytThumbnails(null)).toBeNull();
  });

  it("generates 5 google sizes sorted from smallest to largest", () => {
    const thumbs = googleThumbnails(GOOGLE_URL);
    expect(thumbs).toHaveLength(GOOGLE_THUMB_SIZES.length);
    expect(thumbs.map((t) => t.width)).toEqual([120, 226, 576, 1200, 2048]);
    expect(thumbs[0].url).toBe("https://lh3.googleusercontent.com/abc=w120-h120-l90-rj");
    expect(googleThumbnails(YT_URL)).toBeNull();
  });

  it("generateThumbsHD prefers google over videoId", () => {
    const thumbs = generateThumbsHD(GOOGLE_URL, "vid1");
    expect(thumbs).toHaveLength(5);
    expect(thumbs[0].url).toContain("googleusercontent");
  });

  it("generateThumbsHD reads the videoId out of a youtube URL", () => {
    const thumbs = generateThumbsHD(YT_URL, undefined);
    expect(thumbs).toHaveLength(YT_THUMB_SIZES.length);
    expect(thumbs[0].url).toBe("https://i.ytimg.com/vi/test123/maxresdefault.jpg");
  });

  it("generateThumbsHD falls back to the raw videoId for unknown URLs", () => {
    const thumbs = generateThumbsHD("https://example.com/broken.jpg", "vid9");
    expect(thumbs).toHaveLength(4);
    expect(thumbs[0].url).toContain("/vi/vid9/");
  });

  it("generateThumbsHD returns null when there is nothing to work with", () => {
    expect(generateThumbsHD(undefined, undefined)).toBeNull();
    expect(generateThumbsHD("", null)).toBeNull();
  });
});

describe("thumbnails — withHDThumbnails", () => {
  it("adds HD thumbnails and points thumbnail at the smallest size", () => {
    const song = { videoId: "vid1", thumbnail: YT_URL };
    const result = withHDThumbnails(song);
    expect(result.thumbnails).toHaveLength(4);
    expect(result.thumbnail).toBe(result.thumbnails[result.thumbnails.length - 1].url);
    expect(result.thumbnail).toContain("mqdefault.jpg");
  });

  it("points thumbnail at the max-quality guaranteed source of each provider", () => {
    // YouTube: mqdefault existe siempre (maxresdefault suele 404ear)
    expect(withHDThumbnails({ videoId: "v", thumbnail: YT_URL }).thumbnail).toContain(
      "mqdefault.jpg",
    );
    // Google: sirve cualquier tamaño bajo demanda → se usa el mayor (2048)
    expect(withHDThumbnails({ videoId: "v", thumbnail: GOOGLE_URL }).thumbnail).toContain(
      "w2048-h2048",
    );
  });

  it("keeps an existing thumbnails array with 2+ entries untouched", () => {
    const existing = [
      { url: "https://example.com/a.jpg", width: 500, height: 500 },
      { url: "https://example.com/b.jpg", width: 100, height: 100 },
    ];
    const song = { videoId: "vid1", thumbnails: existing };
    expect(withHDThumbnails(song)).toBe(song);
  });

  it("regenerates when the thumbnails array has a single entry", () => {
    const song = {
      videoId: "vid1",
      thumbnails: [{ url: "https://example.com/only.jpg", width: 60, height: 60 }],
    };
    const result = withHDThumbnails(song);
    expect(result.thumbnails).toHaveLength(4);
  });

  it("returns the song untouched when there is no videoId", () => {
    const song = { thumbnail: YT_URL };
    expect(withHDThumbnails(song)).toBe(song);
    expect(withHDThumbnails(null)).toBeNull();
  });

  it("generates HD from googleusercontent before falling back to videoId", () => {
    const result = withHDThumbnails({ videoId: "vid1", thumbnail: GOOGLE_URL });
    expect(result.thumbnails).toHaveLength(5);
    // Google genera cualquier tamaño, así que se usa el máximo disponible
    expect(result.thumbnail).toContain("w2048-h2048");
  });

  it("does not add thumbnails when nothing can be generated", () => {
    const song = { videoId: "vid1" };
    const result = withHDThumbnails(song);
    // videoId siempre permite generar, así que aquí sí hay thumbnails...
    expect(result.thumbnails).toHaveLength(4);
    // ...pero una canción sin videoId ni URL no se toca
    const empty = { title: "no id" };
    expect(withHDThumbnails(empty)).toBe(empty);
  });
});

describe("thumbnails — getCoverSources", () => {
  it("returns empty sources when there is no thumbnail and no src", () => {
    expect(getCoverSources()).toEqual({ allSrcs: [], srcSetStr: "", blurSrc: "" });
    expect(getCoverSources({ thumbnails: [] })).toEqual({
      allSrcs: [],
      srcSetStr: "",
      blurSrc: "",
    });
  });

  it("uses a thumbnails array: fallback desc, srcset asc, blur = smallest", () => {
    const thumbnails = [
      { url: "https://example.com/small.jpg", width: 120, height: 120 },
      { url: "https://example.com/huge.jpg", width: 1200, height: 1200 },
      { url: "https://example.com/medium.jpg", width: 576, height: 576 },
    ];
    const { allSrcs, srcSetStr, blurSrc } = getCoverSources({ thumbnails });

    expect(allSrcs).toEqual([
      "https://example.com/huge.jpg",
      "https://example.com/medium.jpg",
      "https://example.com/small.jpg",
    ]);
    expect(srcSetStr.split(", ")).toEqual([
      "https://example.com/small.jpg 120w",
      "https://example.com/medium.jpg 576w",
      "https://example.com/huge.jpg 1200w",
    ]);
    expect(blurSrc).toBe("https://example.com/small.jpg");
  });

  it("sorts thumbnails without width as 0w instead of throwing", () => {
    const { allSrcs, srcSetStr } = getCoverSources({
      thumbnails: [
        { url: "https://example.com/a.jpg" },
        { url: "https://example.com/b.jpg", width: 500 },
      ],
    });
    expect(allSrcs[0]).toBe("https://example.com/b.jpg");
    expect(srcSetStr).toContain("0w");
  });

  it("expands a google src into 5 sizes", () => {
    const { allSrcs, srcSetStr, blurSrc } = getCoverSources({ src: GOOGLE_URL });
    expect(allSrcs).toHaveLength(5);
    expect(allSrcs[0]).toContain("w2048");
    expect(srcSetStr.split(", ")).toHaveLength(5);
    expect(srcSetStr.split(", ")[0]).toContain("w120");
    expect(blurSrc).toContain("w120");
  });

  it("expands a youtube src into 4 sizes", () => {
    const { allSrcs, srcSetStr, blurSrc } = getCoverSources({ src: YT_URL });
    expect(allSrcs).toEqual([
      "https://i.ytimg.com/vi/test123/maxresdefault.jpg",
      "https://i.ytimg.com/vi/test123/sddefault.jpg",
      "https://i.ytimg.com/vi/test123/hqdefault.jpg",
      "https://i.ytimg.com/vi/test123/mqdefault.jpg",
    ]);
    expect(srcSetStr).toContain("maxresdefault.jpg 1280w");
    expect(blurSrc).toContain("mqdefault.jpg");
  });

  it("passes through an unknown src untouched", () => {
    const src = "https://example.com/cover.jpg";
    expect(getCoverSources({ src })).toEqual({ allSrcs: [src], srcSetStr: "", blurSrc: src });
  });

  it("prefers the thumbnails array over src when both are given", () => {
    const { allSrcs } = getCoverSources({
      thumbnails: [{ url: "https://example.com/array.jpg", width: 300, height: 300 }],
      src: YT_URL,
    });
    expect(allSrcs).toEqual(["https://example.com/array.jpg"]);
  });
});

describe("thumbnails — portada local (canciones descargadas)", () => {
  const localSong = {
    videoId: "abc",
    thumbnail: "https://i.ytimg.com/vi/abc/mqdefault.jpg",
    downloaded: true,
    coverLocal: "/music/covers/abc.jpg",
    thumbnails: [
      { url: "https://i.ytimg.com/vi/abc/maxresdefault.jpg", width: 1280, height: 720 },
      { url: "https://i.ytimg.com/vi/abc/mqdefault.jpg", width: 320, height: 180 },
    ],
  };

  it("localCoverUrl resuelve contra la API base y exige downloaded", () => {
    expect(localCoverUrl(localSong)).toBe("http://127.0.0.1:8765/music/covers/abc.jpg");
    expect(localCoverUrl({ ...localSong, downloaded: false })).toBeNull();
    expect(localCoverUrl({ ...localSong, coverLocal: "" })).toBeNull();
    expect(localCoverUrl(null)).toBeNull();
    // URLs absolutas se respetan tal cual
    expect(localCoverUrl({ ...localSong, coverLocal: "http://127.0.0.1:8765/other.jpg" })).toBe(
      "http://127.0.0.1:8765/other.jpg",
    );
  });

  it("withLocalCover inserta la portada local como PRIMERA fuente", () => {
    const out = withLocalCover(localSong);
    expect(out.thumbnails).toHaveLength(3);
    expect(out.thumbnails[0].url).toBe("http://127.0.0.1:8765/music/covers/abc.jpg");
    expect(out.thumbnails[0].width).toBeGreaterThan(out.thumbnails[1].width);
    // El resto de campos intactos
    expect(out.thumbnail).toBe(localSong.thumbnail);
    expect(out.downloaded).toBe(true);
  });

  it("withLocalCover es idempotente (misma identidad si ya está inyectada)", () => {
    const once = withLocalCover(localSong);
    const twice = withLocalCover(once);
    expect(twice).toBe(once);
  });

  it("withLocalCover no hace nada sin download/coverLocal", () => {
    const notDownloaded = { ...localSong, downloaded: false };
    expect(withLocalCover(notDownloaded)).toBe(notDownloaded);
    const noCover = { ...localSong, coverLocal: "" };
    expect(withLocalCover(noCover)).toBe(noCover);
  });

  it("withHDThumbnails inyecta la local incluso con thumbnails[] 2+ ya existentes", () => {
    const out = withHDThumbnails(localSong);
    expect(out.thumbnails[0].url).toContain("/music/covers/abc.jpg");
    // `thumbnail` (src directo / colores) sigue en la fuente remota garantizada
    expect(out.thumbnail).toBe("https://i.ytimg.com/vi/abc/mqdefault.jpg");
  });

  it("con thumbnails[] generados, la local sigue siendo la primera del srcset", () => {
    const out = withHDThumbnails({
      videoId: "gen1",
      thumbnail: YT_URL,
      downloaded: true,
      coverLocal: "/music/covers/gen1.jpg",
    });
    const { allSrcs } = getCoverSources(out);
    expect(allSrcs[0]).toContain("/music/covers/gen1.jpg");
    expect(allSrcs.length).toBeGreaterThan(1);
  });

  it("canción NO descargada: sin inyección (todo remoto)", () => {
    const out = withHDThumbnails({ ...localSong, downloaded: false });
    expect(out.thumbnails).toHaveLength(2);
    expect(out.thumbnails.some((t) => t.url.includes("/music/covers/"))).toBe(false);
  });
});
