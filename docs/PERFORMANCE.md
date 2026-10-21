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
  - **cristal de modal**: `GLASS.sheet` (las hojas de opciones, incluida la
    de configuración de letras y los tres modales que abren sus opciones)
    difumina con `blur(40px)` sobre su degradado, con el detrás congelado por
    `overlay-open` (§7). **Excepción — sin desenfoque**: el panel de Ajustes
    (`GLASS.settings`) va sin backdrop-filter — la lectura la da su base
    opaca (decisión de producto para esa pantalla);
  - **transitorias no modales**: `GLASS.popup` (toast/volumen/crossfade) se
    queda en `blur(6px)` — pueden flotar sobre contenido que se mueve.
  - **cristal local con vídeo de fondo** (`LyricsView`): mientras el fondo es
    el videoclip, la barra lateral (portada + cola) difumina con `blur(12px)`
    y los botones de arriba (⋮ y cerrar) con `blur(6px)` — detrás hay vídeo en
    movimiento real, y ese blur del panel es el pase caro de la pantalla de
    letras porque se re-ejecuta en cada frame (a 12px, con el velo encima y un
    poco más de tinte, se lee igual que a 20px). Con la portada de fondo
    (estática) esos mismos nodos van **sin** blur: el caso de siempre no
    cambia.
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

## 2. Nada de peticiones de fotograma permanentes (regla del navegador)

Chromium **no dibuja si no hay _damage_**: el _damage_ es «la parte de la
pantalla que ha cambiado» y el compositor **aborta el fotograma cuando está
vacío** (`--check-damage-early`: «checks damage early and aborts the frame if no
damage, so that clients like Android WebView don't invalidate unnecessarily»).
Una página quieta no produce frames; lo único que mantiene despierta a la GPU es
que haya trabajo de verdad (scroll, vídeo, una animación viva). Un
`requestAnimationFrame` **encadenado**, en cambio, es una *petición de fotograma
permanente*: obliga a producir 60 fotogramas/s aunque el callback no cambie
nada — precisamente lo que `requestVideoFrameCallback` vino a resolver para el
trabajo por fotograma de vídeo («the callback will run at the lower of the video
frame rate and the browser paint refresh rate»).

Regla de la app: **ningún bucle encadenado; se despierta cuando hay algo que
cambiar y el reloj es el propio medio** (`<audio>`/`<video>`). Un
`setTimeout`/intervalo que despierta y decide no cambiar nada **no pide
fotograma**: lo que cuesta es pedirlo, no pensar.

### 2.1 Karaoke: despierta justo al cruzar de palabra

- Historia: `setInterval(400ms)` sobre `progressRef` (que solo se actualiza con
  `timeupdate`, ~250 ms) llegaba hasta ~0.65 s tarde («el karaoke va lento»); un
  rAF a 60 Hz lo arregló, pero a cambio de **60 peticiones de fotograma por
  segundo** mientras la pantalla de Letras estaba abierta.
- Ahora el reloj es el propio `<audio>`: sus eventos (`timeupdate` ~4 Hz y SOLO
  con el medio en marcha, más `seeked`, `play`, `pause`, `ended`…) re-sincronizan
  y, entre medias, un `setTimeout` despierta en el instante exacto del próximo
  cambio (palabra o línea). `setState` **solo** al cruzar de línea o de palabra:
  el resto de despertares es matemática pura, sin render de React y sin pedir
  fotograma. Entre despertar y despertar: **cero fotogramas**.
- Cada despertar **relee** el reloj del audio, así que un parón de datos
  (`waiting`) no adelanta el resaltado: recalcula y vuelve a programar.
- Con el medio en pausa no queda ni un temporizador: `play`/`seeked` lo
  reanudan. Con un overlay a pantalla completa (`overlay-open`) o la ventana
  oculta (`visible`) el efecto se desmonta entero. Sin `<audio>` (tests) hay un
  sondeo de respaldo; la app real siempre tiene el elemento.
- **Nunca** re-renderizar React a 60 Hz (ese sí sería el pico de CPU que
  evitamos). Las transiciones CSS (.5 s) aportan la continuidad visual.
- Las transiciones que **afectan al layout** (`font-size`, `font-weight`) son
  **cortas** (.3 s y .15 s): interpolar el tamaño o el peso re-forma los glifos y
  rehace el diseño + repintado del área en **cada fotograma**, así que la
  duración es directamente trabajo (§9.3 y §9.4). En el peso influye además la
  **frecuencia**: hay palabra nueva cada 200-400 ms, de modo que a .4 s la línea
  estaba re-diseñándose en casi todos los fotogramas. `opacity` y `transform` sí
  se interpolan largos (.6/.65 s): se resuelven en el compositor y son la
  suavidad visible.
- **Nada de `steps()` para ahorrar esos fotogramas**: reparte el trabajo en
  saltos discretos y el movimiento se ve a tirones («como a 2 fps»). Probado en
  el karaoke y descartado (§9.3).
- _(Implementado en `LyricsView.jsx`; regresión en `LyricsView.test.jsx`.)_

### 2.2 Vídeo de fondo: el `<video>` se presenta solo

- El clip de Letras es un elemento del navegador: lo decodifica y lo compone él,
  React no toca ni un fotograma. Lo único que hace la app es **comparar dos
  relojes** (audio y vídeo) y decidir `play`/`pause`/`seekTo`
  (`planVideoSync`), y eso solo hace falta cuando uno de los dos cambia de estado
  o avanza.
- Antes era otro rAF encadenado a 60 Hz: seguía pidiendo fotograma con el clip
  terminado o con la ventana oculta (casos en los que el plan es «pausa»).
  Ahora se aplica con los eventos del `<audio>` (`timeupdate` ~4 Hz con la
  canción en marcha, `seeked`, `play`, `pause`, `waiting`…) y los del propio
  `<video>` (`autoPlay` lo arranca solo: hay que poder pararlo en cuanto
  arranca); la tolerancia del plan absorbe el resto.
- Pausar el clip (ventana oculta o modal encima) deja de decodificar: el ahorro
  es real y el plan lo reanuda y re-sincroniza al volver.
- La descarga prioriza **calidad** sobre rapidez: cada intento baja a un
  temporal, se mide y se publica el mejor (§9.5). La escalera se detiene en
  cuanto un intento llega al tope de la pantalla —o a su mitad—, así que el
  caso normal sigue costando **una** descarga; solo se prueban los demás
  clientes cuando la sesión devolvió una lista recortada (p. ej. 360p).

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
  CSS `!important`, reloj de letras y progreso de la barra frenados por
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
  not(.perf-solid) [style*="blur(40px)"]` mantiene el `backdrop-filter` de
  las hojas (`GLASS.sheet`) mientras dure `app-hidden` (bug «los modales no
  tienen blur», 2026-09-29). Hoy `app-hidden` solo se
  activa con la ventana invisible, pero la exención se conserva por si el
  motor reporta oculto con la ventana a la vista: solo se salva el
  `blur(40px)` inline (el panel de Ajustes ya no lo lleva); shell/player/popup
  siguen apagándose y los modos explícitos de Rendimiento ganan gracias al
  `:not()`.
- La música sigue sonando y al restaurar el primer frame recalcula el estado
  exacto. No se necesitan hooks en Rust: basta el IPC ya existente
  `getCurrentWindow().isMinimized()` (y `document.visibilityState` sí reporta
  `hidden` cuando la ventana se oculta de verdad, p. ej. en un navegador).
- **Consumo ~0 con la ventana minimizada**: con la ventana oculta el único
  latido que queda es el de conexión al backend, reducido a 60 s (10 s si está
  caído) y con chequeo inmediato al volver a ser visible
  (`src/utils/backendHealth.js`); el resto de bucles (reloj de letras, progreso
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

## 5. Aceleración por hardware (estado: ACTIVA + flags GPU forzados)

- **WebView2 usa la GPU por defecto** (doc. oficial Microsoft: _"By default,
  WebView2 uses the GPU for rendering"_). Nuestra config **no** la desactiva
  (no existe `--disable-gpu` en el repo).
- Evidencia empírica propia: las mediciones con `scripts/measure-perf.ps1`
  reportan motores GPU reales (`video codec 0` = decodificación por hardware).
- **Flags GPU forzados** (`tauri.conf.json` → `additionalBrowserArgs`):
  `--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy`,
  más
  los defaults de wry (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection
  --autoplay-policy=no-user-gesture-required`) que hay que **reincluir siempre**:
  wry sustituye los suyos por completo cuando se fijan argumentos propios
  (ver `create_environment` de wry). Se piden a petición explícita para
  «desbloquear» la GPU dedicada: el blocklist existe por drivers buggeados,
  pero si el driver falla Chromium cae solo a render por software y
  `softwareRenderer.js` lo detecta igual (modo Auto → bajo consumo).
- **La dedicada se probó y se retiró: `--force-high-performance-gpu`**
  (switch de Chromium, `gpu/config/gpu_switches.cc`). El render de la web
  ocurre en un proceso hijo (`msedgewebview2.exe` con `--type=gpu-process`
  que hereda la línea de comandos), así que la preferencia de Windows por
  exe sobre `OpenWave.exe` no le llega (WebView2#5072) y el switch era la
  única vía para que el proceso de GPU usara la RTX. Se instaló y se midió
  en A/B en este portátil (Radeon 740M de panel + RTX 4050, 1920×1080 a
  144 Hz; letras con vídeo activo, misma ventana y clip, muestreo por
  motores de `Get-Counter '\GPU Engine(*)'`):

  | Configuración                      | GPU total | Reparto                        |
  | ---------------------------------- | --------- | ------------------------------ |
  | Con `--force-high-performance-gpu` | ≈ 50%     | copy 27 · 3d 10 · decode 8     |
  | Sin el switch, ventana normal      | ≈ 20%     | 3d 15 · decode 5 · copy 0      |
  | Sin el switch, ventana maximizada  | ≈ 40%     | 3d 33 · decode 5 · copy 0      |

  La ventana vive en la iGPU que saca la señal: renderizar en la dedicada
  añadía un **copiado cruzado constante** (motor Copy ≈27% — un frame
  completo por presentación sobre un panel de 144 Hz) que anulaba cualquier
  ahorro. En reposo, home con música sonando: ≈36% con el switch vs ≈7% sin
  él. En equipos de gráfica única el switch no aportaba nada (sin
  adaptador cruzado no hay copiado).
- **La fila de la iGPU en el Administrador de tareas suma más que la app.**
  Con la maximizada y vídeo activo, una instantánea del adaptador dio:
  webview de OpenWave ≈ 48, DWM ≈ 10 y una terminal de Windows con GPU
  acelerada ≈ 17 (total sistema ≈ 77). O sea: lo que ve el usuario en la
  fila de la integrada no es solo OpenWave; el vídeo a pantalla completa
  sobre la iGPU que saca la señal cuesta ≈ 40 puntos de app, y el resto es
  composición de Windows y otras apps.
- **GPU dedicada por usuario** (MSI, `main.wxs`): el instalador escribe
  `HKCU\Software\Microsoft\DirectX\UserGpuPreferences\<exe> = GpuPreference=2;`,
  la misma preferencia «Alto rendimiento» que Configuración → Gráficas de
  Windows. Cubre el proceso anfitrión (OpenWave.exe); el render de la web es
  lo que resuelve el switch anterior (en equipos de gráfica única no hace
  nada ninguno de los dos).
- La sección de diagnóstico de GPU se retiró de Ajustes → Rendimiento: el
  usuario pidió quitar el mensaje de «aceleración por hardware activa».
- Reparto de trabajo: composición/raster/decode en GPU (WebView2 por defecto +
  flags), títulos con vibrancy nativo (mica/tabbed, gratis), blur de fondos
  pre-render en canvas (1× por canción). Además el `<video>` de fondo de la
  pantalla de letras **se pausa** cuando la ventana está oculta o un modal la
  tapa (deja de decodificar mientras nadie lo ve; ver `LyricsView.jsx`).

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
   de modal:** `GLASS.sheet` (las hojas de opciones, incluida la de
   configuración de letras y los modales de sus opciones) difumina con
   `blur(40px)` — el desenfoque visible que el diseño pide (`DESIGN.md`: mín.
   20px) — y **sin `saturate`**; `GLASS.popup` (toast/volumen/crossfade: no
   modal, transitorio) se queda en `blur(6px)`; scrim, filas, resultados y
   cualquier capa interna, **0 filtros** (el opt-out explícito
   `backdropFilter: "none"`, de coste cero, se permite). **Pantalla sin
   desenfoque** (decisión de producto): el panel de Ajustes
   (`GLASS.settings`) va **sin** backdrop-filter — la legibilidad la
   sostiene su base opaca y, mientras está montado, `overlay-open` congela
   el detrás. ¿Por qué el radio ya no
   es el coste? Porque la regla 4 congeló el detrás: un `backdrop-filter`
   sobre un fondo estático lo cachea el compositor ≈0 en reposo y el radio
   solo se paga en la animación de apertura (recortada en el A/B). Si un A/B
   con openwave-perf vuelve a condenar una superficie, se baja ESA superficie
   y el resto sigue. `expectOverlayGlassBudget` impone: superficie con
   degradado y `blur(40px)` (modal) o `blur(6px)` (transitorio) exacto —
   cualquier otro valor distinto de `none` dentro de un overlay es regresión.
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
al cerrarlo), `theme.test.js` (`sheet` a `blur(40px)`, `settings` sin blur,
`popup` a
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
  sostenible, cerramos. → **Atacado en §9.3** (lente cuantizado +
  transición de tamaño más corta).

### 9.3 Ronda 4 (2026-10-17): karaoke + vídeo de fondo → picos de ~60%

**Reporte del usuario** (medido por él en su equipo): pantalla de Letras con
vídeo de fondo **y karaoke sincronizado** → picos de GPU de ~60 %; la misma
pantalla con la letra **sin sincronizar** (sin línea activa ni animación) → ~20 %
estable. El pico lo produce, por tanto, la **animación de la letra**.

**Diagnóstico (mecanismo del navegador).** `font-size` es una propiedad que
**afecta al layout** (MDN: `font-size`/`font-weight` ⇒ style recalc + **layout** +
repaint; `color` ⇒ solo repaint; `transform`/`opacity` en capa propia ⇒ solo
composición). Interpolarlo obliga a **rehacer el diseño y repintar en cada
fotograma** de la transición, y al cambiar de línea **se reposicionan las
vecinas**, así que el repintado es de toda el área visible de la letra: es el
«one-shot del bloque completo al cambiar de línea» que quedaba **pendiente en
§9.2**. Con el vídeo detrás se nota más porque cada repintado se compone encima
de un fondo que se mueve por su cuenta (el `<video>`).

**Implementado (`LyricsView.jsx`):**

| Antes | Ahora | Por qué |
| ----- | ----- | ------- |
| `font-size .65s` | `font-size .3s` | la mitad de fotogramas de layout/repintado por cambio de línea (~18 en vez de ~40) y el movimiento sigue siendo continuo, sin saltos |
| `sizeFactor = 1 − 0.04·d²` (d = 0…3+) | tres escalones: activa 1.3 · vecina 0.96 · resto 0.78 | cada cambio de línea toca el tamaño de ~4 líneas en vez de ~7. El único valor que cambia de verdad es d=2: 0.84 → 0.78 (~3 px a 44 px base) |

- `opacity` (.6 s) y `transform` (.65 s) siguen largos: son **de composición**,
  no repintan, y sostienen la suavidad (el tamaño llega más corto y la
  opacidad/escala lo funden). El fundido de color por palabra (`color .5s`,
  sonda J ≈ 0 pts) y su peso (`font-weight .4s`) quedan **igual**: esa suavidad
  palabra a palabra es intocable.

- **Probado y DESCARTADO: `steps()`** (`font-size .65s steps(8)` +
  `font-weight .4s steps(4)`). Repartía el mismo trabajo en saltos discretos
  para no repintar en los fotogramas intermedios, pero el resultado **se veía a
  tirones** —el crecimiento de la línea activa daba la impresión de ir «como a
  2 fps»— y en la medición del usuario el consumo no bajó, subió. Regla que
  queda: para las propiedades que afectan al layout, **acortar** la transición,
  nunca cuantizarla.

- **Higiene de la medición (esto invalidaba las cifras).** `install-msi.ps1
  -Launch` instalaba con `/qb` y, con interfaz, el MSI **autolanza** la app al
  registrar la identidad (acción AUTOLAUNCHAPP): la instancia del instalador y
  la del `-Launch` convivían, con **dos vídeos y dos hojas de cristal sobre la
  misma iGPU** → la GPU al doble y la ventana de delante a tirones. Ahora la
  instalación por script usa `/qn` y, si ya hay una instancia arrancada, no abre
  otra. **Antes de medir: comprobar que solo hay un `OpenWave.exe`.**

- **Descartado con razonamiento (no romper la estética)**: quitar del todo la
  transición de `font-size` y dejar el crecimiento en manos de `transform:
  scale()` —estilo FLIP— sería lo más barato (crecimiento compuesto, un solo
  reflow por cambio de línea), pero el tamaño daría un salto instantáneo de
  ~15 px de glifo en cada cambio de línea (hoy lo funde la transición) y, como
  los versos **envuelven** en varias filas y su altura depende del tamaño, no se
  puede reservar la altura sin medir cada línea en JS.

- **Verificación**: la medición que fija el presupuesto es la del usuario. Este
  parche reduce el **trabajo por fotograma** (menos fotogramas de layout y menos
  líneas afectadas) sin cambiar la estética salvo los ~3 px de la segunda
  vecina; la serie de GPU queda pendiente de su repaso.

### 9.4 Ronda 5 (2026-10-19): auditoría del consumo con vídeo de fondo

**Petición.** «Revisa qué está consumiendo tanto, sin tomar testeos por tu
cuenta, solo audítalo» y después «aplica lo que no cambie la estética». Esta
ronda es, por tanto, **auditoría de código** (sin medir) más los cambios que no
se ven.

**Dónde está el coste** (por orden, y por qué no todo se puede quitar sin que
cambie el aspecto):

| Foco | Qué cuesta | ¿Se puede quitar sin que se vea? |
| ---- | ---------- | -------------------------------- |
| Cristal del panel (12 px sobre el vídeo) | el `backdrop-filter` se **re-ejecuta en cada fotograma** porque su fondo (clip + velo) se mueve: es el pase más caro de la interfaz | **no**: la única palanca real es que el fondo sea estático (el cristal dejaría de mostrar el clip) |
| Velo de la pantalla (`lyrics-dim`) | dos gradientes a pantalla completa re-mezclados sobre el vídeo cada fotograma (~4 Mpx) | **no**: es el aspecto (velo + tinte de acento); quitarlo o fundirlo cambia la lectura |
| Vídeo 1080p60 | decodificación + presentación del clip | probado y **retirado**: filtrar por el alto exacto a ≤30 fps no vale (§9.5) |
| Énfasis por palabra (`font-weight`) | interpolar el peso re-diseña y repinta la línea activa en cada fotograma | **sí** → acortar la transición (ver abajo) |
| Zoom de línea (`font-size .3 s`) | cada cambio de línea re-forma y repinta ~4 líneas durante ~18 fotogramas | no sin saltos (§9.3: `scale()` daría un salto de ~15 px) |
| Cristal de los botones ⋮/✕ (6 px) | dos capas de blur sobre el clip re-ejecutadas por fotograma | sí, pero el área es de ~4 kpx (≈1 %): no compensa el cambio de aspecto |
| Trabajo vivo detrás de Letras (pulso de Inicio, progreso a 5 Hz del PlayerBar) | siguen activos porque la vista de Letras **no** marca `overlay-open` | es invisible, pero es contenido **oculto** tras una superficie opaca: el compositor lo culla y no compensa tocar el mecanismo del reloj |

- **Probado y RETIRADO — clip a ≤30 fps (`backend/video_fondo.py`).** La
  alternativa `bv*[height=alto][fps<=30]…` iba delante de la cadena de siempre,
  pero YouTube anota la altura **real** del fotograma: un «1080p» panorámico
  mide 1920x720, así que `height=1080` no encontraba nada y la descarga caía al
  360p del intento siguiente (§9.5). Se retira.
- **Aplicado — peso de palabra `.4 s → .15 s` (`LyricsView.jsx`).** El peso sí
  toca layout y hay palabra nueva cada 200-400 ms, así que a .4 s la línea se
  re-diseñaba en casi todos los fotogramas; a .15 s son ~9 fotogramas por palabra
  (~2,7× menos trabajo) y el cambio sigue siendo **continuo** (nada de `steps()`,
  que fue justo el error de §9.3). En reposo el peso final es el de siempre.
- **Descartado por el criterio de la app (no tocar la estética).**
  `-webkit-text-stroke` en vez de `font-weight` quitaría el re-layout, pero el
  énfasis se leería como un contorno y no como un engrosado real; arrancar el
  cristal del panel con una portada pre-difuminada mataría el pase caro, pero el
  cristal dejaría de mostrar el vídeo; bajar el radio del cristal de 12 a 8 px
  no aporta (el coste lo dominan el **área** del panel y las **pasadas** del
  desenfoque, no el radio) y sí se vería.
- **Verificación.** `vitest` (transiciones del karaoke) y
  `pytest test_video_fondo.py` (escaleras a 1080 y a 4K). La cifra que fija el
  presupuesto la mide el usuario.

### 9.5 Ronda 6 (2026-10-19): descargas sin congelarse en 360p y clip centrado

**Petición.** «Las descargas nuevas no se descargan a 1080p, se ven a muy baja
resolución… y cuando no encuentra un vídeo a las resoluciones normales marca que
no tiene vídeo aunque sí lo tenga. No importa la resolución del vídeo, solo
ponlo en el centro; deja los bordes negros que genera el vídeo, está bien, pero
si tiene 1080p, que lo ponga.»

**Diagnóstico (caché y logs reales de la app).** Los clips nuevos salieron a
640x240 y 640x280 (clase 360p) **sin ningún** «intento fallido» en el log: el
primer intento (cliente «embed») se quedó con lo primero que encontró. El mismo
día, con la misma build, otro videoclip bajó a 1920x1080 y el filtro del tope
(reproducido con el mismo yt-dlp) elige 1920x720 para uno de los degradados: la
sesión de YouTube sirve unas veces la lista completa y otras una recortada.

| Causa | Arreglo |
| ----- | ------- |
| `_escaleras` filtraba por `height=1080` **exacto** para preferir 30 fps | retirado: el alto real de un 1080p letterbox es 720, así que el filtro no encontraba nada y la cadena caía al 360p del intento siguiente |
| La escalera se quedaba con el **primer** intento que produjera un fichero, aunque fuera 360p | cada intento baja a un temporal, se mide y se publica el **mejor**; solo se sigue probando mientras el resultado está claramente degradado (por debajo de la mitad del tope) |
| El reintento por tope borraba el clip **antes** de descargar: si la descarga fallaba, la canción se quedaba sin vídeo | el clip en disco solo se reemplaza cuando la descarga nueva lo **mejora**; si falla, se conserva y la pantalla sigue con él |
| El clip se pintaba con `object-fit: cover` (recortaba los bordes) | `object-fit: contain` + fondo negro: se ve entero y centrado, con franjas negras si el aspecto no cuadra con la ventana (pedido explícito) |

> **Revisado después (misma fecha):** el usuario pidió lo contrario —que el
> clip **llene** el área de letras— y el encuadre volvió a `cover` con caja
> explícita (§9.6). El `contain` dejó franjas y ya no es el estado de la app.

- **Verificación.** `pytest test_video_fondo.py` (conserva el clip si falla la
  redescarga; publica el mejor intento) y `vitest` (`objectFit: contain`).
- **Nota.** Con la sesión degradada el clip puede quedarse en 360p: la escalera
  prueba los demás clientes y el reintento de las 2 h vuelve a intentarlo. La
  vía fiable para pasar de 1080p sigue siendo `cookies.txt`.

### 9.6 Ronda 7 (2026-10-19): con el vídeo APAGADO la GPU sube más que con el vídeo

**Reporte del usuario** (medido por él): en Letras, **sin** vídeo de fondo la
iGPU sube por encima del **60%**; **con** el videoclip de la canción se queda en
**≤36%**. La pregunta era si hay algún `filter`/blur superpuesto o un bucle
infinito.

**No hay bucle.** Los únicos `requestAnimationFrame` se retiraron en este mismo
ciclo (el reloj es el `<audio>`); la rotación (`sw-bg-spin`) está **apagada** en
su configuración (`lyricsRotateBg: false`, leído de su `localStorage`) y el
pre-difuminado corre **una vez por canción** (`useEffect` con deps
`[open, bgThumb]`, sin realimentación).

**Causa real (inspección del DOM de la app instalada, sin medir GPU).** Con el
vídeo apagado, la capa de fondo tenía

```
filter: blur(12px) saturate(1.2) brightness(0.7)     ← filtro EN VIVO
background-image: url("https://yt3.googleusercontent.com/…")  ← imagen remota
```

es decir, **el respaldo**, no la textura pre-difuminada. La cadena del
pre-difuminado fallaba en silencio: pedía la imagen con una
`<img crossOrigin="anonymous">` al `/thumbnail-proxy`; si esa carga falla una
vez (el proxy devolvió un 5xx en esa sesión), el respaldo carga la URL directa
del CDN **sin CORS** → el canvas queda **contaminado** → `convertToBlob`/
`toDataURL` lanzan → `bgBlurUrl` vacío → la capa se queda **para siempre** con el
filtro CSS, que se re-ejecuta en cada repintado de la palabra del karaoke sobre
toda la pantalla (0,76 Mpx a 1100×688; 2,07 Mpx maximizada). Eso explica el
70% con el vídeo apagado: el `<video>` no lleva filtro, el fondo sí.

**Implementado (invisible):**

- **Pre-difuminado desde un blob de `fetch`** (`preblurUrlToDataUrl` en
  `utils/imageBlur.js`): el blob es del mismo origen, así que el canvas **nunca**
  queda contaminado; se intenta primero el proxy y después la URL directa. Al
  llegar la textura, la capa pierde el `filter` (queda solo la imagen difuminada
  del canvas, que es el flujo diseñado en §9).
- **Capa propia para el fondo y para el velo** (`will-change: transform`).
  Nunca `will-change: filter`: aquel re-ejecutaría el desenfoque en cada
  repintado. Es la diferencia con el `will-change` descartado en §9.2, que se
  probó sobre la capa **en rotación** y con la ventana ocluida (firma de
  oclusión 0–3,7%), no sobre capas estáticas.
- **Sin el 110% ni el `scale(1.1)` cuando «Girar el fondo» está apagado.** Ese
  margen solo existe para que no asome el borde de la capa al rotarla; sin giro,
  `inset: 0` deja el mismo recorte `cover` (la textura va difuminada) y quita
  **21% de píxeles** a la superficie más grande de la vista.

**Verificación.** `vitest` (`preblurUrlToDataUrl`: descarga fallida, respuesta
que no es imagen, bitmap cerrado; capa y velo con `will-change: transform`; cero
`filter` en el fondo) y comprobación en la app instalada: la capa debe quedar con
`filter: none` y `background-image: url("data:image/webp;…")`. La cifra la vuelve
a medir el usuario. Nota: las dos promociones de capa de esta ronda se retiran en
§9.7 (sin filtro que evitar, solo sumaban mezclas de pantalla completa).

### 9.7 Ronda 8 (2026-10-19): con el filtro ya fuera, el coste es el número de capas

**Reporte del usuario** (medido por él): el arreglo de §9.6 funciona (la capa de
fondo ya no lleva `filter`), pero siguen apareciendo **picos de más del 50%**.

**Qué queda (inspección del DOM, sin medir GPU).** El suelo de la pantalla es el
texto: la propia descomposición de §9.2/§9.3 lo dejó medido en **~25 pts** (ocultar
las letras bajaba a 9,4%), y de ahí ya no se baja sin tocar el aspecto. Pero el
paquete de §9.6 añadió dos capas promocionadas (`will-change: transform` en el
fondo y en el velo) **sin medición detrás**, y esas dos capas cuestan ancho de
banda en cada fotograma: a 1920×1047 cada capa de pantalla completa son ~8 MB
que el compositor vuelve a leer y mezclar aunque nada haya cambiado. Con el
texto del karaoke repintando encima, tres capas de fondo (raíz + fondo + velo)
son ~24 MB/fotograma; el vídeo, en cambio, va por su plano de hardware y no
suma mezcla — que es justo la asimetría que reportó el usuario.

**Implementado (invisible, sin cambio de aspecto):**

- **Fondo y velo SIN capa propia.** La promoción tenía sentido mientras el
  fondo llevaba el `filter` en vivo (había que impedir que se re-ejecutara);
  al desaparecer el filtro solo añade capas. Dentro de la capa raíz el fondo se
  redibuja únicamente en las teselas sucias del karaoke (~0,5 Mpx), que es
  mucho menos que mezclar dos texturas de 2 Mpx por fotograma.
- **Karaoke: un solo escalón de peso.** DM Sans se declara `400 700` en
  `index.html`, así que `font-weight: 900` de la palabra activa se recortaba a
  700 (glifos idénticos) pero su interpolación 700↔900 seguía marcando la línea
  como sucia ~9 fotogramas cada vez que se apagaba la palabra anterior: medio
  trabajo por palabra, cero cambio visible.
- **Scroller de letras como capa de scroll** (`will-change: scroll-position`).
  El glide de `scrollIntoView` al salir de la banda 30–70% costaba ~9 pts por
  pico (§9.3) porque cada fotograma del desplazamiento re-rasterizaba el texto
  en movimiento; con la capa el compositor desplaza lo ya rasterizado.

**Verificación.** `vitest` (fondo sin `filter` ni `will-change`; ningún span de
karaoke pide 900; el scroller pide `scroll-position`) y a ojo en la app
instalada. El velo sigue siendo un elemento aparte en vez de fundirse con el
fondo: sin capas propias los dos se rasterizan en la misma capa, así que
fusionarlos ya no ahorra mezclas; queda como opción si la medición no baja.
Si los picos siguen altos, las palancas restantes **sí** cambian aspecto: glow
solo en la palabra activa, transición de peso del karaoke a 0 (queda el fade de
color) y lente de línea de .3 s a .2 s.


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
- **MSI**: `tauri.conf.json` (`bundle.resources`) embarca msix+cer+scripts
  en el INSTALLDIR (**tauri conserva el nombre del fichero de ORIGEN en
  resources: el destino del mapa se ignora para ficheros** — por eso los
  scripts se llaman `packaging/appx/openwave-identity-*.ps1` y no otros);
  el CA `ImportIdentityCert` (diferido, `Impersonate="no"`, tras
  `InstallFiles`) ejecuta `openwave-identity-cert.ps1` e importa el
  certificado de la build en `LocalMachine\TrustedPeople`, el único almacén
  que `Add-AppxPackage` valida para la firma. La SAC `RegisterIdentity` (inmediata, tras
  `InstallFinalize`, `NOT REMOVE`, `Return="ignore"`, impersonada por el
  usuario) invoca
  `powershell -NoProfile -ExecutionPolicy Bypass -File
  "[INSTALLDIR]openwave-identity-ca.ps1" -Mode Register`, y
  `UnregisterIdentity` (en la desinstalación, `NOT UPGRADINGPRODUCTCODE`,
  **antes de `RemoveFiles`** porque el script tiene que seguir en disco)
  invoca `-Mode Unregister`. El script importa la confianza en
  `CurrentUser\TrustedPeople`, comprueba la de `LocalMachine` y, si el CA
  elevado no llegó a importarla, pide UAC solo para el certificado; después
  hace `Remove-AppxPackage` + `Add-AppxPackage -ExternalLocation $scriptDir`
  **sin barra final** (ver §10: con la barra el botón del taskbar no
  pinta el icono del paquete) con trazas en
  `%PROGRAMDATA%\OpenWave\openwave-identity.log` (si no se puede crear —
  instalación sin permisos — cae al INSTALLDIR y luego a `%TEMP%`). El
  Remove-Add hace
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
  Tampoco se necesita Developer Mode; solo el certificado de confianza (en
  `LocalMachine`; el paquete se registra por usuario).

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

**Verificación 1.1.3 (2026-10-21, MSI 1.1.3 instalado de una sola vez).**

- `openwave-identity.log`: `[Cert] import ok` (CA `ImportIdentityCert`) y,
  justo después, `[Register] ... LocalMachine\TrustedPeople presente`,
  `remove: ok`, `add: ok`, `verify: ok`. Sin auto-reparación extra: la
  identidad queda registrada por el MSI solo.
- `/settings/identity`: `soportado: true`, `registrada: true`,
  `paquete: OpenWave_pr6hx30mntjwm`; `Get-StartApps` muestra el AUMID
  `OpenWave_pr6hx30mntjwm!App`.
- `scripts/verify-msi.ps1`: **78 comprobaciones en verde** (67 previas + 3
  nuevas del CA `ImportIdentityCert`: fichero en el payload, CA
  diferido/elevado y orden tras `InstallFiles`).

**Verificación 1.1.4 (2026-10-21, regla de videoclips endurecida).**

- La regla nueva deja solo candidatos con marca oficial: el OMV declarado
  (de sello/sistema con el artista en el título) o el que cuelga del canal
  del artista. Una re-subida de un tercero no vale aunque copie el título
  exacto: es el hueco por donde colaban los «vídeos letra» («TU RECUERDO -
  C.R.O» de Trap SAD o «C.R.O - Tu Recuerdo» de [ M Music ]).
- Con la búsqueda real de «Tu Recuerdo» (20 resultados), la regla deja
  **solo** el OMV oficial `35wouAYd1MU` (7.0 puntos): todas las re-subidas
  de terceros fueran de letras o no, quedan fuera (3.0–4.0 en el criterio
  viejo, 0 ahora).
- El resolver completo de la 1.1.4 corre sobre el entorno Windows real del
  usuario («runtime\python.exe» + backend instalado, BD copiada): matriz
  `VjJqaSzZmUI` → ``35wouAYd1MU``, 2.6 s.
- `POST /video/prepare/VjJqaSzZmUI?oficial=1&max_alto=1080` end-to-end:
  descarga el OMV de 45.3 MB en ~30 s, aprueba un 403 tolerado (reintento)
  y deja `{"prepared":true,"desfase":4.3}` en BD. La fila del resolver se
  reescribe (`19:57:44`), `/videos` muestra «Tu Recuerdo | C.R.O | 1080p» y
  el streaming por rangos (`/video/file/VjJqaSzZmUI` con `Range`) responde
  206 por el primer trozo. La identidad (`OpenWave_pr6hx30mntjwm`) sigue
  registrada tras la actualización (CA del MSI importa el cert nuevo).
- Nota de diagnóstico: `/video/status` NO lanza el prepare — solo
  información; `POST /video/prepare` es lo que arranca la descarga. Y el
  `SSE /video/progress` responde «downloading 0» como estado por defecto
  sin entrada (línea `cache.video_progress.get(video_id, default)`), lo que
  puede confundir al diagnosticar si nunca se lanzó el prepare.

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
(`package-windows`, que ejecuta `verify-msi` **74/74** automáticamente como
gate → instalación → medición):

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

**Incidente 2026-10-20: identidad perdida con el MSI construido en CI.**
Síntoma: Task Manager volvió a separar a los 6 hijos WV2 en «Administrador de
WebView2» y `Get-AppxPackage OpenWave` daba vacío. Causa (log
`openwave-identity.log` en `%TEMP%`, entrada de la SAC del 19 a las 21:43, que
SÍ corrió): **el certificado de una build de CI es nuevo en cada build** — el
runner no tiene almacén persistente, a diferencia de la copia Windows, que
reutiliza el mismo cert mientras no caduque (por eso las builds locales del
2026-10-05 al 15 no lo sufrieron: su cert, `C49B…`, ya estaba de confianza en
`LocalMachine\TrustedPeople` desde el diagnóstico inicial). La SAC antigua
importaba la confianza solo en `CurrentUser\TrustedPeople` y firmaba
«confianza presente» sin comprobar nada; `Add-AppxPackage`, en cambio, valida
la firma contra `LocalMachine\TrustedPeople` → el alta falló con `0x800B0109`
*después* de que el `Remove-AppxPackage` previo quitara el paquete: desregistrado
in place, sin identidad desde entonces (la app funciona igual; solo cambia el
agrupado del Task Manager y el AUMID).

Arreglo (2026-10-20, completado en 1.1.3):

- `packaging/appx/openwave-identity-cert.ps1` + CA `ImportIdentityCert`
  (diferido, `Impersonate="no"`, tras `InstallFiles`): importa el cert de la
  build en `LocalMachine\TrustedPeople` antes de registrar el paquete. Es el
  almacén que `Add-AppxPackage` valida; un CA inmediato corre sin elevación y
  no puede escribir ahí. Así el MSI se arregla solo, sin reparación posterior.
- `packaging/appx/openwave-identity-ca.ps1`: confianza por **thumbprint** del
  cert de ESTA build (no por subject, que enmascara la rotación), importada en
  `CurrentUser\TrustedPeople`; comprueba `LocalMachine\TrustedPeople` y, si el
  CA elevado no llegó a importarla, pide UAC solo para el certificado. Si el
  alta vuelve a fallar con `0x800B0109`, reimporta y reintenta el alta una vez.
  Sin acentos en el fichero a propósito (PowerShell 5.1 lo lee como ANSI sin
  BOM).
- `scripts/install-msi.ps1`: auto-reparación tras instalar — si
  `Get-AppxPackage` no ve el paquete, importa la confianza (con un UAC
  dedicado para el almacén de equipo) y relanza `-Mode Register` de la SAC
  instalada.
- Reparación en vivo de la máquina: import del cert de la build (`9DA5…`) en
  `LocalMachine\TrustedPeople` + `Register` de la SAC instalada → paquete
  `OpenWave_pr6hx30mntjwm v1.1.1.0` registrado y los 7 procesos (exe + 6 WV2)
  dentro del paquete (sonda `GetPackageFamilyName`, `hr=0`; Task Manager otra
  vez con el grupo único «OpenWave (7)»).
- El MSI v1.1.1 publicado lleva la SAC antigua (import solo por usuario):
  reinstalado a mano puede volver a perder la identidad; vía `install-msi.ps1`
  queda reparado por la auto-reparación. El MSI v1.1.3 ya incluye el CA
  elevado y registra la identidad sin pasos extra; `install-msi.ps1` conserva
  la auto-reparación como red de seguridad para instalaciones antiguas.

## 11. Videoclip de fondo: catálogos de crews y bloqueo de bots (1.1.5 + 1.1.6)

**Verificación 1.1.5 (2026-10-21, resolver por canal del catálogo).** El
usuario reportó que «la mayoría de vídeos no los encuentra o no son el vídeo
oficial»: los clips de Bardero$/C.R.O los sube **MDBCrew** (la crew) sin la
marca OMV que exigía la regla de la 1.1.4, y la búsqueda con la lista entera
de artistas llenaba la query de ruido.

- Búsqueda por **primer artista** (`_artista_principal`): con «Bardero$, C.R.O,
  Homer el Mero Mero» la query larga enterraba el clip fuera de los 20
  resultados; la query es ahora `{título} {primer_artista}` («Aquella Noche
  Bardero$»).
- Tercera señal de aceptación: el canal que **se repite** en la MISMA búsqueda
  (`_canales_repetidos`, ≥2 con vistas ≥ 100 mil; del millón si el título
  anuncia «(Video Lyric)») es el canal del catálogo. El rótulo «(Video
  Lyric)» de la propia crew pasa (el clip real), las letras ajenas no
  («bardero$ - bandida [letra]» del canal «爱 offering», 18M vistas, canal
  que aparece una sola vez) ni las trampas de pocos vistas («Daniela Lipa» 5,
  «Real Musix BassBoosted» 495, Trap SAD 89, M Music 34, YFP 55).
- Resolver verificado con la búsqueda real de YouTube Music:

  | canción | fuente nueva | canal | vistas | antes (1.1.4) |
  | --- | --- | --- | --- | --- |
  | Surfeando la Ola | `Ih_SfavGO_I` | MDBCrew | 2.2M | portada |
  | Aquella Noche | `IJbjCmXQCIU` «(Video Lyric)» | MDBCrew | 47M | portada |
  | Don Perignon | `Zdfvlqo1Hmk` «(Video Lyric)» | MDBCrew | 2.5M | portada |
  | Behind Me | `U0ZVo4kK3VM` | MDBCrew | 60M | portada |

  Los OMV de siempre no se tocan: Tu Recuerdo `35wouAYd1MU`, Historia sin Fin
  `wglSoMsXzP8`, Mala Vida `BYmLUxn4vHM`, After House `1-gR6F8cwI0`.
- Migración de la caché (`_ESQUEMA_VERSION` 2 → 3): al abrir la app
  actualizada se olvidan las filas «sin videoclip» de la era 1.1.4 y se
  vuelven a resolver con la regla nueva sin esperar la caducidad de 1 h; los
  aciertos no se tocan. Verificado en la BD real tras instalar: `user_version
  = 3`, las 3 filas sin videoclip borradas, los 3 aciertos quedan.
- Test del descubrimiento del canal en `test_videoclip.py`
  (`TestAyudas`, `test_el_canal_del_catalogo_se_descubre_en_la_busqueda` y
  los de puntuación con `catalogo=`).

**Verificación 1.1.6 (2026-10-21, reintento IPv4 tras el bot-check).** Con el
resolver arreglado, la descarga del clip de MDBCrew fallaba SIEMPRE:
`ERROR: Sign in to confirm you're not a bot` en todos los intentos anónimos
de la escalera. Localización con el runtime real de Windows (`python.exe -m
yt_dlp --simulate`):

- La máquina sale por **IPv6** (misma IP externa 190.56.143.102 por v4 y v6)
  y YouTube aplica el bot-check a la v6; con `--force-ipv4` la misma descarga
  pasa. WSL sale por IPv4 y por eso en desarrollo nunca se vio: yt-dlp
  2026.07.04 en los dos lados, nada de cookies disponibles (sin navegadores
  con BD exportable; fallos DPAPI/7271/10927 en la escalera).
- Arreglo en `_descargar` (video_fondo.py): si un intento choca con el
  bloqueo (`_bloqueo_bots`: /"Sign in to confirm"/, /"not a bot"/) se
  encolan al final de la escalera los **dos intentos capaces de 1080p**
  (embed + mp4) con `source_address = 0.0.0.0` (IPv4 forzada), una sola vez
  (`ipv4_encolada`). Un v6 sano no lo nota (no se encarga nada extra).
- `POST /video/prepare` end-to-end en la app 1.1.6 instalada (identidad
  `OpenWave_pr6hx30mntjwm` re-registrada por el CA del MSI): los 3 clips de
  MDBCrew quedan preparados — Aquella Noche 68.5 MB, Surfeando la Ola
  14.8 MB, Don Perignon 69.6 MB — con desfase 0.0 (desajuste ≤1 s, sin
  medición). El log muestra la secuencia nueva: «bloqueo de bots de YouTube;
  reintento forzado a IPv4» y después «vídeo listo … fuente Ih_SfavGO_I».
- `/videos` lista los 3 (total 152.9 MB) y las filas quedan `OK` con la
  fuente de la crew: `GlTyH842Zf8 → IJbjCmXQCIU (desa=1)`,
  `sSJ2jxaqEYQ → Ih_SfavGO_I`, `V4w732FIf4E → Zdfvlqo1Hmk`.
- La fila «SIN `QNTFb4bKff4`» (resuelta por el usuario durante la prueba con
  la 1.1.5) caduca en 1 h y se re-resuelve con el criterio nuevo.

**Verificación 1.1.7 (2026-10-21, segunda búsqueda antes de cachear «sin
videoclip»).** El usuario reportó canciones que «a veces no encuentran el
vídeo hasta darle Reintentar». Medida con el catálogo real: la respuesta de
la búsqueda de YouTube Music **varía entre llamadas** — en la 1.ª pasada para
«Surfeando la Ola» MDBCrew no se llegó a repetir (ningún candidato pasaba) y
el no-resultado se cacheaba «sin videoclip» una hora con la portada; en las
4 pasadas siguientes la crew se repetía y el clip quedaba.

- Ahora `_buscar_candidato` repite la pasada (misma query, ~1.5 s de pausa)
  cuando la primera no encuentra nada —candidato vacío o búsqueda vacía— y
  solo cachea el negativo si las dos quedan sin resultado. Equivalentemente:
  la segunda oportunidad que antes dependía del botón «Reintentar» (o de la
  caducidad de 1 h) corre sola dentro del resolver. Un acierto en la 1.ª
  pasada no hace la segunda llamada (las pruebas lo verifican con el
  registro de queries).
- Tests: `test_la_segunda_busqueda_recupera_el_clip`,
  `test_la_busqueda_vacia_tiene_segunda_oportunidad` y
  `test_sin_candidato_en_dos_pasadas_se_cachea` (clase `TestResolver`).

## Regla de oro

Todo estilo con impacto potencial en GPU/CPU (backdrop-filter nuevo,
`will-change`, blur en vivo, promoción de capas, re-renders frecuentes,
`transition: "all"`) exige una corrida de `scripts/measure-perf.ps1` (60 s, con
`sistema` ≈ 6-8) antes de merge. Sin medición detrás, no entra.

Y ningún `requestAnimationFrame` encadenado sin medición detrás: un bucle que no
puede apagarse es una **petición de fotograma permanente** (§2) y mantiene la
iGPU despierta aunque no cambie nada en pantalla.
