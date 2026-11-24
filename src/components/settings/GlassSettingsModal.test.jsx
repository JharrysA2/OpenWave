import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GlassSettingsModal } from "./GlassSettingsModal";
import { DEFAULT_SETTINGS } from "../../constants";
import { TRANSLATIONS } from "../../i18n/translations";

afterEach(() => cleanup());

function renderModal(overrides = {}) {
  const updateSetting = vi.fn();
  const onClose = vi.fn();
  render(
    <GlassSettingsModal
      accent="#a78bfa"
      settings={{ ...DEFAULT_SETTINGS, ...overrides }}
      updateSetting={updateSetting}
      t={TRANSLATIONS.es}
      onClose={onClose}
    />,
  );
  return { updateSetting, onClose };
}

describe("GlassSettingsModal", () => {
  it("muestra los seis estilos de luz y el apagado", () => {
    renderModal();
    for (const label of ["Apagada", "Comet", "Twin", "Halo", "Outline", "Aura", "Prism"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("guarda el estilo de luz elegido", () => {
    const { updateSetting } = renderModal();
    fireEvent.click(screen.getByText("Comet"));
    expect(updateSetting).toHaveBeenCalledWith("glassLightStyle", "comet");
  });

  it("los sliders avanzados escriben el ajuste con su valor numérico", () => {
    const { updateSetting } = renderModal();
    const refraction = document.querySelector('input[type="range"]');
    fireEvent.change(refraction, { target: { value: "80" } });
    expect(updateSetting).toHaveBeenCalledWith("glassRefraction", 80);
  });

  it("cierra con el botón", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
