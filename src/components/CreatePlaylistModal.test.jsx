import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock api ──────────────────────────────────────────────────────────────────

vi.mock("../utils/api", () => ({
  api: {
    createPlaylist: vi.fn(),
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn() }));

import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { api } from "../utils/api";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

const defaultProps = {
  open: true,
  onClose: () => {},
  onCreated: () => {},
  toast: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreatePlaylistModal", () => {
  it("should render nothing when closed", () => {
    const { container } = render(<CreatePlaylistModal {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render title, input and create button when open", () => {
    render(<CreatePlaylistModal {...defaultProps} />);
    expect(screen.getByText("Nueva playlist")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribe un nombre...")).toBeInTheDocument();
    expect(screen.getByText("Crear")).toBeInTheDocument();
  });

  it("should disable create button when name is empty", () => {
    render(<CreatePlaylistModal {...defaultProps} />);
    expect(screen.getByText("Crear").closest("button")).toBeDisabled();
  });

  it("should enable create button after typing a name", () => {
    render(<CreatePlaylistModal {...defaultProps} />);
    const input = screen.getByPlaceholderText("Escribe un nombre...");
    fireEvent.change(input, { target: { value: "Mi playlist" } });
    expect(screen.getByText("Crear").closest("button")).not.toBeDisabled();
  });

  it("should call api.createPlaylist and notify parent on create", async () => {
    const playlist = { id: 7, name: "Mi playlist" };
    api.createPlaylist.mockResolvedValue(playlist);
    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(<CreatePlaylistModal {...defaultProps} onCreated={onCreated} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("Escribe un nombre..."), {
      target: { value: "Mi playlist" },
    });
    fireEvent.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(playlist);
    });
    expect(api.createPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mi playlist" }),
      expect.any(Function),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("should not create when name is blank", async () => {
    api.createPlaylist.mockResolvedValue({ id: 1 });
    render(<CreatePlaylistModal {...defaultProps} />);

    // El botón está disabled; el click no debe disparar la creación
    fireEvent.click(screen.getByText("Crear"));
    await waitFor(() => {
      expect(api.createPlaylist).not.toHaveBeenCalled();
    });
  });

  it("should reset the form when reopened", async () => {
    api.createPlaylist.mockResolvedValue({ id: 1 });
    const { rerender } = render(<CreatePlaylistModal {...defaultProps} open={false} />);
    rerender(<CreatePlaylistModal {...defaultProps} open />);

    const input = screen.getByPlaceholderText("Escribe un nombre...");
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "Temporal" } });
    expect(input.value).toBe("Temporal");

    rerender(<CreatePlaylistModal {...defaultProps} open={false} />);
    rerender(<CreatePlaylistModal {...defaultProps} open />);
    expect(screen.getByPlaceholderText("Escribe un nombre...").value).toBe("");
  });

  it("should stop propagation on dialog click (no close on inner click)", () => {
    const onClose = vi.fn();
    const { container } = render(<CreatePlaylistModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(container.firstChild.firstChild);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Portada con plugin-dialog (sustituye al <input type="file">) ─────────────

describe("CreatePlaylistModal — portada con plugin-dialog", () => {
  it("cancelar el selector no cambia nada ni avisa (bug: cerraba la app)", async () => {
    openDialog.mockResolvedValue(null);
    const toast = vi.fn();
    render(<CreatePlaylistModal {...defaultProps} toast={toast} />);

    fireEvent.click(screen.getByText("Portada"));

    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(readFile).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(document.querySelector("img")).toBeNull();
  });

  it("una imagen seleccionada se muestra como preview dataURL", async () => {
    openDialog.mockResolvedValue("C:\\fotos\\portada.png");
    readFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    const toast = vi.fn();
    render(<CreatePlaylistModal {...defaultProps} toast={toast} />);

    fireEvent.click(screen.getByText("Portada"));

    // alt="" → sin rol accesible; consultamos por selector
    await waitFor(() => expect(document.querySelector("img")).not.toBeNull());
    const img = document.querySelector("img");
    expect(readFile).toHaveBeenCalledWith("C:\\fotos\\portada.png");
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(toast).not.toHaveBeenCalled();
  });

  it("rechaza extensiones que no son imagen con toast de error", async () => {
    openDialog.mockResolvedValue("C:\\docs\\notas.txt");
    const toast = vi.fn();
    render(<CreatePlaylistModal {...defaultProps} toast={toast} />);

    fireEvent.click(screen.getByText("Portada"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Selecciona una imagen valida", "error"),
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it("si el selector falla, avisa sin romper el modal", async () => {
    openDialog.mockRejectedValue(new Error("boom"));
    const toast = vi.fn();
    render(<CreatePlaylistModal {...defaultProps} toast={toast} />);

    fireEvent.click(screen.getByText("Portada"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("No se pudo abrir el selector", "error"),
    );
  });
});
