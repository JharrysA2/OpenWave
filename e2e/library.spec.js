import { test, expect } from "@playwright/test";

test.describe("Biblioteca (Likes, Historial, Descargas)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://127.0.0.1:8765/**", (route) => route.fulfill({ status: 200, json: [] }));
    await page.addInitScript(() => {
      localStorage.setItem("sw_liked_v2", JSON.stringify([]));
    });
    await page.goto("/");
  });

  test.describe("Me gusta", () => {
    test("debe mostrar la vista vacía con sus 3 pestañas", async ({ page }) => {
      await page.getByRole("button", { name: "Me gusta" }).click();
      await expect(page.getByRole("heading", { name: "Me gusta" })).toBeVisible();
      await expect(page.getByText(/Dale me gusta/)).toBeVisible();
      await expect(page.getByRole("tab", { name: /Canciones/ })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Álbumes/ })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Artistas/ })).toBeVisible();
    });

    test("la pestaña Álbumes debe mostrar su estado vacío", async ({ page }) => {
      await page.getByRole("button", { name: "Me gusta" }).click();
      await page.getByRole("tab", { name: /Álbumes/ }).click();
      await expect(page.getByText(/Dale me gusta a álbumes/)).toBeVisible();
    });

    test("la pestaña Artistas debe mostrar su estado vacío", async ({ page }) => {
      await page.getByRole("button", { name: "Me gusta" }).click();
      await page.getByRole("tab", { name: /Artistas/ }).click();
      await expect(page.getByText(/Sigue artistas/)).toBeVisible();
    });

    test("el botón Me gusta debe estar en la sidebar", async ({ page }) => {
      await expect(page.getByRole("button", { name: "Me gusta" })).toBeVisible();
    });
  });

  test.describe("Me gusta — botones por pestaña y selección", () => {
    test.beforeEach(async ({ page }) => {
      // Sembrar «me gusta» con metadatos locales (sin tocar el backend)
      await page.addInitScript(() => {
        localStorage.setItem("sw_liked_v2", JSON.stringify(["seed1", "seed2"]));
        localStorage.setItem(
          "sw_liked_meta_v1",
          JSON.stringify({
            seed1: { title: "Canción Semilla 1", artist: "Artista Semilla", duration: 120 },
            seed2: { title: "Canción Semilla 2", artist: "Artista Semilla", duration: 140 },
          }),
        );
      });
      // Recargar para que corran los init scripts sobre el documento nuevo
      await page.goto("/");
      await page.getByRole("navigation").getByRole("button", { name: "Me gusta" }).click();
      await expect(page.getByText("Canción Semilla 1")).toBeVisible();
    });

    test("Reproducir/Aleatorio/Seleccionar aparecen en Canciones y se ocultan en Artistas", async ({
      page,
    }) => {
      // Canciones: botones habilitados y modo selección disponible
      await expect(page.getByTestId("hero-play")).toBeEnabled();
      await expect(page.getByTestId("hero-shuffle")).toBeEnabled();
      await expect(page.getByRole("button", { name: "Reproducir" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Aleatorio" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Seleccionar" })).toBeVisible();

      // Álbumes: siguen los botones de play pero NO los de selección
      await page.getByRole("tab", { name: /Álbumes/ }).click();
      await expect(page.getByTestId("hero-play")).toBeVisible();
      await expect(page.getByRole("button", { name: "Seleccionar" })).toHaveCount(0);

      // Artistas: sin botones de reproducción ni selección
      await page.getByRole("tab", { name: /Artistas/ }).click();
      await expect(page.getByTestId("hero-play")).toHaveCount(0);
      await expect(page.getByTestId("hero-shuffle")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Seleccionar" })).toHaveCount(0);
    });

    test("el modo selección oculta el corazón y permite eliminar (unlike)", async ({ page }) => {
      // El corazón existe en modo normal
      await expect(page.getByTitle("Quitar de Me gusta")).toHaveCount(2);

      await page.getByRole("button", { name: "Seleccionar" }).click();
      // En modo selección el corazón y el menú ⋮ se ocultan (igual que el ✕)
      await expect(page.getByTitle("Quitar de Me gusta")).toHaveCount(0);
      await expect(page.getByTitle("Más opciones")).toHaveCount(0);

      await page.getByText("Canción Semilla 1").click();
      await expect(page.getByRole("button", { name: "Eliminar (1)" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Mover (1)" })).toBeVisible();

      await page.getByRole("button", { name: "Eliminar (1)" }).click();
      await expect(page.getByText("Canción Semilla 1")).toHaveCount(0);
      await expect(page.getByText("Canción Semilla 2")).toBeVisible();
    });

    test("Mover (N) abre el modal de transferencia a playlist", async ({ page }) => {
      await page.getByRole("button", { name: "Seleccionar" }).click();
      await page.getByText("Canción Semilla 2").click();
      await page.getByRole("button", { name: "Mover (1)" }).click();
      await expect(page.getByText("Mover a playlist")).toBeVisible();
      // Sin playlists en el backend mockeado → mensaje vacío
      await expect(page.getByText(/No hay playlists disponibles/)).toBeVisible();
    });

    test("cambiar de pestaña descarta la selección", async ({ page }) => {
      await page.getByRole("button", { name: "Seleccionar" }).click();
      await page.getByText("Canción Semilla 1").click();
      await expect(page.getByRole("button", { name: "Eliminar (1)" })).toBeVisible();

      await page.getByRole("tab", { name: /Álbumes/ }).click();
      await page.getByRole("tab", { name: /Canciones/ }).click();
      await expect(page.getByRole("button", { name: /Eliminar \(1\)/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Seleccionar" })).toBeVisible();
    });
  });

  test.describe("Historial", () => {
    test("debe mostrar la vista vacía inicialmente", async ({ page }) => {
      await page.getByRole("button", { name: "Historial" }).click();
      await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
      await expect(page.getByText(/No hay historial/)).toBeVisible();
    });

    test("el botón Historial debe estar en la sidebar", async ({ page }) => {
      await expect(page.getByRole("button", { name: "Historial" })).toBeVisible();
    });
  });

  test.describe("Descargas", () => {
    test("debe mostrar la vista vacía con sus 2 pestañas", async ({ page }) => {
      await page.getByRole("button", { name: "Descargas" }).click();
      await expect(page.getByRole("heading", { name: "Descargas" })).toBeVisible();
      await expect(page.getByText(/Descarga canciones/)).toBeVisible();
      await expect(page.getByRole("tab", { name: /Canciones/ })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Álbumes/ })).toBeVisible();
      // Descargas NO tiene pestaña de Artistas
      await expect(page.getByRole("tab", { name: /Artistas/ })).toHaveCount(0);
    });

    test("la pestaña Álbumes debe mostrar su estado vacío", async ({ page }) => {
      await page.getByRole("button", { name: "Descargas" }).click();
      await page.getByRole("tab", { name: /Álbumes/ }).click();
      await expect(page.getByText(/Los álbumes de tus descargas/)).toBeVisible();
    });

    test("el botón Descargas debe estar en la sidebar", async ({ page }) => {
      await expect(page.getByRole("button", { name: "Descargas" })).toBeVisible();
    });

    test("con la lista vacía, Reproducir/Aleatorio quedan deshabilitados", async ({ page }) => {
      await page.getByRole("navigation").getByRole("button", { name: "Descargas" }).click();
      await expect(page.getByTestId("hero-play")).toBeDisabled();
      await expect(page.getByTestId("hero-shuffle")).toBeDisabled();
      // Sin canciones no hay modo selección
      await expect(page.getByRole("button", { name: "Seleccionar" })).toHaveCount(0);
      // «Eliminar todo» también deshabilitado (no hay nada que borrar)
      await expect(page.getByRole("button", { name: /Eliminar todo/ })).toBeDisabled();
    });
  });

  test.describe("Vista de Inicio", () => {
    test("debe mostrar bienvenida cuando no hay historial", async ({ page }) => {
      await page.getByRole("button", { name: "Inicio" }).click();
      await expect(page.getByText(/Busca tu primera canción/)).toBeVisible();
    });

    test("debe mostrar el mensaje de ayuda", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText(/Encuentra cualquier canción/)).toBeVisible();
    });
  });

  test.describe("Salir de las vistas de biblioteca", () => {
    test("pulsar la sección activa (Descargas) vuelve a Inicio", async ({ page }) => {
      await page.getByRole("navigation").getByRole("button", { name: "Descargas" }).click();
      await expect(page.getByRole("heading", { name: "Descargas" })).toBeVisible();

      // Segundo click en la MISMA sección → debe salir a Inicio
      await page.getByRole("navigation").getByRole("button", { name: "Descargas" }).click();
      await expect(page.getByRole("heading", { name: "Descargas" })).toHaveCount(0);
      await expect(page.getByText(/Busca tu primera canción/)).toBeVisible();
    });

    test("pulsar la sección activa (Me gusta) vuelve a Inicio", async ({ page }) => {
      await page.getByRole("navigation").getByRole("button", { name: "Me gusta" }).click();
      await expect(page.getByRole("heading", { name: "Me gusta" })).toBeVisible();

      await page.getByRole("navigation").getByRole("button", { name: "Me gusta" }).click();
      await expect(page.getByRole("heading", { name: "Me gusta" })).toHaveCount(0);
      await expect(page.getByText(/Busca tu primera canción/)).toBeVisible();
    });

    test("cambiar a otra sección distinta sale de la vista actual", async ({ page }) => {
      await page.getByRole("navigation").getByRole("button", { name: "Descargas" }).click();
      await expect(page.getByRole("heading", { name: "Descargas" })).toBeVisible();

      await page.getByRole("navigation").getByRole("button", { name: "Historial" }).click();
      await expect(page.getByRole("heading", { name: "Descargas" })).toHaveCount(0);
      await expect(page.getByText(/No hay historial/)).toBeVisible();
    });

    test("de Inicio, un solo click en una sección la abre (sin toggle inverso)", async ({ page }) => {
      await expect(page.getByText(/Busca tu primera canción/)).toBeVisible();
      await page.getByRole("navigation").getByRole("button", { name: "Me gusta" }).click();
      await expect(page.getByRole("heading", { name: "Me gusta" })).toBeVisible();
    });
  });
});
