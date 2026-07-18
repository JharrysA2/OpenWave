import { test, expect } from "@playwright/test";
import { openSettings } from "./helpers.js";

test.describe("Panel de Configuración", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://127.0.0.1:8765/**", (route) => route.fulfill({ status: 200, json: [] }));
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("debe abrir el panel al hacer clic en el botón de ajustes", async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('[data-testid="close-settings"]')).toBeVisible({ timeout: 5000 });
  });

  test("debe cerrar el panel al hacer clic en el botón X", async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('[data-testid="close-settings"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="close-settings"]').click();
    await expect(page.locator('[data-testid="close-settings"]')).not.toBeVisible({ timeout: 3000 });
  });

  test("no debe estar visible inicialmente", async ({ page }) => {
    await expect(page.locator('[data-testid="close-settings"]')).not.toBeVisible({ timeout: 2000 });
  });

  test("debe mostrar el texto de configuración al abrir", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByText(/Ajustes/i).first()).toBeVisible({ timeout: 5000 });
  });
});
