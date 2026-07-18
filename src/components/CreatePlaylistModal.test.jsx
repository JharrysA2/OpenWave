import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock api ──────────────────────────────────────────────────────────────────

vi.mock("../utils/api", () => ({
  api: {
    createPlaylist: vi.fn(),
  },
}));

import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { api } from "../utils/api";

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
