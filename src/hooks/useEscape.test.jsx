import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useEscClose, useEscBack } from "./useEscape";
import { useOverlayLayer } from "./useOverlayLayer";

/**
 * useEscape — ESC repartido entre overlays (pila, solo el más alto) y la
 * navegación «atrás» de la app (que cede siempre que haya una capa encima).
 */

/** Capa descartable de prueba: registra su `close` en la pila de ESC. */
function Layer({ name, onClose }) {
  useEscClose(true, onClose);
  return <div data-testid={name}>{name}</div>;
}

/** Escucha de navegación «atrás». */
function BackProbe({ onBack }) {
  useEscBack(onBack);
  return <div data-testid="probe">probe</div>;
}

/** Capa con useOverlayLayer pero SIN registro en la pila de ESC (solo respaldo). */
function SoloOverlayLayer() {
  useOverlayLayer(true);
  return <div data-testid="solo-overlay">x</div>;
}

const pressEsc = () => fireEvent.keyDown(window, { key: "Escape" });

describe("useEscClose — pila de overlays", () => {
  it("solo el overlay más alto recibe ESC (el de abajo queda intacto)", () => {
    const top = vi.fn();
    const bottom = vi.fn();
    render(
      <>
        <Layer name="bottom" onClose={bottom} />
        <Layer name="top" onClose={top} />
      </>,
    );

    pressEsc();
    expect(top).toHaveBeenCalledTimes(1);
    expect(bottom).not.toHaveBeenCalled();
  });

  it("al desmontarse la capa, el ESC siguiente baja un nivel", () => {
    const top = vi.fn();
    const bottom = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <Layer name="bottom" onClose={bottom} />
          {open && <Layer name="top" onClose={top} />}
          <button onClick={() => setOpen(false)}>cerrar</button>
        </>
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByText("cerrar"));
    pressEsc();
    expect(top).not.toHaveBeenCalled();
    expect(bottom).toHaveBeenCalledTimes(1);
  });

  it("active=false no registra la capa", () => {
    const close = vi.fn();
    function Inactive() {
      useEscClose(false, close);
      return null;
    }
    render(<Inactive />);
    pressEsc();
    expect(close).not.toHaveBeenCalled();
  });

  it("el handler se actualiza sin re-registrar (close leído en ref)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Layer name="l" onClose={first} />);
    rerender(<Layer name="l" onClose={second} />);
    pressEsc();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("preventDefault al manejar el ESC (para que nada encima actúe)", () => {
    render(<Layer name="only" onClose={() => {}} />);
    const ev = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("useEscBack — navegación atrás", () => {
  it("sin overlays, ESC navega atrás", () => {
    const back = vi.fn();
    render(<BackProbe onBack={back} />);
    pressEsc();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("no navega mientras haya una capa de ESC montada (ella cierra primero)", () => {
    const back = vi.fn();
    const close = vi.fn();
    render(
      <>
        <Layer name="modal" onClose={close} />
        <BackProbe onBack={back} />
      </>,
    );

    pressEsc();
    expect(close).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it("respaldo: con solo html.overlay-open (capa sin ESC) tampoco navega", () => {
    const back = vi.fn();
    render(
      <>
        <SoloOverlayLayer />
        <BackProbe onBack={back} />
      </>,
    );
    // Pila de ESC vacía, pero useOverlayLayer activo: la navegación cede
    // (nunca se navega debajo de una capa montada, registrada o no).
    pressEsc();
    expect(back).not.toHaveBeenCalled();
  });

  it("foco editable: la 1ª ESC sale del campo y la 2ª navega", () => {
    const back = vi.fn();
    render(<BackProbe onBack={back} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    pressEsc();
    expect(back).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input); // blur

    pressEsc();
    expect(back).toHaveBeenCalledTimes(1);
    input.remove();
  });
});
