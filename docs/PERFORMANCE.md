# Presupuesto de rendimiento — OpenWave

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

## 4. Segundo plano y pérdida de foco: congelar por VISIBILIDAD (no por foco)

Especificación vigente (2026-10-02, pedido explícito del usuario):

| Evento                        | Respuesta                                                     |
| ----------------------------- | ------------------------------------------------------------- |
| Perder el foco (ventana vista) | **Nada**: ventanas divididas / Alt+Tab con la app a la vista → blur, animaciones, karaoke y progreso siguen como siempre |
| Oculta (minimizada), t=0      | `app-hidden`: congela todo menos la música                    |
| Oculta ≥ 15 s                 | `app-sleep`: animaciones **apagadas** + liberación de RAM     |
| Restaurar/expandir            | todo vuelve a la normalidad al instante                       |

- `useVisibility` calcula
  `visible = document.visibilityState !== "hidden" && !isMinimized()`:
  - **`visibilitychange`**: documento oculto → congelado síncrono, sin IPC.
  - **`getCurrentWindow().isMinimized()` (Tauri → Win32 `IsIconic`)**: es la
    señal de MINIMIZAR. **WebView2 NO cambia `visibilityState` al minimizar**
    (verificado en vivo el 2026-10-02: con `ShowWindow(SW_MINIMIZE)` el
    documento seguía `"visible"` con `focus=false`) → con `visibilitychange`
    solo, la app nunca se congelaría al minimizar.
  - El foco **no decide nada**: `blur`/`focus` (DOM) y los eventos de ventana
    de Tauri (`onFocusChanged`/`onResized`) solo disparan una *reconsulta* de
    `IsIconic`. Con ventanas divididas (blur + `IsIconic=false`) no se pausa
    ni apaga nada.
  - **Restaurar sin foco**: tao emite `Resized` en todos los `WM_SIZE`
    (minimize y restore) → `onResized` despierta aunque el foco no vuelva
    (p. ej. `ShowWindow(SW_RESTORE)` sin activación).
  - **WATCHDOG de despertar (2026-10-03)**: en vivo se midió que las
    señales de restauración pueden llegar **retardadas o no llegar**: la
    ventana quedó restaurada y enfocada con `app-sleep` clavado durante
    minutos (letras sin fondo y animaciones muertas con la ventana a la
    vista). Por eso, mientras `visible=false` con el documento a la vista,
    un timer vuelve a consultar `IsIconic` **cada 1 s** → el despertar
    ocurre en ≤1 s aunque no llegue ningún evento. Al despertar el efecto
    se destruye: **cero timers ni IPC con la app viva** (test que lo
    verifica contando llamadas a `isMinimized`).
  - Sin runtime Tauri (tests/jsdom) `isMinimized()` lanza y se resuelve en
    `false`: solo manda `visibilitychange`.
- `PerformanceContext` añade `app-hidden` a `<html>` en cuanto la ventana queda
  oculta: animaciones con `animation-play-state: paused` (pausadas, no muertas
  ⇒ retoman donde estaban), backdrop/filter/shadow/will-change apagados con
  CSS `!important`, rAF de letras y progreso de la barra frenados por
  `visible`. Si la ventana sigue oculta `APP_SLEEP_MS` (15 s, exportado de
  `PerformanceContext`) pasa a **`app-sleep`**: `animation: none` +
  `transition: none` + cero efectos en todos los elementos, y los componentes liberan
  recursos pesados vía contexto `sleeping`:
  - `LyricsView` **desmonta la capa de fondo `150vmax`** (el mayor
    consumidor: abrir Letras +341 MB / cerrar −191 MB medidos, ver §8) y la
    remonta con la misma `src` al despertar (repaint sin recarga de red);
  - `usePlayer` vacía las `Image` detached del precaché de portadas
    (`preloadedImgsRef`); al despertar solo se precachea la siguiente
    canción con el próximo cambio de cola.
- Ambas clases (y el sueño) dependen de `pauseEffectsHidden` (Rendimiento →
  «Pausar efectos al ocultar»): con ese ajuste apagado no se congela ni se
  duerme nada.
- **Exención del cristal de modal**: `html.app-hidden:not(.perf-blur-off):
  not(.perf-solid) [style*="blur(40px)"]` mantiene el `backdrop-filter` de las
  hojas y paneles (`GLASS.sheet`/`GLASS.settings`) mientras dure `app-hidden`
  (bug «los modales no tienen blur», 2026-09-29). Hoy `app-hidden` solo se
  activa con la ventana invisible, pero la exención se conserva por si el
  motor reporta oculto con la ventana a la vista: solo se salva el
  `blur(40px)` inline; shell/player/popup siguen apagándose y los modos
  explícitos de Rendimiento ganan gracias al `:not()`.
- La música sigue sonando y al restaurar el primer frame recalcula el estado
  exacto. No se necesitan hooks en Rust: basta el IPC ya existente
  `getCurrentWindow().isMinimized()` (y `document.visibilityState` sí reporta
  `hidden` cuando la ventana se oculta de verdad, p. ej. en un navegador).
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
- Tests: `PerformanceContext.test.jsx` (ciclo oculta→15 s→restaurar;
  minimizado por `IsIconic` con `visibilityState` visible, incluido restaurar
  SOLO por `onResized` sin foco; blur con `IsIconic=false` no congela;
  watchdog: restaurar sin NINGUNA señal → despierta en ≤1 s y después cero
  IPC; pauseEffectsHidden OFF; contexto `sleeping`; CSS de `app-sleep`) y
  `LyricsView.test.jsx` (desmontaje/remontaje del fondo en `app-sleep`).

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
`blur(6px)`, shell sin blur y sin `saturate`), `ConnectionBanner.test.jsx`
(banner de conexión sin `backdrop-filter`) y `PerformanceContext.test.jsx`
(apagado de `app-hidden` en `index.html` + exención del cristal `blur(40px)`
al perder el foco).

## 8. Memoria (RAM / GPU): diagnóstico «llega hasta 1,5 GB»

**Síntoma reportado:** en uso normal la app alcanza ~1,5 GB (pico medido:
**2.206 MB** de proceso GPU en 90 s).

**Diagnóstico (2026-10-02):** no hay fuga de JavaScript:

- Heap JS estable en 3-7 MB, DOM estable, 0 canvas sueltos, PID del proceso
  GPU estable (sin crashes ni reciclajes forzados).
- El consumo vive en el **proceso GPU**: `private=492MB mapped=1486MB
  image=110MB` — texturas mapeadas, no memoria JS.
- Cachés de disco sanas (~417 MB). Brave en el mismo equipo GPU: 587 MB
  (la escala es del motor, no de la app).
- Upstream: [Chromium #41125802](https://issues.chromium.org/issues/41125802).

**Línea base (script `cdp-baseline`):**

| Estado                        | GPU process        |
| ----------------------------- | ------------------ |
| Reposo (sin música)           | 134-264 MB         |
| Uso activo (música + Letras)  | **134 → 2.206 MB en 90 s** |

**A/B en reposo (sin música, sin vistas):** inyectar
`* { backdrop-filter: none; filter: none }` no movió la memoria (planeta
exacto 1,501-1,502 MB): **en reposo los filtros no son el consumidor**.

**A/B activo — reproducción sola (2 min control + 2 min filtros OFF):**
con música sonando y ventana enfocada en Inicio, el proceso GPU quedó
**PLANO** (280 → 277 MB durante 4 min, filtros ON y OFF por igual):
**la reproducción por sí sola no crece**.

**A/B activo — con Letras abierto (`cdp-letras-ab5`, 2026-10-02, 8 min,
música + foco forzados, fondo con fallback `blur(12px)` + `sw-bg-spin`
activo):**

| Fase                    | GPU (proceso)            | Renderer                  |
| ----------------------- | ------------------------ | ------------------------- |
| A · control 120 s       | 301 → meseta **358-369** | 64 → 424 (oscila) → 186   |
| B · filtros OFF 120 s   | meseta **342-372**       | 134-234                   |
| C · filtros ON 60 s     | meseta **346-374**       | 155-210                   |
| D · cambio de canción   | salto **+40 → 408-411**  | 211-288                   |

- **Filtros ON y OFF idénticos** (A ≈ B ≈ C): el fallback de filtro CSS del
  fondo de Letras **no es el consumidor** → descartado como fix.
- Letras cuesta un **+90 MB fijo** de GPU frente a reproducción sola
  (~278 MB): la textura de la capa `150vmax`, no un crecimiento.
- **Ninguna fase crece sin control** en 8 min (todas meseta); el único salto
  sostenido viene de los **cambios de canción** (ver sonda siguiente) —
  caché de texturas que Chromium no purga sin presión de sistema, coherente
  con upstream [Chromium #41125802](https://issues.chromium.org/issues/41125802).
- El **renderer** oscila con el karaoke y las imágenes (64 → 424 MB) pero
  **vuelve a bajar** (155-186 MB al pararse la vista): no es una fuga.

**Sonda de acumulación (`cdp-songcycle`, 5 cambios de canción seguidos con
Letras abierto):** GPU **379 → 531** (pico del primer cambio: texturas vieja +
nueva conviviendo) → meseta 439-447 → **452 MB**. Neto: **+73 MB en 5
cambios (~15 MB por cambio que no se devuelven)** más picos transitorios de
~+150 MB durante la transición.

_Nota sobre la línea base de 2.206 MB_: ese pico de 90 s no se reprodujo en
las corridas controladas posteriores (meseta ~370-410 MB con Letras); la
métrica es la misma (`PrivateMemorySize64` del `gpu-process`). La
explicación consistente con todos los datos es la **retención por cambio de
canción (~15 MB netos + picos de ~150 MB por transición)**: en una sesión
larga con decenas de cambios alcanza los ~1,5-2 GB reportados y solo se
alivia al destruir elementos (cerrar Letras −191 MB) o con la purga del
motor.

**Flags Chromium evaluados y rechazados:** `--force-gpu-mem-*` — reportes de
«sin efecto» y riesgo de romper el rendering (caso Electron). No se aplican.

**Veredicto y decisiones:**

- **Sin fix de filtros**: el A/B demuestra que `filter`/`backdrop-filter` no
  mueven la memoria en ningún estado (reposo, reproducción, Letras).
- **Fix de app implementado** (nuevo comportamiento pedido): congelado por
  visibilidad + **`app-sleep` a los 15 s de ventana oculta** que desmonta el
  fondo de Letras y vacía el precaché de portadas (§4) → la memoria pesada se
  libera mientras la app está minimizada y se reasigna al restaurar.
- **Documento, no flags**: se mantiene la decisión de no forzar flags GPU;
  la palanca del usuario es «Pausar efectos al ocultar» (por defecto ON).

## 9. Letras: «Girar el fondo» costaba +14–37 pts de GPU → `steps(720)` + capa diagonal + pre-difuminado

Síntoma (2026-10-03): en la pantalla de Letras la GPU integrada (Radeon
740M) marcaba ~75% «antes gastaba menos de 20%».

Diagnóstico en vivo (CDP + `Get-Counter '\GPU Engine(*)\Utilization
Percentage'` atribuido por árbol de procesos de OpenWave; ventana 1100×720,
app enfocada, música sonando):

| Estado                                    | GPU 3D app |
| ----------------------------------------- | ---------- |
| Giro CONTINUO (`sw-bg-spin`)              | 63–70% (sesión A) / 30% (sesión B) |
| Fallback con `filter: blur(12px)`         | +1% (irrelevante) |
| `contain: paint` del fondo                | sin efecto medido |
| Rotación estática (animación apagada)     | 16%        |
| **`steps(360)` / `steps(720)` (giro ON)** | **10.9% / 11.6%** |
| Minimizado + `app-sleep`                  | **2.2%**   |

- **Ventana MAXIMIZADA (1920×1079, capa 150vmax = 2880², música sonando)**,
  pareado en la misma sesión (2026-10-03, tras instalar el fix):
  continuo **60.9% → steps(720) 36.6%**; en muestras sueltas, continuo
  50–64% vs steps 37–44%, con suelo sin giro ≈ 18–30%. La resolución
  importa: el coste por repintado escala con píxeles (ventanada 1100×720
  steps ≈ suelo 11%). El absoluto se mueve ±10 pts con la carga del
  sistema y el tramo de la letra; lo fiable es el delta pareado ≈ −15 a
  −25 pts.

- **Causa**: la rotación continua actualiza la matriz de transformación en
  **cada frame** → el compositor repinta la capa 150vmax en cada vsync.
  Con `animation-timing-function: steps(N, jump-none)` la matriz solo cambia
  N veces/s y Chromium **salta los frames cuya matriz no cambia**; a 90
  s/vuelta el salto por paso es invisible sobre el fondo difuminado
  (`jump-none` cierra el último paso en 360°=0° → bucle seamless).

- **A/B de la tarde (2026-10-03; maximizada 1920×1079, capa 2880², con
  música y el mismo tema en toda la tanda)**: intercalado `steps(720)` =
  43,2 / 50,1% (media **46,7%**) vs `steps(360)` = 39,8 / 34,9% (media
  **37,4%**) — **las 4 muestras sin solape**, con el sistema en 69–78%.
  Se fija `steps(360)` (4 pasos/s, 1° por paso): ~9 pts menos que 720.

- **El pre-difuminado (`bgBlurUrl`) nunca se activaba en producción —
  bug de CSP**: `img-src` no permitía `http://127.0.0.1:8765` (sí lo
  hacían `connect-src` y `media-src`), así que la `Image` con
  `crossOrigin` del proxy de miniaturas era bloqueada (confirmado con el
  evento `securitypolicyviolation` → `img-src`), el fallback directo
  contaminaba el canvas y la capa rotaba con `filter: blur(12px)
  saturate(1.2) brightness(0.7)` en vez del flujo diseñado (cadena ya
  aplicada en canvas, textura pre-difuminada más ligera, capa sin
  `filter`). Fix: añadir el origen del backend a `img-src` en
  `src-tauri/tauri.conf.json` (+ guard en `imageBlur.test.js`). **OJO con
  la atribución**: en el A/B pareado el filtro a 4 pasos/s no movió la
  aguja (con filtro 20,0% vs sin filtro 20,7/20,0% en la verificación
  final) — el filtro no era el motor del coste; sí lo eran la frecuencia
  de pasos y, sobre todo, la rotación continua.

- **El absoluto depende de la carga total del sistema**: con la rotación
  PAUSADA (suelo puro: karaoke + progreso) el mismo build marcó 18,4%
  con el sistema al ~29% y 43,8% con el sistema al ~85% — la GPU
  integrada está compartida, así que cualquier % suelto del Administrador
  de Tareas hay que leerlo con la carga de fondo. Lo fiable sigue siendo
  el delta pareado en la misma tanda.

- **Verificación final en el build instalado (2026-10-03; MSI
  `63921b2e…`, maximizada 1920×1079, capa 2880², música, app enfocada)**:
  estado shipped `steps(360)` + `filter: none` (fondo `data:image/webp`
  pre-difuminado) → **20,7 / 20,0 / 20,0%** de GPU 3D en tres muestras
  intercaladas (sistema 29–47%); suelo con rotación pausada **15,9%** →
  la rotación cuesta ya solo ~+4 pts. Recorrido completo del día:
  continuo **60,9%** → steps(720) **36,6%** → steps(360) **~20%**
  (−67% sobre el continuo). El salto respecto a la tarde (360 ≈ 37% con
  el sistema al 69–78%) vuelve a confirmar que el absoluto se infla con
  la carga.

- **Fix**: rama `settings.lyricsRotateBg` de
  `src/components/LyricsView.jsx` → `steps(720, jump-none)` + capa
  `calc(hypot(100vw, 100vh) * 1.02)` (estado final; el `steps(360)` de la
  mañana se revirtió, ver «Ronda 2» abajo) (+ test en
  `LyricsView.test.jsx`); CSP `img-src` en
  `src-tauri/tauri.conf.json` (+ test guard en `imageBlur.test.js`).
- **Nota metodológica — por qué «antes» marcaba <20%**: (1) la rotación
  **no llegaba a girar** hasta 2026-10-01: las `@keyframes sw-bg-spin`
  vivían en un `<style>` runtime con nonce que la CSP bloqueaba en la app
  instalada — `animationName` resolvía pero el transform estaba
  **congelado** → fondo estático = coste de imagen parada (el propio bug
  «el botón de girar el fondo no funciona» reportado aquel día); (2) el
  código anterior a `2571d17` pausaba todos los efectos al perder el
  foco (`visible = visibilityState && hasFocus()`), así que abrir el
  Administrador de Tareas para mirar la GPU medía la app **congelada**.
  Hoy, por la spec (a) (ventanas divididas no pausan nada), se mide el
  coste real con la app viva — este §9 es ese coste.

### 9.1 Ronda 2 (2026-10-03 tarde): el `steps(360)` se veía en pausas + el karaoke

El usuario reporta dos cosas: «el movimiento se ve en pausas, avanza en
pausas» (el salto de 1°/250 ms del `steps(360)` **es perceptible**) y
«en Letras sigue al 50%». Diagnóstico en vivo en el build instalado
(maximizada 1920×1079, música, app enfocada; sistema al 74–87% = la
condición del usuario):

| Estado (CDP, verificado por set-eval)                | GPU 3D app | Sistema |
| ---------------------------------------------------- | ---------- | ------- |
| Shipped: `steps(360)` @ capa 150vmax (2880²)         | 40,4%      | 83,1%   |
| `steps(720)` @ capa 150vmax                          | 44,1%      | 86,8%   |
| **`steps(720)` @ capa diagonal (`hypot`, 2246²)**    | **38,9%**  | 82,3%   |
| Suelo (rotación pausada)                             | 31,4%      | 74,6%   |

- **`hypot()` funciona en el WebView2**: `calc(hypot(100vw, 100vh) *
  1.02)` resolvió a `offsetWidth=2246` (Chrome 111+). El lado mínimo
  que cubre el viewport en **todos** los ángulos es la diagonal
  √(w²+h²) (la esquina más lejana tiene radio exactamente esa);
  150vmax sobre-dimensionaba un 30% → −39% de píxeles por repintado.

- **Se revierte a `steps(720)`**: 720@diagonal (38,9%) es **más barato
  que el 360@150vmax shipped (40,4%) y se mueve a 8 pasos/s** (0,5°/
  125 ms — la cadencia aceptada visualmente desde la mañana). Arreglo
  completo de ambas quejas: sin pausas visibles y menos GPU.

- **Atribución del suelo (karaoke)**, pareada con carga externa
  constante (others = sistema − app ≈ 36–45 en todas las muestras):
  suelo completo 31–34% → oculto el texto de Letras **9,4%** → ocultos
  también gradients+bg **6,2%**. El karaoke es el motor, no la rotación
  ni los gradients. Descomposición de ese karaoke (controles 17,4/16,7%):

  | Variante medida (rotación pausada)        | GPU 3D app | Δ vs control |
  | ----------------------------------------- | ---------- | ------------ |
  | Control (glow doble radio + transitions)  | 17,4%      | —            |
  | Sin `text-shadow` en las palabras         | **6,7%**   | **−10,7**    |
  | Sin sombra + sin transiciones             | 7,0%       | (sin sombra, las transiciones no pegan) |
  | Snap completo (sin transitions), glow ON  | 32,5%      | −3/−5 (controles 37,7/34,8) |
  | **Solo quitar el radio de 32px**          | **28,3%**  | **−4,0** (controles 32,3; others 34,8/34,0) |
  | Glow solo en la palabra activa            | 33,8%      | −2,7 (insuficiente: repintar la palabra que apaga/gana el glow cuesta lo mismo) |

  **Mecanismo**: `transition: …, text-shadow .5s` (y el `color`/`font-weight`)
  repintaba el span **en cada frame** durante .4–.5 s por palabra, y cada
  repintado de un span con `text-shadow` re-rasteriza el blur; con todas
  las palabras cantadas manteniendo el glow, la cascada es continua.

- **Fix implementado** (`KaraokeWords` en `LyricsView.jsx`): glow de un
  **solo radio (16px)** y **sin `transition`** (resalte a golpe, el
  estándar del karaoke). Estimado pareado: −5 a −7 pts en el karaoke
  denso. Opción aún más agresiva medida pero NO implementada: quitar el
  glow del todo = −10,7 pts (dejaría el karaoke plano, blanco/terciario).

- **Pitfall metodológico (confirmado 5 veces)**: con la ventana
  **ocluida** (otra app maximizada delante) WebView2 **suspende la
  composición** → la app marca 0–7% e «inválido»; **minimizada** →
  `app-sleep` → 0%. Toda muestra debe verificar
  `isMinimized=false + document.hasFocus() + cls=""` (vía set-eval)
  antes y después de leer el contador.

### 9.2 Ronda 3 (2026-10-03 tarde): picos «24↔50 todo el rato» y suavidad del karaoke

El usuario reporta: (1) tras el snap del karaoke «palabra a palabra no
es suave»; (2) la GPU «tiene picos de 24 a 50% y así todo el rato, eso
no es sostenible». Se añade `gpu-series.ps1` (valor por segundo en vez
de media) para ver la FORMA de la onda:

- **Onda del build shipped** (maximizada, música, enfocada): base
  **14–16%** con **picos de 33–49% cada 3–5 s** — los picos coinciden
  con los **cambios de línea** (media 20–37 según la sección y la carga;
  la serie con el sistema inactiva llegaba a media 36,6 — los
  absolutos siguen atados al entorno, solo valen parejas).

- **Atribución por sondeos intercalados** (seek al mismo punto de la
  canción ⇒ mismo contenido; others = sistema − app ≈ 32–34 en todas):

  | Variante (sonda CDP)                    | media | picos t=1,3,5     |
  | ---------------------------------------- | ----- | ----------------- |
  | Control                                  | ~20   | **33–44**         |
  | Sin scroll suave (K)                     | 18,2  | **24–34** ← scroll ≈ −9 pts/pico |
  | Sin transiciones de fila (G)             | 19,9  | 33–44 (igual)     |
  | Sin visual de palabras (M)               | 20,4  | 30–46 (igual)     |
  | Lejanas sin transición de font-size (F)  | 20,4  | 32–44 (igual)     |
  | **Fade de color (J)**                    | **19,9** | 33–43 (**igual ⇒ la suavidad es gratis**) |
  | Banda central de scroll (T)              | 36,1  | ≈ control (sesión ruidosa: 4 series con otros≈9) |

- **Conclusiones implementadas**:
  1. **Suavidad del karaoke restaurada**: `transition: color .5s,
     font-weight .4s` (sin `text-shadow`) — sonda J: coste ~0.
  2. **Scroll por bandas** (30–70% del contenedor): la línea activa en
     zona central ya no dispara `scrollIntoView`; fuera de banda, glide
     suave al centro (decisión del usuario). El glide completo costaba
     ~9 pts por pico (sonda K).
  3. **Glow** intacto (16px, sin transición de sombra): lo medido en
     §9.1 se mantiene.

- **Descartados con datos**: `will-change: transform` en la capa de
  rotación (ventana ocluida en los 3 intentos — firma de oclusión
  0–3,7% — y la mañana del mismo día ya no ayudó); transiciones de
  fila (G ≈ 0); quitar el visual de palabras (M ≈ 0); sin-scroll total
  (K) en favor de la banda central (glide cuando importa).

- **Verificación en vivo del build corregido** (cc27a59, «Soy Peor»,
  seek t=40, others ≈ 30, foco verificado pre/post en las dos series):

  | Serie        | media | mín  | **máx** | picos |
  | ------------ | ----- | ---- | ------- | ----- |
  | Control previo (pre-fix, otros ≈ 32–34) | ~20 | 14–16 | **33–44** (hasta 52) | uno cada 3–5 s |
  | POST-fix-1   | 23,1  | 16,6 | **27**   | ninguno |
  | POST-fix-2   | 23,2  | 17,3 | **28**   | ninguno |

  Amplitud de la onda: **~30 pts antes → ~11 pts después** (el suelo
  sube un poco — la banda central hace que los pocos scrolls que quedan
  sean más largos — pero DESAPARECEN los picos, que era la queja:
  «picos de 24 a 50»). DOM en vivo confirmado: `transition: color 0.5s
  + font-weight 0.4s` sin `text-shadow`, glow `rgba(…,.53) 0 0 16px`,
  rotación `steps(720, jump-none)`, capa 2246 (hypot).

- **Pendiente conocido**: el resto de la base (~+6) es la rotación, y
  el one-shot del bloque completo al cambiar de línea (~+12–19 medido
  con scroll glider) queda amortiguido pero no eliminado — atacarlo
  exige cuantizar la distancia de las líneas lejanas o rediseñar la
  jerarquía de tamaños. En cuanto el usuario confirme que la onda es
  sostenible, cerramos.

## 10. Task Manager: un solo grupo «OpenWave» (paquete sparse de identidad, plan C)

**Problema.** El Administrador de Tareas agrupaba al proceso principal en
«OpenWave» y a los seis procesos hijos de WebView2 en un grupo aparte,
«Administrador de WebView2 (6)» — con sus 135 MB desglosados aparte. Es el
bug conocido [MicrosoftEdge/WebView2Feedback#5628](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5628)
(abierto, sin respuesta) con hilo paralelo en [tauri#15567](https://github.com/tauri-apps/tauri/issues/15567).

**Diagnóstico empírico (2026-10-04).** Sonda `GetPackageFamilyName` por
proceso: los hijos WV2 de hosts **sin paquete** devuelven `none (hr=15700)`
→ grupo fallback «Administrador de WebView2»; SearchHost (empaquetado,
`MicrosoftWindows.Client.CBS_cw5n1h2txyewy`) sí hereda → sus WV2 quedan
agrupados en «Buscar (6)». También se descartó: el AUMID explícito
(`set_appusermodel_id`, commit `c4e255d` — ya presente, no bastó), FileDescription,
etiquetas de Taskmgr y el registro `AppUserModelId`. La etiqueta «Administrador
de WebView2» viene de los recursos localizados del propio runtime WV2.

**Solución: identidad de paquete para nuestro exe** según la receta oficial
de Microsoft *«Grant package identity by packaging with external location
manually»* (sparse package):

- `packaging/appx/AppxManifest.xml` — el paquete (sin payload):
  `Identity Name=OpenWave / Publisher=CN=OpenWave / Version 1.0.0.0 neutral`,
  `<uap10:AllowExternalContent>true</uap10:AllowExternalContent>` — **sin
  este elemento `Add-AppxPackage -ExternalLocation` falla con `0x80073D2E`
  (`ERROR_PACKAGE_EXTERNAL_LOCATION_NOT_ALLOWED`)**, fue el error del primer
  intento — `uap10:RuntimeBehavior=win32App` (¡prohibido `EntryPoint` con
  RuntimeBehavior! error de makeappx) + `unvirtualizedResources`.
  **`AppListEntry` va por DEFECTO** (atributo ausente): `none` dejaba el botón
  de la barra de tareas sin icono (ver el párrafo «Icono del botón» más
  abajo) y además sobraba, porque el acceso directo de menú inicio del MSI se
  eliminó — la entrada única en Start la da el paquete.
- `packaging/appx/app.manifest` — manifiesto RT_MANIFEST del exe con el
  elemento `<msix publisher="CN=OpenWave" packageName="OpenWave"
  applicationId="App">`; lo embebe `src-tauri/build.rs` vía
  `tauri_build::WindowsAttributes::app_manifest()` (reemplaza al manifiesto
  por defecto de Tauri, por eso redeclara comctl32 v6). **Si no coincide con
  el Identity/App del paquete, el registro va bien pero en runtime no hay
  identidad (0x80073D54)** — `scripts/package-appx.ps1` lo valida y aborta.
- `scripts/package-appx.ps1` — construye `build\windows\openwave-identity.msix`
  + `.cer`: version sincronizada con `tauri.conf.json`, assets 50/44/150
  desde `src-tauri/icons/128x128.png`, certificado autofirmado `CN=OpenWave`
  en `Cert:\CurrentUser\My` (autorenovable si caduca < 30 días) con el `.cer`
  en `CurrentUser\TrustedPeople` (sin confianza → `0x800B0109`), y
  `makeappx pack /nv` — **`/nv` obligatoria** (makeappx exige que el .exe
  esté dentro del paquete y aquí vive en `ExternalLocation`) + signtool.
- **MSI**: `tauri.conf.json` (`bundle.resources`) embarca msix+cer+script
  en el INSTALLDIR (**tauri conserva el nombre del fichero de ORIGEN en
  resources: el destino del mapa se ignora para ficheros** — por eso el
  script se llama `packaging/appx/openwave-identity-ca.ps1` y no otro);
  la SAC `RegisterIdentity` (inmediata, tras `InstallFinalize`, `NOT REMOVE`,
  `Return="ignore"`) invoca
  `powershell -NoProfile -ExecutionPolicy Bypass -File
  "[INSTALLDIR]openwave-identity-ca.ps1" -Mode Register`, y
  `UnregisterIdentity` (en la desinstalación, `NOT UPGRADINGPRODUCTCODE`,
  **antes de `RemoveFiles`** porque el script tiene que seguir en disco)
  invoca `-Mode Unregister`. El script importa la confianza y hace
  `Remove-AppxPackage` + `Add-AppxPackage -ExternalLocation $scriptDir`
  **sin barra final** (ver §10: con la barra el botón del taskbar no
  pinta el icono del paquete) con trazas en
  `openwave-identity.log` del INSTALLDIR (si no puede escribir —
  ejecución media sobre Program Files — cae a `%TEMP%`). El Remove-Add hace
  idempotente la reparación y actualiza la ExternalLocation (con la misma
  versión sin remover → `0x80073CF9`). `LaunchApplication` se encadenó
  tras `RegisterIdentity` para que la app arranque ya con identidad.
  **El comando NO va inline en el `ExeCommand`**: la forma `-Command
  try{...}` pegada en la SAC fallaba solo dentro de msiexec (exit 1 sin
  llegar a ejecutar ni `Remove` ni `Add` — cero eventos
  `AppXDeploymentServer` a las 09:05; el mismo string fuera del MSI daba
  `exit 0`), y la primera versión `-File` apuntaba a un nombre que Tauri
  no renombró (`-196608` = fallo de lanzamiento). Con `-File` + logging
  la SAC corre verificada de punta a punta (log completo de la instalación).
- **`AppModelUnlock` NO hace falta**: comprobado empíricamente registrando
  con la clave `HKLM\...\AppModelUnlock` ausente → OK. El MSI no toca HKLM.
  Tampoco se necesita Developer Mode; solo el certificado de confianza
  (por usuario).

**Verificación (2026-10-05, prueba de humo + build con identidad + MSI instalado).**

- `pkg-probe`: `OpenWave.exe` y los 6 hijos WV2 con `pkg=OpenWave_pr6hx30mntjwm`
  (también tras instalar el MSI y tras reparar/re-registrar).
- Task Manager, filtro «openwave»: **un único grupo `OpenWave (7)`** con
  chevron; filtro «webview»: `OpenWave (6)` + `Buscar (6)` (los de Buscar,
  del sistema) → **cero grupos «Administrador de WebView2»**.
- Icono del grupo: el original (cuadrado morado con la onda), tomado del
  `Square44x44Logo` del paquete (zoom de captura verificado).
- `scripts/verify-msi.ps1`: **67 comprobaciones en verde** (payload
  msix/cer/script, SACs y secuencia).
- MSI instalado (`exit=0`): log de la SAC con `add: ok`, `PackageRootFolder
  = C:\Program Files\OpenWave`, y ciclos manuales `-Mode Unregister` /
  `-Mode Register` del script verificados (con su traza en el log).
- **Ciclo completo desinstalar → reinstalar** (ambos `exit=0`, `/qn`):
  `UnregisterIdentity` elimina el paquete con el script aún en disco
  (anclaje `Before=RemoveFiles`) y la reinstalación lo rehace con
  `ExternalLocation = C:\Program Files\OpenWave`; el log de la SAC
  conserva la secuencia completa `Register → Unregister → Register` con
  `remove: ok` / `add: ok`. Los accesos directos per-machine (menú de
  Inicio común en ProgramData y Escritorio público) se van y vuelven, y
  la app relanzada arranca de nuevo con identidad (exe + 6 hijos WV2).
- Barra de tareas (check del AUMID): **un único botón** `OpenWave: 1 ventana
  en ejecución` con `aid=Appid: OpenWave_pr6hx30mntjwm!App` — el AUMID
  explícito `com.soundwave.app` de `set_appusermodel_id()` solo tiene
  efecto sin identidad (aid `Appid: com.soundwave.app`), y con identidad
  manda el del paquete → **no hay separación de botones; se mantiene
  `set_appusermodel_id()`**.

**Límites conocidos.** Registro por usuario (el que instala): en máquinas
multiusuario los demás usuarios ven la app sin identidad (mismo
comportamiento que antes). Certificado autofirmado local: para distribución
externa haría falta certificado real (Azure Trusted Signing o de empresa).
Si el paquete registrado apunta a una carpeta que ya no existe, la app corre
sin identidad: la SAC de instalación siempre rehace Remove-Add.

**Icono del botón en la barra de tareas (resuelto 2026-10-05).** Causa
raíz del placeholder gris: **`AppListEntry="none"` en el manifiesto del
paquete** — sin ítem en `AppsFolder` para el AUMID el shell no tiene
icono que resolver, pese a que `Assets/Square44x44Logo.png` (la onda
morada) va dentro del msix y en `ExternalLocation`. Con `AppListEntry`
**por defecto** (atributo ausente) el ítem existe
(`OpenWave_pr6hx30mntjwm!App`) y el botón pinta la onda morada original
(captura con zoom verificada en vivo; también el grupo en Task Manager y
los accesos directos). El motivo original de `none` — no duplicar la
entrada en Start porque el MSI creaba su propio acceso directo — dejó de
existir: la feature `StartMenuShortcut` se eliminó del MSI (la entrada
única en Inicio la aporta el paquete) y los upgrades borran el `.lnk`
heredado con `CMP_LegacyStartCleanup`.

Descartado empíricamente como causa (todo probado antes de dar con la
raíz): refresco de caché de iconos (`ie4uinit -show`), purga de
`SystemAppData\OpenWave_*`, reinicio de Explorer, `WM_SETICON`
(big+small) con el logo morado —solo afecta al icono de la ventana, no
al del botón cuando hay identidad; se conserva como fallback cuando el
AUMID no tiene ítem (arranque sin identidad)— y la clave
`HKCU\...\AppUserModelId\OpenWave_pr6hx30mntjwm!App` con `IconUri`.
Sin identidad el botón salía morado (AUMID `com.soundwave.app` con
`IconUri` que crea el MSI); con identidad manda el `Square44x44Logo` del
paquete.

**Segunda causa (resuelta 2026-10-06): la barra final en
`-ExternalLocation`.** Con `-ExternalLocation ($scriptDir + '\')` el botón
no pintaba el icono del paquete —render fragmentado: punto/cuadrado
diminuto en el centro— mientras que con `-ExternalLocation $scriptDir`
(sin barra) sí. Lo retorcido: el estado del paquete queda **idéntico** en
ambos casos (`PackageRootFolder = C:\Program Files\OpenWave` sin barra,
`diff` de las claves `AppModel\Repository\...` y `AppModel` vacío) y la
extracción vía `IShellItemImageFactory` devuelve la onda morada en los
dos; solo el taskbar se nota, así que la `\` actúa durante el `Add`
(cache de contenido/ítem, no en el registro). Verificado en vivo con
3/3 parejas el 2026-10-05 (SAC con barra → roto; registro manual sin
barra → morado, RGB esquina `109,86,241` y centro `231,227,252` en el
botón). Fix: `packaging/appx/openwave-identity-ca.ps1` pasa
`-ExternalLocation $scriptDir` (commit `02b1abe`); la SAC del MSI
instalado y su log (`add: ok`, 2026-10-06 08:41) lo confirman.

**Tercera causa (resuelta 2026-10-06): el tile salía con esquinas rectas.**
Con el icono ya morado, el botón seguía siendo un **cuadrado morado perfecto**
(mapa ASCII del botón: borde vertical idéntico desde la primera fila, cero
escalera) — el shell compone el `Square44x44Logo` sobre una **placa opaca**
y con `BackgroundColor="transparent"` la placa sale del **color dominante**
del logo (morado exacto `109,86,240`, el mismo del asset). Diagnóstico:

- **Test verde**: sobrescribir la base en `ExternalLocation\Assets` volvía
  verde el botón → la fuente del taskbar es
  `C:\Program Files\OpenWave\Assets`, **no** la copia del msix en
  WindowsApps; por eso los cambios dentro del paquete no se notaban. Los
  Assets eran residuales de una ronda antigua (no los instalaba nadie): el
  MSI ahora los empaqueta (`bundle.resources` → `INSTALLDIR\Assets`;
  check de verify-msi) — sin eso, una instalación limpia se quedaría sin
  logo.
- **Fix de la placa (parcial)**: `uap:VisualElements BackgroundColor="#0a0a0f"`
  (el mismo fondo de la app) en vez de `transparent` → la placa deja de ser
  morada (color dominante) y pasa a casi negra… pero se sigue viendo: ver la
  cuarta causa más abajo.
- **Receta oficial MSIX** («Add Target-based unplated assets» +
  «Generate a Package Resource Index»): el msix lleva ahora
  `Square44x44Logo.targetsize-44_altform-unplated.png` y `resources.pri`
  generado con `makepri createconfig /dq en-US` + `makepri new /of`
  (el build confirma los qualifiers `UNPLATED`/`44`).

Verificado en vivo: mapa ASCII del botón con escalera en las cuatro
esquinas (las filas de arriba arrancan dos columnas más a la derecha y las
de abajo terminan antes) + captura zoom con tile redondeado. Task Manager
intacto: su icono viene del exe (`icon.ico`), que no se toca. El taskbar
NO depende del `WM_SETICON` (comprobado: la pintura sigue la base de
ExternalLocation, no el icono de la ventana).

**Cuarta causa (resuelta 2026-10-06): las esquinas seguían en negro.** Con
la placa ya en `#0a0a0f` el tile salía redondeado, pero las esquinas del
cuadro se seguían viendo (negro visible sobre la barra). Causa: solo
existía la variante `targetsize-44`, y el taskbar pide un targetsize
**exacto** (24 px al 100 % de escala; 32 px en pins de Inicio, 48 px en
Alt+Tab…). Sin la variante de ese tamaño el shell escala la base y la
compone sobre la placa del `BackgroundColor`, y el `resources.pri` solo
indexaba el 44. La doc MSIX lo advierte literalmente: *«If you do not
include the targetsize-\*-altform-unplated assets above your icon will
scale to a smaller size and will get an undesirable backplate behind the
icon on Taskbar and Start»* (mismo problema que
WindowsAppSDK#5984 y el hilo de TechCommunity «the border will just not
go away»: a todos les faltaba el set completo, no una variante suelta).

Fix: `scripts/package-appx.ps1` genera ahora el set completo — **15 tamaños
(16…256) × 3 formas (default, `altform-unplated` «dark»,
`altform-lightunplated` «light») = 45 variantes** — indexado por el mismo
`makepri` e instalado en `ExternalLocation\Assets` por el MSI
(`bundle.resources`; checks de `verify-msi`: set completo en el msix y en
la payload del MSI). La verificación en vivo de esta ronda **no se sostuvo**:
al día siguiente el usuario siguió viendo las esquinas negras («Sigue con
esquinas negras») — el set de 45 era *necesario pero no suficiente*; faltaba
la quinta causa.

**Quinta causa (resuelta 2026-10-07): el `resources.pri` del paquete
sparse tiene que vivir en la RAÍZ de `ExternalLocation`, no solo dentro del
msix.** Diagnóstico (medición en vivo: botones localizados por UIA, reveal
con movimientos reales del cursor, muestreo dentro de la caja del tile de
24 px centrado en el botón de 44, y controles en el MISMO píxel — Brave sin
empaquetar y Terminal MSIX sano — más color de barra medido en los huecos):

- Con `BackgroundColor="#0a0a0f"` las esquinas de OpenWave eran
  `(10,10,15)` = la placa; con `"transparent"` eran `(116,77,169)` = el
  **accent color exacto del usuario** (DWM `AccentColor=0xFFA94D74`, ABGR).
  O sea: *ningún* valor de `BackgroundColor` evita la placa mientras falle
  la resolución calificada — `transparent` solo la tiñe (comportamiento de
  WindowsAppSDK#5984, cerrado como externo) — y el esquema del manifiesto
  rechaza el alfa: pattern `#[\da-fA-F]{6}` o colores con nombre
  (un `#00000000` falla con `C00CE169`). Brave y Terminal, en cambio,
  devolvían el color real de la barra → Terminal (MSIX completo,
  `BackgroundColor="transparent"`) va **sin placa**.
- `IShellItemImageFactory` de OpenWave devuelve esquinas transparentes
  (`A=0`) con flags 0 y 0x4, idéntico a Calculator/Terminal → la placa la
  compone el taskbar por su cuenta; el asset no es el problema.
- Diff contra el paquete real de Windows Terminal (MSIX v1.25 extraída de
  GitHub): Terminal publica `contrast-black/contrast-white` en todas las
  formas y `scale-100/125/150/200/400`; su `resources.pri` declara los
  qualifiers `AlternateForm, Contrast, Language, Scale, TargetSize` y el
  nuestro solo `AlternateForm, TargetSize`. Se añadió la paridad
  (`package-appx.ps1`: +120 variantes contrast y +15 scale) — **necesario
  pero no suficiente** (medido: seguía la placa de acento).
- Discriminador decisivo: **msix COMPLETO** (mismo manifiesto, mismos
  assets, mismo PRI; exe dentro y sin `-ExternalLocation`) → esquinas =
  color de la barra, iguales a Terminal/Brave → **sin placa**. El registro
  *in-place* (`Add-AppxPackage -Register`) quedó descartado: exige licencia
  de desarrollador (`0x80073CFF`).
- Aislamiento del mecanismo: sparse apuntando `-ExternalLocation` a un
  directorio que además contiene `resources.pri` + `resources.scale-*.pri`
  **en su raíz** → sin placa (esquinas = barra `(43,43,43)` idénticas a los
  controles); quitando el `AppxManifest.xml` del test seguía sin placa → la
  variable activa es el **PRI externo**.

Causa raíz: en un paquete sparse (AllowExternalContent + ExternalLocation)
MRT carga el índice de recursos desde la **raíz del contenido externo**; si
el `resources.pri` solo va dentro del msix el índice queda vacío, no hay
candidatos `targetsize/altform/contrast/scale` y el taskbar cae al
fallback: base del manifiesto escalada + placa del `BackgroundColor`.

Fix del pipeline: `src-tauri/tauri.conf.json` (`bundle.resources`) instala
ahora `resources.pri` y `resources.scale-{125,150,200,400}.pri` en la raíz
de INSTALLDIR —que es `ExternalLocation`— junto a `Assets\`. El set de
variantes pasa a **7 formas × 15 tamaños = 105 por familia** (las 3 de
tema + 4 contrast) más 15 `scale-*` y la familia `AppList` completa (105;
el taskbar/Start piden AppList primero). `BackgroundColor="transparent"`
se conserva (paridad con Terminal: la placa solo se dibuja si la
resolución falla, y con el PRI externo no falla). Checks nuevos en
`verify-msi.ps1`: PRI + satellites en la raíz, PRI idéntico al de staging
(sin desfase de build), qualifiers `AlternateForm/Contrast/Scale/TargetSize`,
sets de 105 en msix y en el MSI, y `BackgroundColor` del msix. Los scripts
de medición viven en `Desktop\swcheck\` (el limpiador de `%TEMP%` borra
ficheros de ahí en minutos: no guardarlos en Temp).

**Verificación en vivo con el MSI oficial (2026-10-07).** Pipeline completo
(`package-windows` → `verify-msi` **74/74** → instalación → medición):

- Instalación: `resources.pri` + 4 satellites en la raíz de
  `C:\Program Files\OpenWave\`, 228 assets, y el paquete registrado con
  `PackageRootFolder = C:\Program Files\OpenWave`. Gotcha: un `msiexec /qn`
  lanzado **sin elevar** muere con error 1730 en `RemoveExistingProducts`
  (la instalación silenciosa no puede mostrar UAC: «Elevation prompt
  disabled for silent installs»); hay que elevar (`Start-Process -Verb
  RunAs`). Las reinstalaciones menores (`/i` repetido) devuelven 0.
- **Oscuro**: esquinas del tile = `(34,36,36)` = fondo del botón, igual que
  Terminal y Brave → sin placa. **Claro**: esquinas = `(177,189,234)` =
  fondo del botón → sin placa. Tema devuelto a oscuro (Apps=0/System=0).
- Task Manager: grupo único «OpenWave (7)» con el icono de la onda morada
  (captura verificada); entrada única en Start (`Get-StartApps` = 1).
- Activación: `IApplicationActivationManager.ActivateApplication` (la API
  que usa el clic de Inicio) devuelve `S_OK` y crea el proceso. La ruta
  `explorer.exe shell:AppsFolder\…` usada por los scripts de test falló 2
  veces justo tras el re-registro del MSI y funcionó después — matiz de
  caché del shell, no del paquete: los caminos reales de usuario (clic en
  Inicio vía API de activación y lanzamiento directo del exe, que es lo
  que usa la SAC `LaunchApplication`) quedaron verificados ✓.
- Auto-lanzado: `msiexec /qn` **no** lanza la app al terminar
  (`LaunchApplication` exige `AUTOLAUNCHAPP`, que solo pone el diálogo de
  salida de la instalación con UI; en silencioso hay que pasar
  `AUTOLAUNCHAPP=1`). La instalación normal (con UI) sí lanza al final.
  Ojo: si la app está corriendo durante la instalación, la SAC la mata al
  re-registrar el paquete y el lanzamiento puede perder la carrera — dejar
  que el usuario relance o pasar `AUTOLAUNCHAPP=1`.

## Regla de oro

Todo estilo con impacto potencial en GPU/CPU (backdrop-filter nuevo,
`will-change`, blur en vivo, promoción de capas, re-renders frecuentes,
`transition: "all"`) exige una corrida de `scripts/measure-perf.ps1` (60 s, con
`sistema` ≈ 6-8) antes de merge. Sin medición detrás, no entra.
