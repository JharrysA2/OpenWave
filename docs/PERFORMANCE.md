# Presupuesto de rendimiento — SoundWave

> Contexto: **Tauri + Rust** (`src-tauri/`, vibrancy nativo del titleBar) +
> **React/Vite** en **WebView2** + backend Python sidecar (8765).
> Objetivo: consumo mínimo cuando la app no es foco u oculta; **estética
> intacta** (Liquid Glass + blur + letras dinámicas) cuando es visible.
> PC de bajos recursos jugando videojuegos de fondo ⇒ la app debe pesar lo
> mínimo sin perder su look.

## 1. `backdrop-filter` solo en superficies estáticas; fondos pre-renderizados

El blur en vivo solo cuesta cuando hay **repintado detrás** (medido: ≈0 % en
superficies estáticas por caché de compositing; ~1,8 % GPU en capa full-screen
que se repinta con letras/scroll). Por tanto:

- `backdrop-filter` permitido únicamente en superficies **estáticas**: sheet,
  popup, searchbar, ajustes, sidebar, titleBar, player bar.
- **Prohibido en superficies vivas**: grids, tarjetas, listas, botones con
  hover, contenido con scroll (cada repintado re-ejecuta el blur en la iGPU).
- Cualquier fondo desenfoque va **pre-renderizado** (canvas + WebP 1× por
  canción, `src/utils/imageBlur.js`), nunca `filter: blur()` en vivo en capa
  completa.
- **Nada de `will-change` sin medición** (medido: `will-change: filter` subió
  7,4 → 15,3 % GPU y se revirtió).
- Los tests de regresión son obligatorios e intocables: `theme.test`,
  `LibraryCard.test`, `AlbumCardRow.test`, `HomeView.test`, `LyricsView.test`,
  `PlayerBar.test`.

## 2. Karaoke por rAF con re-renders por cambio, no por frame

- Reloj = `requestAnimationFrame` muestreando `audio.currentTime` (fallback
  `progressRef`), y `setState` **solo** al cruzar de línea o de palabra: en
  frames muertos corre matemática pura y React no renderiza.
- **Nunca** re-renderizar React a 60 Hz (ese sí sería el pico de CPU que
  evitamos). Las transiciones CSS (.5 s) aportan la continuidad visual.
- El bucle se frena con `visible` y el navegador pausa rAF al ocultar la
  ventana. _(Implementado en `LyricsView.jsx`.)_

## 3. Sin promoción de capas forzada

- Nada de `translate3d(0,0,0)` ni `backface-visibility: hidden` globales: los
  motores modernos promueven capas cuando conviene; forzarlas gasta memoria y
  ancho de banda de la iGPU, y `backface-visibility` sobre texto puede degradar
  su antialiasing (riesgo estético).
- Las animaciones que se mueven usan `transform`/`opacity` (ya compuestos).
- Cualquier capa promovida (`will-change`) solo con medición detrás.

## 4. Segundo plano y pérdida de foco: congelar, no rediseñar

- `useVisibility` (visibilitychange + blur/focus) → clase `.app-hidden`:
  animaciones con `animation-play-state: paused` (pausadas, no muertas ⇒
  retoman donde estaban), backdrop/filter/shadow/will-change apagados, rAF de
  letras y de la barra frenados.
- La música sigue sonando y al volver (Alt+Tab) el primer frame recalcula el
  estado exacto. No se necesitan hooks en Rust: WebView2 reporta
  `document.hidden` y el `blur` de la ventana llega al JS.
- El modo Rendimiento (`perf-blur-off/anim-off/solid` + detección de software
  renderer, `src/utils/softwareRenderer.js`) cubre los equipos con GPU débil.

## 5. Aceleración por hardware (estado: ACTIVA, no hay que activarla)

- **WebView2 usa la GPU por defecto** (doc. oficial Microsoft: _"By default,
  WebView2 uses the GPU for rendering"_). Nuestra config **no** la desactiva:
  no se fijan `additionalBrowserArgs` (se heredan los de wry:
  `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`) y no existe
  `--disable-gpu` en el repo.
- Evidencia empírica propia: las mediciones con `scripts/measure-perf.ps1`
  reportan motores GPU reales (`video codec 0` = decodificación por hardware).
- **No se fuerzan flags GPU** (`--ignore-gpu-blocklist`,
  `--enable-gpu-rasterization`): en PCs malos el blocklist existe por drivers
  buggeados — ignorarlo puede dar pantalla negra; la ruta segura es el
  fallback automático: si WebView2 cae a render por software,
  `softwareRenderer.js` lo detecta y el modo Auto resuelve a **bajo consumo**.
- Diagnóstico visible para el usuario: Ajustes → Rendimiento muestra el
  renderer de la GPU y si la aceleración está activa.
- Reparto de trabajo: composición/raster/decode en GPU (WebView2 por defecto),
  títulos con vibrancy nativo (mica/tabbed, gratis), blur de fondos pre-render
  en canvas (1× por canción).

## 6. Dev vs distribución

- `start.bat` = `npm run tauri dev` (Vite dev + Rust debug): cómodo para
  desarrollar, pero **sin minificar y con HMR**. Las cifras de rendimiento se
  miden en este modo, así que en producción solo mejoran.
- La forma ligera para el usuario final es el bundle (`npm run tauri build` →
  MSI/NSIS): frontend minificado + gzip (`vite-plugin-compression`) y Rust en
  release.

## Regla de oro

Todo estilo con impacto potencial en GPU/CPU (backdrop-filter nuevo,
`will-change`, blur en vivo, promoción de capas, re-renders frecuentes)
exige una corrida de `scripts/measure-perf.ps1` (60 s, con `sistema` ≈ 6-8)
antes de merge. Sin medición detrás, no entra.
