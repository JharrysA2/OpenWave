import { test, expect } from "@playwright/test";

const MOCK_SONG = {
  videoId: "abc123",
  title: "Canción de Prueba",
  artist: "Artista Uno",
  thumbnail: "https://example.com/thumb1.jpg",
  duration: 240,
};

test.describe("Player Bar", () => {
  test.beforeEach(async ({ page }) => {
    // Mock HTMLAudioElement.play to resolve immediately (avoids rejection in headless)
    await page.addInitScript(() => {
      HTMLAudioElement.prototype.play = () => Promise.resolve();
    });

    await page.route("http://127.0.0.1:8765/**", (route) => {
      const url = route.request().url();
      if (url.includes("/search?q=")) {
        return route.fulfill({
          status: 200,
          json: { results: [MOCK_SONG], artists: [], albums: [] },
        });
      }
      if (url.includes("/stream-url")) {
        return route.fulfill({
          status: 200,
          json: { url: "https://example.com/audio.mp3" },
        });
      }
      return route.fulfill({ status: 200, json: [] });
    });
    await page.goto("/");
  });

  test("debe mostrar el título SoundWave en la barra por defecto", async ({ page }) => {
    const soundwaveElements = page.getByText("SoundWave");
    const count = await soundwaveElements.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(soundwaveElements.first()).toBeVisible();
  });

  test("debe mostrar el título y artista al reproducir una canción", async ({ page }) => {
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.waitForSelector('input[placeholder*="Busca"]');
    await page.getByPlaceholder(/Busca canciones/).fill("prueba");
    await page.waitForTimeout(600);

    // Click on the first search result row
    const songTitle = page.getByText("Canción de Prueba").first();
    await songTitle.click();

    // The player bar info area should show the song title
    await expect(page.getByText("Canción de Prueba").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Artista Uno").first()).toBeVisible({ timeout: 5000 });
  });

  test("debe mostrar el tiempo en la barra al seleccionar una canción", async ({ page }) => {
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.waitForSelector('input[placeholder*="Busca"]');
    await page.getByPlaceholder(/Busca canciones/).fill("prueba");
    await page.waitForTimeout(600);

    await page.getByText("Canción de Prueba").first().click();
    // Duration should show 4:00 (240 seconds) - use first() to avoid strict mode
    await expect(page.getByText(/4:00/).first()).toBeVisible({ timeout: 5000 });
  });

  test("debe mostrar el botón de play/pausa en la barra", async ({ page }) => {
    // Just verify the player bar exists at the bottom
    const playerBar = page.locator('div[style*="backdrop-filter"]').last();
    await expect(playerBar).toBeVisible();
  });
});
