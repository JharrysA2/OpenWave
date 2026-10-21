import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
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

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));
vi.mock("../utils/api", () => ({
  api: {
    // Como en los tests previos (sin mock): el backend no está → loadStats
    // de PageAlmacenamiento cae a stats=undefined ("No disponible") y
    // loadVideos cae a la lista vacía.
    get: vi.fn(() => Promise.reject(new Error("backend no disponible"))),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({ ok: true })),
    del: vi.fn(() => Promise.resolve({ ok: true })),
    fetchPlaylistSongs: vi.fn(() => Promise.resolve([])),
    importHistory: vi.fn(() => Promise.resolve({ ok: true, imported: 0 })),
    importPlaylists: vi.fn(() => Promise.resolve({ ok: true, restored: 0 })),
  },
}));

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { api } from "../utils/api";

// ── PageAcercaDe ───────────────────────────────────────────────────────────

describe("PageAcercaDe", () => {
  it("should render version number", () => {
    renderWithSettings(<PageAcercaDe />);
    expect(screen.getByText("1.1.2")).toBeInTheDocument();
  });

  it("should render version label", () => {
    renderWithSettings(<PageAcercaDe />);
    expect(screen.getByText("Versión")).toBeInTheDocument();
  });

  it("should render source code label", () => {
    renderWithSettings(<PageAcercaDe />);
    expect(screen.getByText("Código fuente")).toBeInTheDocument();
  });

  it("avisa y permite reparar si la identidad no está registrada", async () => {
    api.get.mockResolvedValueOnce({
      soportado: true,
      registrada: false,
      paquete: null,
    });
    api.post.mockResolvedValueOnce({
      ok: true,
      estado: { soportado: true, registrada: true, paquete: "OpenWave_pkg" },
    });
    const toast = vi.fn();
    renderWithSettings(<PageAcercaDe toast={toast} />);

    expect(
      await screen.findByText(/Sin registrar: el Administrador de tareas/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Reparar"));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/settings/identity/repair", {}));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Identidad reparada. Reinicia OpenWave para aplicarla.",
        "success",
      ),
    );
    expect(await screen.findByText(/Registrada · OpenWave_pkg/)).toBeInTheDocument();
  });

  it("no muestra la identidad en sistemas sin soporte", async () => {
    api.get.mockResolvedValueOnce({ soportado: false, registrada: null });
    renderWithSettings(<PageAcercaDe />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Integración con Windows")).not.toBeInTheDocument();
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
    expect(screen.getByText("Añade canciones parecidas al final de la cola")).toBeInTheDocument();
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

  it("muestra la sección de vídeos de fondo y avisa si está vacía", async () => {
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);
    expect(screen.getByText("Vídeos de fondo")).toBeInTheDocument();
    // Backend caído → lista vacía: sin opción de borrar, con aviso.
    expect(await screen.findByText("No hay vídeos de fondo guardados")).toBeInTheDocument();
    expect(screen.queryByText("Eliminar todos los vídeos de fondo?")).not.toBeInTheDocument();
  });

  it("lista los vídeos con tamaño y permite borrarlos uno a uno", async () => {
    api.get
      .mockImplementationOnce(() => Promise.reject(new Error("stats caído")))
      .mockImplementationOnce(() =>
        Promise.resolve({
          videos: [
            {
              videoId: "vid111",
              title: "Canción X",
              artist: "Grupo Y",
              size: 2_097_152,
              quality: 1080,
            },
          ],
        }),
      );
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);

    expect(await screen.findByText("Canción X")).toBeInTheDocument();
    expect(screen.getByText("Grupo Y · 2.0 MB · 1080p")).toBeInTheDocument();

    // Borrado individual con confirmación: pide DELETE /video/<id> y
    // recarga el listado (la recarga vuelve a caer → fila desaparece).
    fireEvent.click(screen.getByRole("button", { name: "Borrar: Canción X" }));
    expect(await screen.findByText("Eliminar el vídeo de esta canción?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Borrar"));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith("/video/vid111"));
    await waitFor(() => expect(screen.queryByText("Canción X")).not.toBeInTheDocument());
  });

  it("ofrece borrar todos los vídeos con confirmación", async () => {
    api.get
      .mockImplementationOnce(() => Promise.reject(new Error("stats caído")))
      .mockImplementationOnce(() =>
        Promise.resolve({
          videos: [{ videoId: "vid111", title: "Canción X", size: 1000 }],
        }),
      );
    renderWithSettings(<PageAlmacenamiento downloads={[]} onClearDownloads={() => {}} />);

    fireEvent.click(await screen.findByText("Borrar todos los vídeos"));
    expect(await screen.findByText("Eliminar todos los vídeos de fondo?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Borrar"));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith("/videos"));
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
  it("should render default search tab SegBtn", () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.getByText("Búsqueda")).toBeInTheDocument();
    expect(screen.getByText("Pestaña de búsqueda por defecto")).toBeInTheDocument();
    expect(screen.getByText("Música")).toBeInTheDocument();
    expect(screen.getByText("Vídeos")).toBeInTheDocument();
  });

  it("no muestra los toggles muertos de proveedor de letras (lrcLib/kuGou)", () => {
    // Regresión: LrcLib y KuGou no tenían consumidor en el backend y se
    // eliminaron de la v1 — no deben volver a aparecer.
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.queryByText("LrcLib")).not.toBeInTheDocument();
    expect(screen.queryByText("KuGou")).not.toBeInTheDocument();
    expect(screen.queryByText("Proveedor de letras")).not.toBeInTheDocument();
  });
});

// ── PageContenido: cookies de YouTube ──────────────────────────────────────

describe("PageContenido — cookies de YouTube", () => {
  const COOKIES =
    "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t4102444800\tSID\tabc\n";

  beforeEach(() => {
    api.get.mockResolvedValue({ configurado: false });
    api.put.mockResolvedValue({ ok: true });
    api.post.mockResolvedValue({ ok: true });
    api.del.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    api.get.mockReset();
    api.get.mockRejectedValue(new Error("backend no disponible"));
    api.put.mockReset();
    api.put.mockResolvedValue({ ok: true });
    api.post.mockReset();
    api.post.mockResolvedValue({});
    api.del.mockReset();
    api.del.mockResolvedValue({ ok: true });
    openDialog.mockReset();
    readTextFile.mockReset();
    vi.clearAllMocks();
  });

  it("muestra la sección y el estado sin cookies", async () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    expect(screen.getByText("Sesión de YouTube")).toBeInTheDocument();
    expect(await screen.findByText("Sin cookies")).toBeInTheDocument();
  });

  it("no deja guardar sin contenido", async () => {
    renderWithSettings(<PageContenido neonColor="#a78bfa" />);
    await screen.findByText("Sin cookies");
    expect(screen.getByRole("button", { name: "Verificar y guardar" })).toBeDisabled();
  });

  it("solo confirma y limpia cuando el backend verifica las cookies", async () => {
    const toast = vi.fn();
    api.put.mockResolvedValueOnce({ ok: true, metodo: "Watch Later" });
    renderWithSettings(<PageContenido neonColor="#a78bfa" toast={toast} />);
    await screen.findByText("Sin cookies");

    const area = screen.getByLabelText(
      "…o pega aquí el contenido de cookies.txt (formato Netscape).",
    );
    fireEvent.change(area, { target: { value: COOKIES } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar y guardar" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/settings/cookies",
        { content: COOKIES },
        { timeout: 90000 },
      ),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Cookies verificadas y guardadas. Las descargas usarán tu sesión.",
        "success",
      ),
    );
    expect(area).toHaveValue("");
  });

  it("si la verificación falla conserva lo pegado y avisa", async () => {
    const toast = vi.fn();
    api.put.mockResolvedValueOnce({ ok: false, error: "YouTube no reconoce la sesión" });
    renderWithSettings(<PageContenido neonColor="#a78bfa" toast={toast} />);
    await screen.findByText("Sin cookies");

    const area = screen.getByLabelText(
      "…o pega aquí el contenido de cookies.txt (formato Netscape).",
    );
    fireEvent.change(area, { target: { value: COOKIES } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar y guardar" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("YouTube no reconoce la sesión", "error"),
    );
    expect(area).toHaveValue(COOKIES);
  });

  it("carga el fichero elegido en el área de texto", async () => {
    openDialog.mockResolvedValueOnce("C:\\Users\\jharrys\\cookies.txt");
    readTextFile.mockResolvedValueOnce(COOKIES);
    const toast = vi.fn();
    renderWithSettings(<PageContenido neonColor="#a78bfa" toast={toast} />);
    await screen.findByText("Sin cookies");

    fireEvent.click(screen.getByText("Elegir cookies.txt"));

    const area = screen.getByLabelText(
      "…o pega aquí el contenido de cookies.txt (formato Netscape).",
    );
    await waitFor(() => expect(area).toHaveValue(COOKIES));
    expect(readTextFile).toHaveBeenCalledWith("C:\\Users\\jharrys\\cookies.txt");
    expect(toast).not.toHaveBeenCalled();
  });

  it("rechaza un archivo demasiado grande antes de enviarlo", async () => {
    openDialog.mockResolvedValueOnce("C:\\cookies-gigante.txt");
    readTextFile.mockResolvedValueOnce("x".repeat(512 * 1024 + 1));
    const toast = vi.fn();
    renderWithSettings(<PageContenido neonColor="#a78bfa" toast={toast} />);
    await screen.findByText("Sin cookies");

    fireEvent.click(screen.getByText("Elegir cookies.txt"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("El archivo es demasiado grande (máximo 512 KB)", "error"),
    );
    expect(
      screen.getByLabelText("…o pega aquí el contenido de cookies.txt (formato Netscape)."),
    ).toHaveValue("");
  });

  it("vuelve a comprobar las cookies guardadas", async () => {
    api.get.mockResolvedValue({
      configurado: true,
      bytes: 2048,
      verificacion: { ok: true, validado_en: "2026-10-21T10:00:00+00:00" },
    });
    api.post.mockResolvedValueOnce({ ok: true });
    const toast = vi.fn();
    renderWithSettings(<PageContenido neonColor="#a78bfa" toast={toast} />);
    await screen.findByText(/Cookies cargadas/);

    fireEvent.click(screen.getByRole("button", { name: "Comprobar de nuevo" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Las cookies siguen siendo válidas", "success"),
    );
    expect(api.post).toHaveBeenCalledWith("/settings/cookies/check", {}, { timeout: 90000 });
  });

  it("quita las cookies con confirmación", async () => {
    api.get.mockResolvedValue({ configurado: true, bytes: 512, verificacion: null });
    const toast = vi.fn();
    renderWithSettings(<PageContenido neonColor="#a78bfa" toast={toast} />);
    await screen.findByText(/Cookies cargadas/);

    fireEvent.click(screen.getByText("Quitar"));
    expect(screen.getByText("¿Quitar las cookies guardadas?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Borrar"));

    await waitFor(() => expect(api.del).toHaveBeenCalledWith("/settings/cookies"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Cookies eliminadas", "info"));
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

  it("should trigger export when clicked (incluye las canciones de cada playlist)", async () => {
    const toast = vi.fn();
    api.fetchPlaylistSongs.mockResolvedValue([{ videoId: "s1", title: "Canción" }]);
    renderWithSettings(<PageCopias {...baseProps} toast={toast} />);
    fireEvent.click(screen.getByText("Exportar datos"));
    // Export ahora es async: recarga las canciones de cada playlist
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Datos exportados", "success"));
    expect(api.fetchPlaylistSongs).toHaveBeenCalledWith("pl1");
  });

  // ── Importar con plugin-dialog (sustituye al <input type="file">) ─────────

  describe("importar con plugin-dialog", () => {
    afterEach(() => {
      localStorage.removeItem("sw_liked_v2");
      localStorage.removeItem("sw_history_v2");
      localStorage.removeItem("sw_playlists_v2");
      vi.clearAllMocks();
    });

    it("cancelar el selector no escribe en localStorage ni avisa (bug: cerraba la app)", async () => {
      openDialog.mockResolvedValue(null);
      const toast = vi.fn();
      renderWithSettings(<PageCopias {...baseProps} toast={toast} />);

      fireEvent.click(screen.getByText("Importar datos"));

      await waitFor(() => expect(openDialog).toHaveBeenCalled());
      expect(readTextFile).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      expect(localStorage.getItem("sw_liked_v2")).toBeNull();
    });

    it("archivo válido importa de verdad (backend) y refresca la biblioteca", async () => {
      openDialog.mockResolvedValue("C:\\backup\\openwave-backup.json");
      const backup = {
        liked: ["vid1", "vid2"],
        history: [{ videoId: "h1", title: "Historial" }],
        playlists: [{ id: 1, name: "P", songs: [{ videoId: "p1", title: "C" }] }],
      };
      readTextFile.mockResolvedValue(JSON.stringify(backup));
      const toast = vi.fn();
      const refreshLibrary = vi.fn();
      renderWithSettings(
        <PageCopias {...baseProps} toast={toast} refreshLibrary={refreshLibrary} />,
      );

      fireEvent.click(screen.getByText("Importar datos"));

      await waitFor(() => expect(toast).toHaveBeenCalledWith("Datos importados", "success"));
      // Historial y playlists van al backend (SQLite), no a claves muertas
      expect(api.importHistory).toHaveBeenCalledWith(backup.history);
      expect(api.importPlaylists).toHaveBeenCalledWith(backup.playlists);
      expect(localStorage.getItem("sw_liked_v2")).toBe(JSON.stringify(["vid1", "vid2"]));
      expect(localStorage.getItem("sw_history_v2")).toBeNull();
      expect(localStorage.getItem("sw_playlists_v2")).toBeNull();
      // La UI se refresca sola: sin «Recarga la app»
      expect(refreshLibrary).toHaveBeenCalled();
    });

    it("backup antiguo solo con liked: no toca el backend y aun así avisa", async () => {
      openDialog.mockResolvedValue("C:\\backup\\solo-liked.json");
      readTextFile.mockResolvedValue(JSON.stringify({ liked: ["a1"] }));
      const toast = vi.fn();
      renderWithSettings(<PageCopias {...baseProps} toast={toast} />);

      fireEvent.click(screen.getByText("Importar datos"));

      await waitFor(() => expect(toast).toHaveBeenCalledWith("Datos importados", "success"));
      expect(api.importHistory).not.toHaveBeenCalled();
      expect(api.importPlaylists).not.toHaveBeenCalled();
      expect(localStorage.getItem("sw_liked_v2")).toBe(JSON.stringify(["a1"]));
    });

    it("si el backend está caído, avisa con error (y se puede reintentar)", async () => {
      openDialog.mockResolvedValue("C:\\backup\\openwave-backup.json");
      readTextFile.mockResolvedValue(
        JSON.stringify({ liked: ["vid1"], history: [{ videoId: "h1" }] }),
      );
      api.importHistory.mockRejectedValueOnce(new Error("backend caído"));
      const toast = vi.fn();
      renderWithSettings(<PageCopias {...baseProps} toast={toast} />);

      fireEvent.click(screen.getByText("Importar datos"));

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          "No se pudo importar. ¿Está activo el backend?",
          "error",
        ),
      );
      // La importación es reintentable (endpoints idempotentes): no se
      // confirma con éxito parcial.
      expect(localStorage.getItem("sw_liked_v2")).toBeNull();
    });

    it("JSON inválido avisa con error", async () => {
      openDialog.mockResolvedValue("C:\\backup\\malo.json");
      readTextFile.mockResolvedValue("no es json {");
      const toast = vi.fn();
      renderWithSettings(<PageCopias {...baseProps} toast={toast} />);

      fireEvent.click(screen.getByText("Importar datos"));

      await waitFor(() => expect(toast).toHaveBeenCalledWith("Archivo inválido", "error"));
      expect(localStorage.getItem("sw_liked_v2")).toBeNull();
    });

    it("si el selector falla, avisa sin romper la página", async () => {
      openDialog.mockRejectedValue(new Error("boom"));
      const toast = vi.fn();
      renderWithSettings(<PageCopias {...baseProps} toast={toast} />);

      fireEvent.click(screen.getByText("Importar datos"));

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith("No se pudo abrir el selector", "error"),
      );
    });
  });
});

// ── PageRendimiento ──────────────────────────────────────────────────────

describe("PageRendimiento", () => {
  it("should render performance mode section", () => {
    renderWithSettings(<PageRendimiento neonColor="#a78bfa" />);
    expect(screen.getByText("Modo de rendimiento")).toBeInTheDocument();
  });

  it("should not show the GPU status section anymore", () => {
    renderWithSettings(<PageRendimiento neonColor="#a78bfa" />);
    // La sección de diagnóstico de GPU se retiró de la interfaz: no debe
    // aparecer ningún rótulo de aceleración.
    expect(screen.queryByText("GPU")).not.toBeInTheDocument();
    expect(screen.queryByText(/Aceleración por hardware/)).not.toBeInTheDocument();
  });
});

// ── Barra lateral (Apariencia → General) ──────────────────────────────────

describe("PageApariencia — barra lateral", () => {
  it("muestra el toggle de la barra lateral y persiste el cambio", () => {
    renderWithSettings(<PageApariencia neonColor="#a78bfa" />);
    expect(screen.getByText("Mostrar barra lateral")).toBeInTheDocument();
    expect(screen.getByText(/Muestra u oculta la navegación/)).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "Mostrar barra lateral" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(JSON.parse(localStorage.getItem("sw_settings_v1")).sidebarVisible).toBe(false);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(JSON.parse(localStorage.getItem("sw_settings_v1")).sidebarVisible).toBe(true);
  });
});
