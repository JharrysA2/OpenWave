import { test, expect } from "@playwright/test";
import { openSettings } from "./helpers.js";

test.describe("Navegación", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://127.0.0.1:8765/**", (route) => route.fulfill({ status: 200, json: [] }));
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("debe mostrar los botones de navegación en la sidebar", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Inicio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buscar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Me gusta" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Historial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Descargas" })).toBeVisible();
  });

  test("debe navegar a la vista de búsqueda al hacer clic en Buscar", async ({ page }) => {
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByPlaceholder(/Busca canciones/)).toBeVisible();
  });

  test("debe navegar a la vista Me gusta", async ({ page }) => {
    await page.getByRole("button", { name: "Me gusta" }).click();
    await expect(page.getByRole("heading", { name: "Canciones que te gustan" })).toBeVisible();
  });

  test("debe navegar a Historial", async ({ page }) => {
    await page.getByRole("button", { name: "Historial" }).click();
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  });

  test("debe navegar a Descargas", async ({ page }) => {
    await page.getByRole("button", { name: "Descargas" }).click();
    await expect(page.getByRole("heading", { name: "Descargas" })).toBeVisible();
  });

  test("debe navegar de vuelta a Inicio desde otra vista", async ({ page }) => {
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: "Inicio" }).click();
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  });

  test("el botón de ajustes debe abrir el panel de configuración", async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('[data-testid="close-settings"]')).toBeVisible();
  });
});
