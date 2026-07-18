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
    test("debe mostrar la vista vacía inicialmente", async ({ page }) => {
      await page.getByRole("button", { name: "Me gusta" }).click();
      await expect(page.getByRole("heading", { name: "Canciones que te gustan" })).toBeVisible();
      await expect(page.getByText(/Dale me gusta/)).toBeVisible();
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
    test("debe mostrar la vista vacía inicialmente", async ({ page }) => {
      await page.getByRole("button", { name: "Descargas" }).click();
      await expect(page.getByRole("heading", { name: "Descargas" })).toBeVisible();
      await expect(page.getByText(/Descarga canciones/)).toBeVisible();
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
      await expect(page.getByText(/Usa la barra de búsqueda/)).toBeVisible();
    });
  });
});
