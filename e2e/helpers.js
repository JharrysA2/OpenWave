/**
 * Abre el panel de configuración llamando directamente al onClick de React.
 *
 * El botón de ajustes está bajo un div `data-tauri-drag-region` con `zIndex: 99999`
 * que bloquea los clicks DOM normales. Esta función accede al event handler de
 * React a través de `__reactProps$<hash>` en el elemento del DOM para evitar
 * el bloqueo del overlay.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openSettings(page) {
  await page.waitForSelector('[data-testid="settings-btn"]');
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="settings-btn"]');
    if (!btn) return;
    const key = Object.keys(btn).find((k) => k.startsWith("__reactProps"));
    if (key && btn[key] && typeof btn[key].onClick === "function") {
      btn[key].onClick();
    }
  });
}
