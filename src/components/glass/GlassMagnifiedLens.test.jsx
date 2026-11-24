import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GlassMagnifiedLens } from "./GlassMagnifiedLens";

afterEach(() => cleanup());

const scene = {
  url: "https://example.com/cover.jpg",
  veil: "rgba(5,5,10,.6)",
  lensVeil: "rgba(5,5,10,.16)",
};

const cover = { left: -100, top: 0, width: 1200, height: 800 };

function renderLens(overrides = {}) {
  return render(
    <GlassMagnifiedLens
      width={660}
      height={94}
      radius={20}
      margin={30}
      rim={30}
      maxDisp={28}
      scene={scene}
      cover={cover}
      settings={{ glassSaturation: 1.2, glassBrightness: 1.1, glassContrast: 0.9 }}
      {...overrides}
    />,
  );
}

describe("GlassMagnifiedLens — lente geométrica de WebKit", () => {
  it("dibuja la imagen pre-escalada dentro de una máscara de anillo", () => {
    const { container } = renderLens();
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector("mask")).toBeInTheDocument();
    expect(svg.querySelector("filter feGaussianBlur")).toBeInTheDocument();

    const image = svg.querySelector("image");
    expect(image).toHaveAttribute("href", scene.url);
    // Pre-escalada: el ancho supera al de la portada.
    expect(Number(image.getAttribute("width"))).toBeGreaterThan(cover.width);
    expect(Number(image.getAttribute("height"))).toBeGreaterThan(cover.height);

    const veil = [...svg.querySelectorAll("rect")].find(
      (r) => r.getAttribute("fill") === scene.lensVeil,
    );
    expect(veil).toBeTruthy();
  });

  it("aplica saturación, brillo y contraste al cristal", () => {
    const { container } = renderLens();
    const svg = container.querySelector("svg");
    expect(svg.style.filter).toContain("saturate(1.2)");
    expect(svg.style.filter).toContain("brightness(1.1)");
    expect(svg.style.filter).toContain("contrast(0.9)");
  });

  it("no dibuja nada si falta la escena o el tamaño es inválido", () => {
    const empty = renderLens({ scene: null });
    expect(empty.container.querySelector("svg")).toBeNull();
    empty.unmount();

    const zero = renderLens({ width: 0 });
    expect(zero.container.querySelector("svg")).toBeNull();
  });
});
