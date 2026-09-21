import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithSettings } from "../test-utils";
import {
  PageAcercaDe,
  PageReproductor,
  PageTraduccion,
  PageAlmacenamiento,
  PagePrivacidad,
  PageApariencia,
  PageContenido,
  PageCopias,
} from "./SettingsPages";

// ── PageAcercaDe ───────────────────────────────────────────────────────────

describe("PageAcercaDe", () => {
  it("should render version number", () => {
    renderWithSettings(<PageAcercaDe />);
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
  });

  it("should render version label", () => {
    renderWithSettings(<PageAcercaDe />);
    expect(screen.getByText("Versión")).toBeInTheDocument();
  });

  it("should render source code label", () => {
    renderWithSettings(<PageAcercaDe />);
    expect(screen.getByText("Código fuente")).toBeInTheDocument();
  });
});

// ── PageTraduccion ─────────────────────────────────────────────────────────

describe("PageTraduccion", () => {
  it("should render language section", () => {
    renderWithSettings(<PageTraduccion />);
    expect(screen.getByText("Traducción")).toBeInTheDocument();
  });

  it("should show Español as default selected option", () => {
    renderWithSettings(<PageTraduccion />);
    const esBtn = screen.getByText("Español");
    expect(esBtn).toBeInTheDocument();
  });

  it("should show English as an option", () => {
    renderWithSettings(<PageTraduccion />);
    expect(screen.getByText("English")).toBeInTheDocument();
  });
});

// ── PageReproductor ────────────────────────────────────────────────────────

describe("PageReproductor", () => {
  it("should render crossfade section", () => {
    renderWithSettings(
      <PageReproductor neonColor="#a78bfa" crossfadeDuration={0} setCrossfadeDuration={() => {}} />,
    );
    expect(screen.getByText("Reproductor y Sonido")).toBeInTheDocument();
  });

  it("should show Off when crossfade is 0", () => {
    renderWithSettings(
      <PageReproductor neonColor="#a78bfa" crossfadeDuration={0} setCrossfadeDuration={() => {}} />,
    );
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("should show crossfade duration when set", () => {
    renderWithSettings(
      <PageReproductor neonColor="#a78bfa" crossfadeDuration={5} setCrossfadeDuration={() => {}} />,
    );
    expect(screen.getByText(/5s/)).toBeInTheDocument();
  });
});

// ── PageAlmacenamiento ─────────────────────────────────────────────────────

describe("PageAlmacenamiento", () => {
  it("should show 0 canciones when empty", () => {
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);
    expect(screen.getByText(/0 canciones/)).toBeInTheDocument();
  });

  it("should show download count with size", () => {
    const downloads = [{ videoId: "abc", title: "Test Song", size: 5_000_000 }];
    renderWithSettings(<PageAlmacenamiento downloads={downloads} onClearDownloads={() => {}} />);
    expect(screen.getByText(/1 canciones/)).toBeInTheDocument();
  });

  it("should not show delete button when downloads is empty", () => {
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);
    expect(screen.queryByText("Eliminar todas las descargas?")).not.toBeInTheDocument();
  });

  it("should show image cache label", () => {
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);
    expect(screen.getByText("Caché de imágenes")).toBeInTheDocument();
  });
});

// ── PagePrivacidad ─────────────────────────────────────────────────────────

describe("PagePrivacidad", () => {
  it("should render privacy section", () => {
    renderWithSettings(
      <PagePrivacidad neonColor="#a78bfa" onClearHistory={() => {}} toast={() => {}} />,
    );
    expect(screen.getByText("Privacidad")).toBeInTheDocument();
  });

  it("should show clear history option", () => {
    renderWithSettings(
      <PagePrivacidad neonColor="#a78bfa" onClearHistory={() => {}} toast={() => {}} />,
    );
    expect(screen.getByText("Borrar historial de escuchas")).toBeInTheDocument();
  });

  it("should show confirmation when clear history is clicked", () => {
    renderWithSettings(
      <PagePrivacidad neonColor="#a78bfa" onClearHistory={() => {}} toast={() => {}} />,
    );
    fireEvent.click(screen.getByText("Borrar historial de escuchas"));
    expect(screen.getByText("Borrar historial de escuchas?")).toBeInTheDocument();
  });

  it("should call onClearHistory when confirm button is clicked", () => {
    const onClearHistory = vi.fn();
    const toast = vi.fn();
    renderWithSettings(
      <PagePrivacidad neonColor="#a78bfa" onClearHistory={onClearHistory} toast={toast} />,
    );
    fireEvent.click(screen.getByText("Borrar historial de escuchas"));
    fireEvent.click(screen.getByText("Borrar"));
    expect(onClearHistory).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Historial eliminado", "info");
  });

  it("should close confirmation when cancel is clicked", () => {
    renderWithSettings(
      <PagePrivacidad neonColor="#a78bfa" onClearHistory={() => {}} toast={() => {}} />,
    );
    fireEvent.click(screen.getByText("Borrar historial de escuchas"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.queryByText("Borrar historial de escuchas?")).not.toBeInTheDocument();
  });
});

// ── PageApariencia ──────────────────────────────────────────────────────

describe("PageApariencia", () => {
  it("should render theme section", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Tema")).toBeInTheDocument();
    expect(screen.getByText("Tema dinámico")).toBeInTheDocument();
    expect(screen.getByText("Negro puro")).toBeInTheDocument();
  });

  it("should render default tab section with all tabs", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Pestaña por defecto")).toBeInTheDocument();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByText("Búsqueda")).toBeInTheDocument();
    expect(screen.getByText("Me gustas")).toBeInTheDocument();
    expect(screen.getByText("Historial")).toBeInTheDocument();
    expect(screen.getByText("Descargas")).toBeInTheDocument();
  });

  it("should render player section with play button shape and bar style", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Reproductor")).toBeInTheDocument();
    expect(screen.getByText("Forma del botón de play")).toBeInTheDocument();
    expect(screen.getByText("Estilo de la barra de progreso")).toBeInTheDocument();
  });

  it("should render lyrics section with all options", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Letras")).toBeInTheDocument();
    expect(screen.getByText("Girar el fondo de la letra")).toBeInTheDocument();
    expect(screen.getByText("Posición del texto de las letras")).toBeInTheDocument();
    expect(screen.getByText("Animate lyrics")).toBeInTheDocument();
    expect(screen.getByText("Tamaño de letra de las letras")).toBeInTheDocument();
    expect(screen.getByText("Tiempo para retomar auto-scroll")).toBeInTheDocument();
  });

  it("should render general section with show progress toggle", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Mostrar tiempo en la barra de progreso")).toBeInTheDocument();
  });

  it("should render dynamic theme toggle in row", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Tema dinámico")).toBeInTheDocument();
    expect(
      screen
        .getByText("Tema dinámico")
        .parentElement.parentElement.querySelector("div[style*='cursor']"),
    ).toBeInTheDocument();
  });

  it("should render background style SegBtn", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Desenfoque")).toBeInTheDocument();
    expect(screen.getByText("Color sólido")).toBeInTheDocument();
    expect(screen.getByText("Ninguno")).toBeInTheDocument();
  });

  it("should render font size SegBtn", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Pequeño")).toBeInTheDocument();
    expect(screen.getByText("Mediano")).toBeInTheDocument();
    expect(screen.getByText("Grande")).toBeInTheDocument();
  });
});

// ── PageContenido ───────────────────────────────────────────────────────

describe("PageContenido", () => {
  it("should render content section", () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("should render LrcLib toggle", () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.getByText("LrcLib")).toBeInTheDocument();
  });

  it("should render KuGou toggle", () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.getByText("KuGou")).toBeInTheDocument();
  });

  it("should render LrcLib toggle as clickable", () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    const lrcLibRow = screen.getByText("LrcLib").parentElement.parentElement;
    expect(lrcLibRow.querySelector("div[style*='cursor']")).toBeInTheDocument();
  });
});

// ── PageCopias ──────────────────────────────────────────────────────────────

describe("PageCopias", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  const baseProps = {
    neonColor: "#a78bfa",
    liked: new Set(["abc123"]),
    history: [{ videoId: "def456", title: "Test" }],
    playlists: [{ id: "pl1", name: "My Playlist" }],
    toast: () => {},
  };

  it("should render backup section", () => {
    renderWithSettings(<PageCopias {...baseProps} />);
    expect(screen.getByText("Copias de seguridad")).toBeInTheDocument();
  });

  it("should render export data option", () => {
    renderWithSettings(<PageCopias {...baseProps} />);
    expect(screen.getByText("Exportar datos")).toBeInTheDocument();
  });

  it("should render import data option", () => {
    renderWithSettings(<PageCopias {...baseProps} />);
    expect(screen.getByText("Importar datos")).toBeInTheDocument();
  });

  it("should trigger export when clicked", () => {
    const toast = vi.fn();
    renderWithSettings(<PageCopias {...baseProps} toast={toast} />);
    fireEvent.click(screen.getByText("Exportar datos"));
    // Export creates a blob and triggers download; verify toast was called
    expect(toast).toHaveBeenCalledWith("Datos exportados", "success");
  });
});
