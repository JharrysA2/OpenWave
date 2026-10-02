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
  PageRendimiento,
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

  it("should render playback quality alongside download quality", () => {
    renderWithSettings(
      <PageReproductor neonColor="#a78bfa" crossfadeDuration={0} setCrossfadeDuration={() => {}} />,
    );
    expect(screen.getByText("Calidad de audio")).toBeInTheDocument();
    expect(screen.getByText("Calidad de reproducción")).toBeInTheDocument();
    expect(screen.getByText("Calidad de descarga")).toBeInTheDocument();
    // Opciones de calidad de reproducción (default = Estándar)
    expect(screen.getByText("Baja")).toBeInTheDocument();
    expect(screen.getByText("Estándar")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("should render the queue recommendations toggle (off by default)", () => {
    localStorage.removeItem("sw_settings_v1");
    renderWithSettings(
      <PageReproductor neonColor="#a78bfa" crossfadeDuration={0} setCrossfadeDuration={() => {}} />,
    );
    expect(screen.getByText("Cola")).toBeInTheDocument();
    expect(screen.getByText("Recomendar canciones similares")).toBeInTheDocument();
    expect(
      screen.getByText("Añade canciones parecidas al final de la cola"),
    ).toBeInTheDocument();
    // Por defecto desactivado: nada persistido con el toggle encendido
    const stored = JSON.parse(localStorage.getItem("sw_settings_v1") || "{}");
    expect(stored.queueRecommendations).not.toBe(true);
  });

  it("should persist queue recommendations when toggled", () => {
    localStorage.removeItem("sw_settings_v1");
    renderWithSettings(
      <PageReproductor neonColor="#a78bfa" crossfadeDuration={0} setCrossfadeDuration={() => {}} />,
    );
    // Mismo patrón que el test de "Tema dinámico": el toggle vive dos
    // niveles por encima del label (SettingRow > fila > div cursor:pointer)
    const label = screen.getByText("Recomendar canciones similares");
    const toggle = label.parentElement.parentElement.querySelector("div[style*='cursor']");
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    const stored = JSON.parse(localStorage.getItem("sw_settings_v1") || "{}");
    expect(stored.queueRecommendations).toBe(true);
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

  it("should show streaming cache row", () => {
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);
    expect(screen.getByText("Caché del reproductor")).toBeInTheDocument();
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

  it("should confirm and clear custom lyrics", () => {
    const toast = vi.fn();
    renderWithSettings(
      <PagePrivacidad neonColor="#a78bfa" onClearHistory={() => {}} toast={toast} />,
    );
    fireEvent.click(screen.getByText("Restablecer letras personalizadas"));
    expect(screen.getByText("Restablecer letras personalizadas?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Borrar"));
    expect(toast).toHaveBeenCalled();
    expect(screen.queryByText("Restablecer letras personalizadas?")).not.toBeInTheDocument();
  });
});

// ── PageApariencia ──────────────────────────────────────────────────────

describe("PageApariencia", () => {
  it("should render the app color row that opens the palette modal", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Color de la app")).toBeInTheDocument();
    // La paleta NO está desplegada en la página: vive en su modal
    expect(screen.queryByLabelText(/^Color #/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Color de la app"));
    // Bastantes colores: ≥20 swatches identificables por "Color #hex"
    expect(screen.getAllByLabelText(/^Color #/).length).toBeGreaterThanOrEqual(20);
    // + selector libre: botón redondo con extractor de color
    expect(screen.getByRole("button", { name: "Color personalizado" })).toBeInTheDocument();
    expect(screen.getByText("Cancelar")).toBeInTheDocument();
  });

  it("the palette modal selects with a ring, persists and closes via Cancelar", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    fireEvent.click(screen.getByText("Color de la app"));
    const azul = screen.getByLabelText("Color #22d3ee");
    const morado = screen.getByLabelText("Color #a78bfa");
    // el color por defecto viene anillado…
    expect(morado.style.boxShadow).toContain("0 0 0 4px");
    expect(azul.style.boxShadow).not.toContain("0 0 0 4px");
    fireEvent.click(azul);
    // …al clicar se anilla el nuevo, se guarda y el modal sigue abierto
    // (selector de color: se aplica al instante para seguir comparando)
    expect(azul.style.boxShadow).toContain("0 0 0 4px");
    expect(morado.style.boxShadow).not.toContain("0 0 0 4px");
    expect(JSON.parse(localStorage.getItem("sw_settings_v1")).appColor).toBe("#22d3ee");
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.queryByLabelText("Color #22d3ee")).not.toBeInTheDocument();
  });

  it("the eyedropper opens the app-styled picker and applies a custom color", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    fireEvent.click(screen.getByText("Color de la app"));
    // el extractor abre el selector PROPIO de la app (no el del sistema):
    // la paleta desaparece y entran tono + hex
    fireEvent.click(screen.getByRole("button", { name: "Color personalizado" }));
    expect(screen.queryByLabelText(/^Color #/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tono")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hexadecimal"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByText("Aplicar"));
    expect(JSON.parse(localStorage.getItem("sw_settings_v1")).appColor).toBe("#123456");
    // Aplicar guarda y vuelve a la paleta
    expect(screen.getAllByLabelText(/^Color #/).length).toBeGreaterThanOrEqual(20);
    expect(screen.queryByLabelText("Hexadecimal")).not.toBeInTheDocument();
  });

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
    // Tono del play + alineación del texto de la barra
    expect(screen.getByText("Estilo de botones del reproductor")).toBeInTheDocument();
    expect(screen.getByText("Alineación del texto del reproductor")).toBeInTheDocument();
    expect(screen.getByText("Blanco")).toBeInTheDocument();
    // "Centro" aparece también en la posición del texto de las letras
    expect(screen.getAllByText("Centro").length).toBeGreaterThanOrEqual(2);
  });

  it("should NOT render the removed vignette (background dimming) row", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    // Velo/vignette eliminado por petición: la fila ya no existe.
    expect(screen.queryByText("Oscurecimiento de fondo")).not.toBeInTheDocument();
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
    expect(screen.getByText("Proveedor de letras")).toBeInTheDocument();
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

  it("should render default search tab SegBtn", () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.getByText("Búsqueda")).toBeInTheDocument();
    expect(screen.getByText("Pestaña de búsqueda por defecto")).toBeInTheDocument();
    expect(screen.getByText("Música")).toBeInTheDocument();
    expect(screen.getByText("Vídeos")).toBeInTheDocument();
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

// ── PageRendimiento ──────────────────────────────────────────────────────

describe("PageRendimiento", () => {
  it("should render performance mode section", () => {
    renderWithSettings(<PageRendimiento neonColor="#a78bfa" />);
    expect(screen.getByText("Modo de rendimiento")).toBeInTheDocument();
  });

  it("should show GPU status with the actual acceleration state", () => {
    renderWithSettings(<PageRendimiento neonColor="#a78bfa" />);
    expect(screen.getByText("GPU")).toBeInTheDocument();
    // Sin WebGL en jsdom → software: se muestra el fallback de bajo consumo
    expect(screen.getByText("Render por software — modo bajo consumo")).toBeInTheDocument();
  });
});
