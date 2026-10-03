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

## 9. Letras: «Girar el fondo» costaba +14–37 pts de GPU → `steps(360)` + pre-difuminado

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

- **El filtro CSS de la capa era el otro motor del coste y estaba roto en
  producción**: `bgBlurUrl` (pre-difuminado en canvas) nunca se activaba
  porque el CSP `img-src` no permitía `http://127.0.0.1:8765` (sí lo
  hacían `connect-src` y `media-src`). La `Image` con `crossOrigin` del
  proxy de miniaturas era bloqueada (confirmado con el evento
  `securitypolicyviolation` → `img-src`), el fallback directo contaminaba
  el canvas y la capa rotaba SIEMPRE con
  `filter: blur(12px) saturate(1.2) brightness(0.7)` → **cada paso
  re-rasterizaba 8,3 MP con Gaussian**. Fix: añadir el origen del backend
  a `img-src` en `src-tauri/tauri.conf.json` (+ guard en
  `imageBlur.test.js`); con el pre-difuminado activo la capa pinta sin
  `filter`.

- **El absoluto depende de la carga total del sistema**: con la rotación
  PAUSADA (suelo puro: karaoke + progreso) el mismo build marcó 18,4%
  con el sistema al ~29% y 43,8% con el sistema al ~85% — la GPU
  integrada está compartida, así que cualquier % suelto del Administrador
  de Tareas hay que leerlo con la carga de fondo. Lo fiable sigue siendo
  el delta pareado en la misma tanda.

- **Fix**: rama `settings.lyricsRotateBg` de
  `src/components/LyricsView.jsx` → `steps(360, jump-none)` (+ test
  «rendimiento del fondo» en `LyricsView.test.jsx`); CSP `img-src` en
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

## Regla de oro

Todo estilo con impacto potencial en GPU/CPU (backdrop-filter nuevo,
`will-change`, blur en vivo, promoción de capas, re-renders frecuentes,
`transition: "all"`) exige una corrida de `scripts/measure-perf.ps1` (60 s, con
`sistema` ≈ 6-8) antes de merge. Sin medición detrás, no entra.
