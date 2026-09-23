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
});
