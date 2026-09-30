# Presupuesto de rendimiento — SoundWave

> Contexto: **Tauri + Rust** (`src-tauri/`, vibrancy nativo del titleBar) +
> **React/Vite** en **WebView2** + backend Python sidecar (8765).
> Objetivo: consumo mínimo cuando la app no es foco u oculta; **estética
> intacta** (Liquid Glass + blur + letras dinámicas) cuando es visible.
> PC de bajos recursos jugando videojuegos de fondo ⇒ la app debe pesar lo
> mínimo sin perder su look.

## 1. `backdrop-filter` solo donde hay movimiento detrás o es modal; fondos pre-renderizados

El blur en vivo solo cuesta cuando hay **repintado detrás** (medido: ≈0 % en
superficies estáticas por caché de compositing; ~1,8 % GPU en capa full-screen
que se repinta con letras/scroll). Por tanto:

- **Superficies de la shell SIN blur**: sidebar, titleBar, searchbar y el
  banner de conexión **no** llevan `backdrop-filter` — detrás no pasa ni se
  anima nada (y la gradiente opaca del sidebar lo tapaba igualmente): el
  blur era puro coste invisible. Regresión = reintroducirlo.
- `backdrop-filter` permitido únicamente donde **hay movimiento real
  detrás** o es una **superficie de modal**:
  - **player bar** (`blur(10px)`): el scroll de las vistas y el karaoke
    pasan por detrás (y aun así `html.overlay-open` la apaga mientras un
    overlay la tapa);
  - **cristal de modal**: `GLASS.sheet` (los 12 modales) y `GLASS.settings`
    (panel de Ajustes) difuminan con `blur(40px)` sobre su degradado, con el
    detrás congelado por `overlay-open` (§7);
  - **transitorias no modales**: `GLASS.popup` (toast/volumen/crossfade) se
    queda en `blur(6px)` — pueden flotar sobre contenido que se mueve.
- **Prohibido en superficies vivas**: grids, tarjetas, listas, botones con
  hover, contenido con scroll (cada repintado re-ejecuta el blur en la iGPU) y,
  en particular, **en los scrims de los modales** (ver §7).
- Cualquier fondo desenfoque va **pre-renderizado** (canvas + WebP 1× por
  canción, `src/utils/imageBlur.js`), nunca `filter: blur()` en vivo en capa
  completa.
- **Nada de `will-change` sin medición** (medido: `will-change: filter` subió
  7,4 → 15,3 % GPU y se revirtió).
- Los tests de regresión son obligatorios e intocables: `theme.test`,
  `LibraryCard.test`, `AlbumCardRow.test`, `HomeView.test`, `LyricsView.test`,
  `PlayerBar.test`, `ModalsPerf.test`, `useOverlayLayer.test`.

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
- **Consumo ~0 con la ventana minimizada**: con la ventana oculta el único
  latido que queda es el de conexión al backend, reducido a 60 s (10 s si está
  caído) y con chequeo inmediato al volver a ser visible
  (`src/utils/backendHealth.js`); el resto de bucles (rAF de letras, progreso
  de la barra) ya está parado por `visible`, los precache usan
  `requestIdleCallback` (no corre oculto) y la cadena de crossfade solo vive
  mientras hay música sonando (2 s de cadencia, 300 ms al acercarse). Lo único
  irreductible es el propio pipeline de audio si la canción sigue en marcha.
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

## 7. Overlays (modales, sheets, paneles): cristal de modal sobre fondo congelado

**Síntoma medido (iGPU compartida):** en reposo la app consumía ≈ **33 %**; al
abrir **cualquier** modal/submenú/sección desplegable subía a **76 %
sostenido** mientras estaba montado. Con Ajustes → Rendimiento activo (blur y
animaciones off) bajaba a **11 %**, así que el culpable era la cadena
`backdrop-filter` + animaciones, no React.

**Primera vuelta — insuficiente.** Se quitó el blur del scrim y se bajó el de
las hojas de `blur(10px) saturate(140%)` a `blur(6px)` sin `saturate`: **seguía
por encima del 70 %**. El coste no era el radio de Gauss ni el `saturate`,
era **el filtro en sí** — una hoja a pantalla completa con `backdrop-filter`
re-ejecuta captura + blur de iGPU en cada repintado de detrás, y ese detrás
sigue vivo (ver causa).

**Causa.** Un modal no congela lo que hay detrás: la barra del player sigue
repintando el progreso a 5 Hz, el reloj de karaoke sigue haciendo `setState`
de línea/palabra, los `.skeleton` brillan, el punto de conexión parpadea, el
"sonando ahora" late y los hovers siguen vivos. Cada repintado invalida la
región del backdrop y la iGPU re-ejecuta el blur de **cada capa que toca** en
ese mismo frame. Encima, los modales acumulaban: scrim a pantalla completa con
`blur(8px)`, hojas con `blur(10px) saturate(140%)` y un `blur(10px)` **por
resultado** de búsqueda apilado sobre el de la hoja. Y debajo del scrim seguían
difuminando las superficies de la shell (sidebar, titlebar, searchbar, player),
que nadie ve pero que cada repintado pagaba igual.

**Reglas (todas con test de regresión):**

1. **El scrim —capa de atenuación a pantalla completa, fondo plano— nunca
   lleva `backdrop-filter`.** El cristal (superficie con degradado) sí difumina;
   el velo negro que lo cubre, no. Además, `html.perf-solid [style*=
"backdrop-filter"]` le pintaría el velo entero de color sólido en modo
   Rendimiento (bug ya visto en el scrim de Letras).
2. **Presupuesto de overlays = `blur(40px)` SOLO en la superficie de cristal
   de modal:** `GLASS.sheet` (los 12 modales) y `GLASS.settings` (panel de
   Ajustes full-screen, que es donde viven las filas desplegables)
   difuminan con `blur(40px)` — el desenfoque visible que el diseño pide
   (`DESIGN.md`: mín. 20px) — y **sin `saturate`**; `GLASS.popup`
   (toast/volumen/crossfade: no modal, transitorio) se queda en `blur(6px)`;
   scrim, filas, resultados y cualquier capa interna, **0 filtros** (el
   opt-out explícito `backdropFilter: "none"`, de coste cero, se permite).
   ¿Por qué el radio ya no es el coste? Porque la regla 4 congeló el detrás:
   un `backdrop-filter` sobre un fondo estático lo cachea el compositor ≈0 en
   reposo y el radio solo se paga en la animación de apertura (recortada en
   el A/B). Si un A/B con openwave-perf vuelve a condenar una superficie (la
   candidata es el panel full-screen), se baja ESA superficie y el resto
   sigue. `expectOverlayGlassBudget` impone: superficie con degradado y
   `blur(40px)` (modal) o `blur(6px)` (transitorio) exacto — cualquier
   otro valor dentro de un overlay es regresión.
3. **Ninguna fila/resultado dentro de una hoja crea su propia capa blur**: se
   sustituye por gradiente + sombra (se apilaba un blur por elemento).
4. **Mientras hay un overlay montado, `html.overlay-open`** (clase con
   ref-count que añade `src/hooks/useOverlayLayer.js`) deja de pagar todo lo
   que está detrás, tapado por el scrim y por eso invisible:
   - `animation-play-state: paused` de `.skeleton`, `.connection-dot` y
     `.now-playing-pulse` (mismo patrón que `.app-hidden`, §4);
   - `backdrop-filter: none !important` sobre las superficies de la shell
     (`.app-sidebar`, `.app-titlebar`, `.app-searchbar`, `.player-bar`):
     hoy solo el player-bar difumina (la shell estática ya no lleva blur,
     §1), pero la regla se mantiene para las cuatro clases como defensa
     barata — si alguien reintrodujera blur en la shell, debajo del scrim
     solo costaría iGPU. Las clases las llevan `Sidebar`, `TitleBar`,
     `SearchBar` y `PlayerBar`;
   - `useOverlayActive()` (mismo módulo) congela el intervalo de progreso de
     `PlayerBar` (5 Hz) y el reloj de karaoke de `LyricsView` (`setState` de
     línea y palabra): writes a un fondo invisible. Al cerrar, el efecto se
     re-programa y el primer tick recalcula desde `progressRef` /
     `audio.currentTime`, así que no se pierde progreso.
5. **Nada de `transition: "all"`** (37 usos eliminados del repo: 10 en
   `LyricsView.jsx` y 27 en el resto): cada elemento declara solo las
   propiedades que cambian de verdad (`background`, `color`, `transform`,
   `border-color`, `box-shadow`, `font-weight`). Con `all`, cualquier
   repintado de un elemento vivo entraba en la maquinaria de transiciones y
   forzaba recálculo de estilo por frame.

**Cifras de referencia** (modo dev; método `scripts/measure-perf.ps1`):

| Escenario                                 | Antes    | Resultado                                       |
| ----------------------------------------- | -------- | ----------------------------------------------- |
| Reposo, sin overlay                       | 33 %     | 33 %                                            |
| Modal abierto — v1: scrim sin blur + 6 px | —        | **> 70 %** (medido: no bastaba)                 |
| Modal abierto — v2: 0 filtros + congelado | **76 %** | **≈ 11-15 %** (a verificar en la misma máquina) |
| Ajustes → Rendimiento activo              | 11 %     | 11 % (límite de referencia)                     |

**A/B del cristal de overlays** (openwave-perf a 2 Hz; ventana maximizada
1920×1079, `prefers-reduced-transparency: false`, música en bucle; sesiones
`glass_pre2` = A con overlays **sin cristal**, `glass_post3` = B con este
presupuesto; steady-state = se descartan los 1,5 s de apertura de cada hoja,
misma regla en las dos sesiones):

| Fase con overlay abierto         | A: 0 filtros | B: `blur(6px)` | Δ B−A       |
| -------------------------------- | ------------ | -------------- | ----------- |
| Panel de Ajustes (≈ 12 s)        | 1,85 %       | 1,86 %         | **+0,00 pp** |
| Hoja CreatePlaylist (≈ 8 s)      | 1,80 %       | 2,22 %         | **+0,41 pp** |
| **Agregado** media / p95 / máx   | 1,83 / 2,1 / 2,2 % | 2,01 / 2,5 / 2,9 % | **+0,18 / +0,4 / +0,6 pp** |

Long tasks **0 en ambas** sesiones, `layout_ms` 0 en ambas y `script_ms`
−0,19 ms a favor de B (el congelado no se tocó). **Criterio de aceptación
(≤ +3-4 pp vs 0 filtros): PASA** con ~18× de margen; sin recorte, el pico
transitorio de apertura (1 tick) sube a 23,4 % en B frente a 17,1 % en A y
B estabiliza a los 1 s. El baseline sin overlay queda en 3,50 % (A, con el
warm-up de arranque) → 1,76 % (B). Validez verificada en corrida: **0 ms de
`app-hidden`** (sin foco ⇒ `backdrop-filter: none`) dentro de las tres
ventanas medidas de B, vía `MutationObserver` de la clase de `<html>`;
música sonando y geometría idéntica en las dos sesiones. Ojo: el campo
`focused` del monitor es Win32 (`GetForegroundWindow`) y **diverge** de
`document.hasFocus()` — el criterio de validez es la clase `app-hidden`, no
ese flag.

**A/B del presupuesto v3 — shell sin blur + cristal de modal a 40px**
(openwave-perf, misma metodología y recorte; sesiones `glass_post3` = A con el
estado anterior — shell con blur y modales a `blur(6px)` —, `glass_post4` = B
con este presupuesto; veredicto VÁLIDA: `app-hidden` 0 ms en las tres
ventanas, geometría idéntica, música en bucle):

| Fase con overlay abierto       | A: post3 (6px)  | B: post4 (40px) | Δ B−A                                  |
| ------------------------------ | --------------- | --------------- | -------------------------------------- |
| Baseline (sin overlay)         | 1,76 %          | 1,80 %          | +0,04 pp                               |
| Panel de Ajustes (≈ 12 s)      | 1,86 %          | 1,93 %          | **+0,07 pp** (p95 2,5→2,1)             |
| Hoja CreatePlaylist (≈ 8 s)    | 2,22 %          | 2,19 %          | **−0,02 pp**                           |
| **Agregado** media / p95 / máx | 2,01 / 2,5 / 2,9 % | 2,04 / 2,4 / 3,2 % | **+0,03 / −0,1 / +0,4 pp**         |

Long tasks **0 en ambas**, `layout_ms` 0 en ambas. **Criterio (≤ +3-4 pp):
PASA**: subir el radio de 6px a 40px sobre fondo congelado es ~gratis
(compositor cachea el frosted; lo que costó históricamente fue el detrás
repintando, no el radio) y quitar el blur de la shell no mueve el baseline
fuera del ruido. Consumo global de la sesión: CPU 0,9 % → **0,7 %** y GPU
1,3 % → **1,1 %** de media frente a `glass_post3`.

Tests de regresión: `ModalsPerf.test.jsx` (los 11 overlays a pantalla
completa: cristal de modal 40px en la superficie, 0 filtros en el resto),
`LyricsView.test.jsx` (hoja a 40px, scrim sin blur, resultados sin capa
propia y reloj de karaoke congelado bajo el modal), `useOverlayLayer.test.jsx`
(clase + estado React + reglas CSS de animaciones y blurs de la shell),
`PlayerBar.test.jsx` (intervalo de progreso congelado con overlay y reanudado
al cerrarlo), `theme.test.js` (`sheet`/`settings` a `blur(40px)`, `popup` a
`blur(6px)`, shell sin blur y sin `saturate`) y `ConnectionBanner.test.jsx`
(banner de conexión sin `backdrop-filter`).

## Regla de oro

Todo estilo con impacto potencial en GPU/CPU (backdrop-filter nuevo,
`will-change`, blur en vivo, promoción de capas, re-renders frecuentes,
`transition: "all"`) exige una corrida de `scripts/measure-perf.ps1` (60 s, con
`sistema` ≈ 6-8) antes de merge. Sin medición detrás, no entra.
