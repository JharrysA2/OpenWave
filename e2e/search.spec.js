import { test, expect } from "@playwright/test";

const MOCK_SEARCH_RESPONSE = {
  results: [
    {
      videoId: "abc123",
      title: "Canción de Prueba",
      artist: "Artista Uno",
      thumbnail: "https://example.com/thumb1.jpg",
      duration: 240,
    },
    {
      videoId: "def456",
      title: "Otra Canción",
      artist: "Artista Dos",
      thumbnail: "https://example.com/thumb2.jpg",
      duration: 180,
    },
  ],
  artists: [
    {
      browseId: "artist1",
      name: "Artista Uno",
      thumbnail: "https://example.com/artist1.jpg",
    },
  ],
  albums: [
    {
      browseId: "album1",
      title: "Álbum de Prueba",
      thumbnail: "https://example.com/album1.jpg",
      type: "Álbum",
      year: "2024",
    },
  ],
};

test.describe("Búsqueda", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://127.0.0.1:8765/**", (route) => {
      const url = route.request().url();
      if (url.includes("/search?q=")) {
        const q = new URL(url).searchParams.get("q") || "";
        if (q.toLowerCase().includes("prueba")) {
          return route.fulfill({ status: 200, json: MOCK_SEARCH_RESPONSE });
        }
        return route.fulfill({ status: 200, json: { results: [], artists: [], albums: [] } });
      }
      if (url.includes("/search/videos")) {
        return route.fulfill({ status: 200, json: { results: [] } });
      }
      return route.fulfill({ status: 200, json: [] });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.waitForSelector('input[placeholder*="Busca"]');
  });

  test("debe mostrar el input de búsqueda y los tabs", async ({ page }) => {
    await expect(page.getByPlaceholder(/Busca canciones/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Música" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Videos" })).toBeVisible();
  });

  test("debe mostrar resultados de canciones al buscar", async ({ page }) => {
    await page.getByPlaceholder(/Busca canciones/).fill("prueba");
    await page.waitForTimeout(600);
    await expect(page.getByText("Canción de Prueba")).toBeVisible({ timeout: 5000 });
  });

  test("debe mostrar la sección de artistas", async ({ page }) => {
    await page.getByPlaceholder(/Busca canciones/).fill("prueba");
    await page.waitForTimeout(600);
    const artistSection = page.getByText("Artistas").first();
    await expect(artistSection).toBeVisible();
  });

  test("debe mostrar la sección de álbumes", async ({ page }) => {
    await page.getByPlaceholder(/Busca canciones/).fill("prueba");
    await page.waitForTimeout(600);
    await expect(page.getByText("Álbum de Prueba")).toBeVisible({ timeout: 5000 });
  });

  test("debe mostrar mensaje cuando no hay resultados", async ({ page }) => {
    await page.getByPlaceholder(/Busca canciones/).fill("zzzzresultadoinexistente");
    await page.waitForTimeout(600);
    await expect(page.getByText(/Sin resultados/)).toBeVisible();
  });

  test("debe alternar entre tabs Música y Videos", async ({ page }) => {
    await page.getByRole("button", { name: "Videos" }).click();
    await expect(page.getByRole("button", { name: "Música" })).toBeVisible();
  });

  test("debe limpiar la búsqueda al borrar el texto", async ({ page }) => {
    const input = page.getByPlaceholder(/Busca canciones/);
    await input.fill("prueba");
    await page.waitForTimeout(600);
    await input.fill("");
    await page.waitForTimeout(300);
    await expect(page.getByText("Canciones")).not.toBeVisible();
  });
});
