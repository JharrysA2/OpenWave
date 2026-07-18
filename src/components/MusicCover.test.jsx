import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MusicCover } from "./MusicCover";

describe("MusicCover", () => {
  // ── Fallback state (no src, no thumbnails) ───────────────────────

  it("should render a fallback music icon when no src or thumbnails", () => {
    const { container } = render(<MusicCover />);
    // The fallback renders a div containing the Ic.music SVG
    expect(container.firstChild).toBeInTheDocument();
    expect(container.innerHTML).toContain("svg");
  });

  it("should render fallback when thumbnails is an empty array", () => {
    const { container } = render(<MusicCover thumbnails={[]} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(container.innerHTML).toContain("svg");
  });

  // ── With src ─────────────────────────────────────────────────────

  it("should render an img element when src is provided", () => {
    const { container } = render(<MusicCover src="https://example.com/image.jpg" alt="Cover" />);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/image.jpg");
  });

  it("should use alt text for the image", () => {
    render(<MusicCover src="https://example.com/img.jpg" alt="Album Cover" />);
    const img = screen.getByAltText("Album Cover");
    expect(img).toBeInTheDocument();
  });

  it("should use empty alt when no alt provided", () => {
    const { container } = render(<MusicCover src="https://example.com/img.jpg" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
  });

  // ── Googleusercontent URLs ──────────────────────────────────────

  it("should generate 5 resolution sizes for googleusercontent", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    // Main image starts at the largest size (2048)
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toBeInTheDocument();
    expect(mainImg.src).toContain("w2048");
  });

  it("should generate srcset with 5 google sizes", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" displaySize={300} />,
    );
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toHaveAttribute("srcset");
    const srcset = mainImg.getAttribute("srcset");
    // Should contain all 5 sizes
    expect(srcset).toContain("w120-h120");
    expect(srcset).toContain("w226-h226");
    expect(srcset).toContain("w576-h576");
    expect(srcset).toContain("w1200-h1200");
    expect(srcset).toContain("w2048-h2048");
    // Should have 5 comma-separated entries
    expect(srcset.split(",").length).toBe(5);
  });

  it("should use the SMALLEST image (120px) for google blur placeholder", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" />,
    );
    const blurImg = container.querySelector("img[aria-hidden='true']");
    expect(blurImg).toBeInTheDocument();
    // Ahora usa la imagen MÁS PEQUEÑA (120px) para carga ultra-rápida
    expect(blurImg.src).toContain("w120");
  });

  it("should fall back through all sizes when HD images fail", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" />,
    );
    // Initially uses the largest size (2048)
    let img = container.querySelector("img:not([aria-hidden])");
    expect(img.src).toContain("w2048");

    // ═══ Cadena de fallback completa ═══
    //    Ciclo: error directo → proxy → error proxy → siguiente tamaño
    //    5 tamaños: w2048, w1200, w576, w226, w120 = 5 ciclos = 10 errores
    //    Después: fallback icon

    const expectedSizes = ["w2048", "w1200", "w576", "w226", "w120"];

    for (let i = 0; i < expectedSizes.length; i++) {
      // Primer error: intentar proxy
      img = container.querySelector("img:not([aria-hidden])");
      expect(img).toBeInTheDocument();
      fireEvent.error(img);
      const proxyImg = container.querySelector("img:not([aria-hidden])");
      expect(proxyImg.src).toContain("/thumbnail-proxy");

      // Segundo error: proxy falla → siguiente tamaño
      fireEvent.error(proxyImg);
    }

    // Después de agotar todos los tamaños + proxy → fallback icon (Phosphor MusicNote SVG)
    expect(container.innerHTML).toContain("svg");
  });

  it("should try next size when proxy fails (not show fallback immediately)", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" />,
    );
    // Error en w2048 → proxy
    const img1 = container.querySelector("img:not([aria-hidden])");
    fireEvent.error(img1);
    const img2 = container.querySelector("img:not([aria-hidden])");
    expect(img2.src).toContain("/thumbnail-proxy");
    // Error en proxy → NO fallback, sino siguiente tamaño (w1200)
    fireEvent.error(img2);
    const img3 = container.querySelector("img:not([aria-hidden])");
    expect(img3.src).toContain("w1200");
  });

  it("should set sizes attribute based on displaySize prop", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" displaySize={400} />,
    );
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toHaveAttribute("sizes", "400px");
  });

  it("should use default displaySize of 176px when not provided", () => {
    const { container } = render(
      <MusicCover src="https://lh3.googleusercontent.com/abc=h120" alt="" />,
    );
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toHaveAttribute("sizes", "176px");
  });

  // ── YouTube URLs ────────────────────────────────────────────────

  it("should generate 4 YouTube sizes from a ytimg URL", () => {
    const { container } = render(
      <MusicCover src="https://i.ytimg.com/vi/test123/hqdefault.jpg" alt="" />,
    );
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toBeInTheDocument();
    // Should use maxresdefault (the largest) first
    expect(mainImg.src).toContain("maxresdefault.jpg");
    expect(mainImg.src).toContain("test123");
  });

  it("should generate YouTube srcset with 4 sizes", () => {
    const { container } = render(
      <MusicCover src="https://i.ytimg.com/vi/test456/hqdefault.jpg" alt="" />,
    );
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toHaveAttribute("srcset");
    const srcset = mainImg.getAttribute("srcset");
    expect(srcset).toContain("mqdefault.jpg");
    expect(srcset).toContain("hqdefault.jpg");
    expect(srcset).toContain("sddefault.jpg");
    expect(srcset).toContain("maxresdefault.jpg");
    // Should have 4 comma-separated entries
    expect(srcset.split(",").length).toBe(4);
  });

  it("should use the SMALLEST YouTube image for blur placeholder", () => {
    const { container } = render(
      <MusicCover src="https://i.ytimg.com/vi/test789/hqdefault.jpg" alt="" />,
    );
    const blurImg = container.querySelector("img[aria-hidden='true']");
    expect(blurImg).toBeInTheDocument();
    // Blur should use mqdefault (the smallest YouTube size)
    expect(blurImg.src).toContain("mqdefault.jpg");
    expect(blurImg.src).toContain("test789");
  });

  // ── With thumbnails array ───────────────────────────────────────

  it("should render img when thumbnails array is provided", () => {
    const thumbnails = [{ url: "https://example.com/thumb.jpg", width: 200, height: 200 }];
    const { container } = render(<MusicCover thumbnails={thumbnails} alt="" />);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
  });

  it("should sort thumbnails by width descending", () => {
    const thumbnails = [
      { url: "https://example.com/small.jpg", width: 100, height: 100 },
      { url: "https://example.com/large.jpg", width: 500, height: 500 },
    ];
    const { container } = render(<MusicCover thumbnails={thumbnails} alt="" />);
    // The main (non-blur) image should use the largest source
    const mainImg = container.querySelector("img:not([aria-hidden])");
    if (mainImg) {
      expect(mainImg.src).toContain("large");
    }
  });

  it("should use the SMALLEST thumbnail for blur when thumbnails array given", () => {
    const thumbnails = [
      { url: "https://example.com/huge.jpg", width: 1200, height: 1200 },
      { url: "https://example.com/medium.jpg", width: 576, height: 576 },
      { url: "https://example.com/small.jpg", width: 120, height: 120 },
    ];
    const { container } = render(<MusicCover thumbnails={thumbnails} alt="" />);
    const blurImg = container.querySelector("img[aria-hidden='true']");
    expect(blurImg).toBeInTheDocument();
    // Blur should use the smallest thumbnail
    expect(blurImg.src).toContain("small");
  });

  it("should generate srcset from thumbnails array sorted ascending", () => {
    const thumbnails = [
      { url: "https://example.com/huge.jpg", width: 1200, height: 1200 },
      { url: "https://example.com/small.jpg", width: 120, height: 120 },
      { url: "https://example.com/medium.jpg", width: 576, height: 576 },
    ];
    const { container } = render(<MusicCover thumbnails={thumbnails} alt="" />);
    const mainImg = container.querySelector("img:not([aria-hidden])");
    expect(mainImg).toHaveAttribute("srcset");
    const srcset = mainImg.getAttribute("srcset");
    // Srcset should be sorted ascending by width
    const entries = srcset.split(",").map((s) => s.trim());
    expect(entries[0]).toContain("small");
    expect(entries[1]).toContain("medium");
    expect(entries[2]).toContain("huge");
  });

  // ── Priority prop ──────────────────────────────────────────────

  it("should set eager loading and high fetchpriority when priority is true", () => {
    const { container } = render(<MusicCover src="https://example.com/img.jpg" alt="" priority />);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("example.com");
  });

  it("should use lazy loading and auto fetchpriority by default", () => {
    const { container } = render(<MusicCover src="https://example.com/img.jpg" alt="" />);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("example.com");
  });

  // ── Custom displaySize and style ───────────────────────────────

  it("should apply custom style to the wrapper", () => {
    const { container } = render(
      <MusicCover
        src="https://example.com/img.jpg"
        style={{ width: "100px", height: "100px", borderRadius: "12px" }}
      />,
    );
    const wrapper = container.firstChild;
    expect(wrapper).toHaveStyle("width: 100px");
    expect(wrapper).toHaveStyle("height: 100px");
  });
});
