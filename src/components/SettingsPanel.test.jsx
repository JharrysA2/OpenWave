import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithSettings } from "../test-utils";
import SettingsPanel from "./SettingsPanel";

const defaultProps = {
  open: true,
  onClose: () => {},
  neonColor: "#a78bfa",
  crossfadeDuration: 0,
  setCrossfadeDuration: () => {},
  downloads: [],
  onClearDownloads: () => {},
  onClearHistory: () => {},
  liked: new Set(),
  history: [],
  playlists: [],
  toast: () => {},
};

function renderPanel(props = {}) {
  return renderWithSettings(<SettingsPanel {...defaultProps} {...props} />);
}

describe("SettingsPanel", () => {
  // ── Open/Close ──────────────────────────────────────────────────────────

  it("should render null when open is false", () => {
    const { container } = renderPanel({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("should render panel when open is true", () => {
    renderPanel();
    expect(screen.getByText("Ajustes")).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTestId("close-settings"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Main sections ──────────────────────────────────────────────────────

  it("should render main menu sections", () => {
    renderPanel();
    expect(screen.getByText("Ajustes Generales")).toBeInTheDocument();
    expect(screen.getByText("Cuenta")).toBeInTheDocument();
    // "Almacenamiento" appears in both section title and storage row
    expect(screen.getAllByText("Almacenamiento")).toHaveLength(2);
    expect(screen.getByText("Información de la app")).toBeInTheDocument();
  });

  it("should render all main menu items", () => {
    renderPanel();
    expect(screen.getByText("Apariencia")).toBeInTheDocument();
    expect(screen.getByText("Reproductor y Sonido")).toBeInTheDocument();
    expect(screen.getByText("Contenido")).toBeInTheDocument();
    expect(screen.getByText("Traducción")).toBeInTheDocument();
    expect(screen.getByText("Privacidad")).toBeInTheDocument();
    expect(screen.getByText("Copias de seguridad")).toBeInTheDocument();
  });

  // ── Page navigation ────────────────────────────────────────────────────

  it("should navigate to appearance page when clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Apariencia"));
    expect(screen.getByText("Tema")).toBeInTheDocument();
    expect(screen.getByText("Pestaña por defecto")).toBeInTheDocument();
  });

  it("should navigate to player page when clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Reproductor y Sonido"));
    expect(screen.getByText("Crossfade")).toBeInTheDocument();
  });

  it("should navigate to privacy page when clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Privacidad"));
    expect(screen.getByText("Pausar historial de escuchas")).toBeInTheDocument();
  });

  it("should navigate to about page when clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Acerca de"));
    expect(screen.getByText("Versión")).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
  });

  it("should navigate to translation page when clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Traducción"));
    expect(screen.getByText("Idioma")).toBeInTheDocument();
  });

  // ── Back navigation ────────────────────────────────────────────────────

  it("should go back to main menu when back button is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Acerca de"));
    expect(screen.getByText("Versión")).toBeInTheDocument();

    // Click back button
    fireEvent.click(screen.getByText("Atrás"));
    expect(screen.getByText("Ajustes Generales")).toBeInTheDocument();
    expect(screen.queryByText("Versión")).not.toBeInTheDocument();
  });

  // ── Storage page with downloads ────────────────────────────────────────

  it("should show storage page with download info", () => {
    renderPanel({
      downloads: [{ videoId: "abc", title: "Test", size: 1_000_000 }],
    });
    // "Almacenamiento" appears in both section title and row label
    const storageLinks = screen.getAllByText("Almacenamiento");
    fireEvent.click(storageLinks[1]); // click the row (second match)
    expect(screen.getByText(/1 canciones/)).toBeInTheDocument();
  });
});
