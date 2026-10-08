import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useDragScroll } from "./useDragScroll";

/**
 * useDragScroll — arrastre horizontal de las bandas de la home.
 * jsdom guarda `scrollLeft` como propiedad simple, así que el resultado del
 * arrastre se puede asertar directamente.
 */

function ShelfProbe({ onCardClick }) {
  const { ref, onMouseDown, onClickCapture, onDragStart } = useDragScroll();
  return (
    <div
      data-testid="shelf"
      ref={ref}
      onMouseDown={onMouseDown}
      onClickCapture={onClickCapture}
      onDragStart={onDragStart}
    >
      <button data-testid="card" onClick={onCardClick}>
        card
      </button>
    </div>
  );
}

describe("useDragScroll", () => {
  it("arrastra: mousedown + mover scrollea la banda en horizontal", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");
    shelf.scrollLeft = 40; // arrastre acumulado sobre el scroll actual

    fireEvent.mouseDown(shelf, { button: 0, clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 300 }); // dx = -100
    expect(shelf.scrollLeft).toBe(140);
    fireEvent.mouseUp(window);
  });

  it("umbral de 5 px: un micro-movimiento no arrastra y el click cuenta", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");

    fireEvent.mouseDown(shelf, { button: 0, clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 398 }); // dx = -2 < umbral
    expect(shelf.scrollLeft).toBe(0);
    fireEvent.mouseUp(window);

    fireEvent.click(screen.getByTestId("card"));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it("el click que cierra un arrastre NO activa la tarjeta; el siguiente sí", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");
    const card = screen.getByTestId("card");

    // Arrastre sobre la tarjeta → el click de cierre queda suprimido
    fireEvent.mouseDown(shelf, { button: 0, clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 250 });
    fireEvent.mouseUp(window);
    fireEvent.click(card);
    expect(onCardClick).not.toHaveBeenCalled();

    // Click normal posterior (sin arrastre) → sí activa
    fireEvent.mouseDown(shelf, { button: 0, clientX: 250 });
    fireEvent.mouseUp(window);
    fireEvent.click(card);
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it("solo el botón izquierdo inicia un arrastre", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");

    fireEvent.mouseDown(shelf, { button: 2, clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(shelf.scrollLeft).toBe(0);
    fireEvent.mouseUp(window);
  });

  it("la zona de la barra de scroll no inicia arrastre (la mueve el browser)", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");
    // Simular layout: caja de 400 px útiles + scrollbar a la derecha
    Object.defineProperty(shelf, "clientWidth", { value: 400, configurable: true });
    vi.spyOn(shelf, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 408,
      bottom: 260,
      width: 408,
      height: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(shelf, { button: 0, clientX: 405 }); // sobre la scrollbar
    fireEvent.mouseMove(window, { clientX: 200 });
    expect(shelf.scrollLeft).toBe(0);
    fireEvent.mouseUp(window);

    // Dentro de la caja, el arrastre sí funciona
    fireEvent.mouseDown(shelf, { button: 0, clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 200 });
    expect(shelf.scrollLeft).toBe(100);
    fireEvent.mouseUp(window);
  });

  it("clase .is-dragging durante el arrastre (cursor grabbing) y al soltar se quita", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");

    fireEvent.mouseDown(shelf, { button: 0, clientX: 400 });
    expect(shelf.classList.contains("is-dragging")).toBe(true);
    fireEvent.mouseUp(window);
    expect(shelf.classList.contains("is-dragging")).toBe(false);
  });

  it("anula el drag nativo de imágenes (sin fantasma al arrastrar)", () => {
    const onCardClick = vi.fn();
    render(<ShelfProbe onCardClick={onCardClick} />);
    const shelf = screen.getByTestId("shelf");
    const evt = new Event("dragstart", { cancelable: true, bubbles: true });
    shelf.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});
