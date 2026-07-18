import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmModal } from "./ConfirmModal";

const defaultProps = {
  open: true,
  title: "Eliminar playlist",
  message: "¿Seguro que quieres eliminar esta playlist?",
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ConfirmModal", () => {
  it("should render nothing when closed", () => {
    const { container } = render(<ConfirmModal {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render title and message when open", () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText("Eliminar playlist")).toBeInTheDocument();
    expect(screen.getByText(/¿Seguro que quieres eliminar/)).toBeInTheDocument();
  });

  it("should call onCancel when clicking the Cancel button", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("should call onCancel when clicking the backdrop", () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(container.firstChild);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("should NOT call onCancel when clicking inside the dialog", () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(container.firstChild.firstChild);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("should call onConfirm when clicking the confirm button", () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Eliminar"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("should use a custom confirm label", () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} confirmLabel="Borrar todo" />);
    fireEvent.click(screen.getByText("Borrar todo"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
