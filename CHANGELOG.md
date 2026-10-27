# Changelog

Todo los cambios notables de OpenWave se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el
proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-10-27

### Corregido
- Parpadeo al abrir Letras o un modal en Linux («Inicio se superpone un instante»): era una regresión del compositor Skia de WebKitGTK 2.54 (bug upstream 327524) y no de la app; el binario fija `WEBKIT_USE_SKIA_FOR_COMPOSITION=0` para cualquier GPU, lo que elimina el parpadeo sin perder aceleración por hardware. Además, con GPU NVIDIA en Wayland aplica `__NV_DISABLE_EXPLICIT_SYNC=1` (frames negros o con basura al cambiar de pantalla, 311 → 0) y en X11 `WEBKIT_DISABLE_DMABUF_RENDERER=1` (ventana en blanco). Si el usuario ya fijó alguna variable, se respeta. Documentado en `docs/linux.md` (§13).

## Interno

### Corregido
- Los paquetes de Linux de una release ya no dependen de la memoria: `scripts/package-linux.sh` construye `.deb`, `.AppImage` y `.pkg.tar.zst` de una vez (con el workaround del `strip` embebido en linuxdeploy, que no sabe tratar las secciones `.relr.dyn` de las libs actuales y abortaba el AppImage), y `AGENTS.md`, `docs/release.md` y la skill de release incluyen el paso de `gh release upload` — el workflow solo sube el MSI.
- Tests en verde con Node ≥ 25: el `localStorage` nativo experimental de Node devolvía `undefined` y tapaba el de jsdom en vitest (300 tests fallaban con «Cannot read properties of undefined»). `src/test-setup.js` instala un almacén equivalente cuando el nativo no está disponible.

## [1.2.0] - 2026-10-25

### Added

- **Primer paquete nativo de Linux (`.deb`), desde el mismo repo y el mismo
  código.** `tauri.linux.conf.json` declara `targets`, el mapa de `resources` y
  las dependencias de GStreamer; `scripts/prepare-runtime.sh` arma
  `build/staging-linux` con CPython 3.14.9 portable (hash pineado),
  `requirements-runtime.txt` y ffmpeg estático, cumpliendo el mismo contrato de
  layout que Windows (`backend/`, `runtime/`, `ffmpeg/`). El paquete arranca el
  backend con `runtime/bin/python3`, descarga y convierte MP3 con el ffmpeg
  empaquetado, y guarda los datos en XDG. Los arrays de plataforma salieron del
  config base a `tauri.windows.conf.json`: la configuración resuelta de Windows
  es idéntica a la anterior.
- **En Linux aparece en el buscador de aplicaciones y se lanza con `openwave`.**
  `packaging/linux/openwave.desktop` (categorías `Audio`/`Music`, keywords y
  textos en español) es ahora el `desktopTemplate` del `.deb`, y el paquete
  instala `packaging/linux/openwave` como `/usr/bin/openwave`: se escribe
  `openwave`, la app arranca con `setsid` en su propia sesión y **la terminal
  se cierra sola** al ver que el proceso existe (no se cierra nada si arranca
  mal: salen las últimas líneas de `<datos>/app.err.log`). Si la app ya está
  abierta no abre una segunda ventana (compartirían backend y cerrar una
  mataría la otra), solo trae la existente al frente con `hyprctl`; `--keep`
  deja la terminal abierta. Para Arch y derivadas hay además
  `packaging/arch/PKGBUILD` con `scripts/package-arch.sh`, que genera
  `openwave-<versión>-x86_64.pkg.tar.zst` (132 MB, mismo payload que el
  `.deb`) para instalar con `pacman -U`.

### Changed

- **Datos fuera del directorio del código también en Linux**: `_es_instalado`
  solo reconocía instalaciones de Windows, así que un AppImage extraído o una
  instalación escribible habrían dejado base de datos y descargas junto al
  binario. Ahora la marca `runtime/` hermano de `backend/` vale en las dos
  plataformas (`backend/config.py`, `src-tauri/src/lib.rs`), con tests.
- **Higiene de comentarios en todo el código** (frontend, backend y Tauri):
  fuera los banners decorativos (`// ─── Título ───`, bloques `═══`) y los
  emoji de adorno (⭐, ⚠️, ⚡, 🔄), y los comentarios que contaban la historia
  de un bug en 12 líneas quedan en 2-4 con la restricción que importa
  (radio/scaleX, CSP con nonce, lock por vídeo, escritura atómica del MP3,
  AUMID, presupuesto de GPU). No cambia ninguna línea de código ni el
  comportamiento de la app.
- **Un solo `clamp01` y un solo formateador de duración**: `AppColorModal` y
  `useDynamicTheme` repetían la misma función de recorte, y `TrackList` y
  `SongOptionsSheet` reimplementaban `fmtTime` a mano. Ahora se importan de
  `utils/colorTheme` y `utils/formatTime`; el resultado en pantalla es el
  mismo.

### Fixed

- **El fondo de la pantalla de letras vuelve a salir difuminado con el vídeo
  de fondo apagado.** En Linux, WebKitGTK acepta `ctx.filter` y lo devuelve
  intacto al leerlo, pero lo ignora al rasterizar: la portada pre-difuminada
  en canvas salía NÍTIDA y, al tener valor `bgBlurUrl`, la capa retiraba su
  `filter` CSS de respaldo. Ahora `filtroCanvasSoportado()` mide si el motor
  aplica el filtro de verdad (dibuja un borde duro con blur y comprueba si el
  píxel del borde queda entremezclado); si no lo hace, el pre-difuminado
  resuelve `null` —sin ni siquiera descargar la miniatura— y la capa vuelve a
  la cadena `blur(12px) saturate(1.2) brightness(0.7)`, que sí se desenfoca en
  ese motor. Donde la medición no es posible se sigue usando el camino rápido
  de siempre.

## [1.1.9] - 2026-10-22

### Changed

- **Los mensajes temporales llevan el mismo Liquid Glass real del player
  bar: vidrio translúcido que se ve a través, letras blancas y sin
  contorno.** Nuevo token `GLASS.mensaje` con el material exacto de la
  barra de reproducción (`rgba(10,10,18,.18)` + `blur(10px)` + su brillo
  interior superior). El «blanco o negro» es para las LETRAS — sobre vidrio
  translúcido van siempre en blanco (el negro no se leería) — y no para el
  vidrio. Color de estado prohibido en los avisos: ni verdes, ni rojos, ni
  ámbar; el `type` solo conserva su papel semántico (dedup/registro).
  Heredan el material:
  - **Toasts** (info/éxito/error): idénticos entre sí, translúcidos y con
    letras blancas — el éxito estaba pintado de verde (`rgba(5,46,22,.88)`
    + texto `#86efac`) y cada tipo llevaba su borde.
  - **Banner «Servidor sin conexión»**: estaba en **ámbar** total (fondo,
    texto, punto y dos bordes); ahora vidrio del player con blur(10px) —
    detrás suyo pasan las vistas al hacer scroll — punto y badge del código
    en blanco y sin borde.
  - **Píldoras del videoclip** (progreso, «sin videoclip», error): base
    translúcida algo mayor (a .24: detrás hay vídeo brillante y la letra
    debe leerse siempre) sobre su difuminado de 12px; fuera la línea de
    contorno y el teñido del punto y del botón «Reintentar» con el acento
    de la vista.
  - **Estados de error** (`StatusState`): el círculo del icono, el badge
    del código y el «Reintentar» usaban el acento con bordes; van con el
    material del player y letras blancas. `accentColor` se acepta por
    compatibilidad pero ya no pinta nada.
  - **ErrorBoundary**: sobre su fondo sólido no hay nada que difuminar, el
    blur queda apagado — y fuera el borde blanco fino de la tarjeta y del
    círculo del icono.
  Quedan fuera por no ser mensajes: badges persistentes («Sincronizado»,
  «Pre-cargada», «OFFLINE», héroe de Descargas), affordances interactivas
  (corazón, hover de borrar, botón de peligro) y la paleta de acento del
  usuario.

## [1.1.8] - 2026-10-21

### Fixed

- **El streaming de audio también salta a IPv4 contra el bloqueo de bots.**
  El mismo bot-check («Sign in to confirm you're not a bot») que dejaba el
  videoclip sin descargarse con la IPv6 del equipo tumbaba la reproducción
  de canciones: el intento principal del stream (yt-dlp pipeado), los
  clients de la extracción de URL (default/tv_embedded) y la construcción
  del audio bajo contestaban con el bloqueo y la escalera quedaba sin
  oído. Cada intento que choca con él se repite ahora una vez forzado a
  IPv4 — el mismo salto que la 1.1.6 aplicó a la descarga del videoclip —
  y la escalera sigue al siguiente método si la IPv4 también viene
  bloqueada.

## [1.1.7] - 2026-10-21

### Fixed

- **Segunda pasada de búsqueda antes de cachear «sin videoclip».** La
  respuesta de la búsqueda de YouTube Music varía entre llamadas: el canal
  del catálogo puede no llegar a repetirse en una respuesta y la canción
  quedaba cacheada como «sin videoclip» una hora (portada) aunque una
  búsqueda posterior lo encontrara — el caso que solo arreglaba el botón
  «Reintentar». Si la primera pasada no encuentra nada se vuelve a buscar
  (~1.5 s después) y el negativo solo se cachea cuando las dos quedan
  vacías; un acierto directo no hace la segunda llamada.

## [1.1.6] - 2026-10-21

### Fixed

- **La escalera de descargas salta a IPv4 cuando YouTube bloquea los bots.**
  Con la IPv6 del equipo marcada como sospechosa, YouTube contesta «Sign in
  to confirm you're not a bot» a todos los intentos anónimos y el clip (el
  de MDBCrew de «Aquella Noche», por ejemplo) nunca bajaba. Cuando un
  intento choca con ese bloqueo se repiten ahora —forzados a IPv4— los dos
  que pueden dar 1080p; la misma descarga por IPv4 pasa.

## [1.1.5] - 2026-10-21

### Fixed

- **El videoclip vuelve a encontrarse en catálogos de crews sin marca OMV.** La
  regla de solo-OMV/canal-del-artista de la 1.1.4 dejaba en portada canciones
  cuyo clip lo sube el canal de la crew o del sello (Bardero$ → MDBCrew)
  porque YouTube Music no lo declara oficial. Ahora una subida de un canal
  que se repite dentro de la misma búsqueda —señal de que es el canal del
  catálogo— vale si sus vistas delatan el clip de verdad (a partir de 100 mil;
  del millón si el título anuncia «(Video Lyric)», porque la propia banda
  cuelga sus videoclips con ese rótulo), y el artista encabezado tiene que
  salir en el título. Las re-subidas ajenas —cinco, cientos de vistas, o
  canales de letra que aparecen una sola vez aunque pasen del millón— siguen
  fuera.
- **La búsqueda del videoclip va con el título y el PRIMER artista.** Con la
  lista entera de colaboraciones («Bardero$, C.R.O, Homer el Mero Mero») la
  query se llena de ruido y el clip quedaba fuera de los 20 resultados; solo
  se busca con el que encabeza la canción.
- **Al actualizar se olvidan los «sin videoclip» de la regla anterior.** El
  esquema de la caché sube de versión y las filas «no tiene videoclip»
  guardadas por la 1.1.4 se descartan una vez: con el criterio nuevo se
  vuelven a resolver en cuanto se abre la canción, sin esperar a que la
  comprobación negativa caduque. Los aciertos no se tocan.

## [1.1.4] - 2026-10-21

### Changed

- **El videoclip de fondo solo se busca entre vídeos del propio artista.** La
  búsqueda ya no acepta re-subidas de canales ajenos aunque copien el título
  exacto: así se colaban «vídeos letra» de otras personas («TU RECUERDO -
  C.R.O», «C.R.O - Tu Recuerdo» subidos a canales de letras) cuando el clip
  oficial no aparecía en la búsqueda. Ahora hace falta que YouTube Music
  marque el vídeo como clip oficial (OMV) o que lo cuelgue el canal del
  artista; un OMV de un canal ajeno —un sello— vale si el artista aparece en
  el título. Si no hay nada seguro, la pantalla se queda con la portada.

## [1.1.3] - 2026-10-21

### Fixed

- **La identidad de Windows se registra sola al instalar el MSI.** El
  certificado de la build se importa en `LocalMachine\TrustedPeople` desde una
  acción diferida y elevada, antes de registrar el paquete como el usuario que
  instala. Así el Administrador de tareas agrupa OpenWave y sus WebView2 sin el
  paso extra de reparar la identidad después de instalar.
- **Un fallo al medir el desfase ya no borra el videoclip.** Si la comparación
  de pistas no encuentra un encaje claro, el vídeo se reproduce a la par en vez
  de eliminarse y cachear «sin videoclip». Era lo que dejaba «Tu Recuerdo» de
  C.R.O sin fondo: en la 1.1.2 falló la descarga sin sesión y el descarte
  posterior bloqueó la canción durante 24 h. Al actualizar se olvidan los «sin
  videoclip» que dejó ese fallo y la comprobación negativa caduca en una hora.
- **Almacenamiento muestra la clase real del clip.** Un videoclip panorámico
  (1920x1038, letterbox) se lista como «1080p» —que es lo que es por ancho— en
  lugar del «1038p» que daba la altura fotograma a fotograma.

## [1.1.2] - 2026-10-21

### Added

- **Sesión de YouTube desde Ajustes → Contenido.** Se puede cargar o pegar un
  `cookies.txt` en formato Netscape. Antes de guardarlo, la app comprueba con
  yt-dlp que la sesión abre «Ver más tarde» en YouTube: si no la reconoce, no
  se guarda nada y se explica el motivo. Con una sesión válida las descargas de
  vídeo pueden llegar a 1080p (y más en pantallas 4K) en vez de quedarse en la
  calidad limitada de las peticiones anónimas. El fichero se guarda con
  permisos de propietario en el directorio de datos y no se sube a ningún
  sitio.
- **Los vídeos ya cacheados se reintentan al añadir cookies.** Si un clip se
  descargó antes de configurar la sesión, al abrirlo se vuelve a descargar una
  vez para aprovechar la resolución extra, sin esperar las 2 h del reintento
  normal.

### Fixed

- **El Administrador de tareas vuelve a agrupar OpenWave y sus WebView2.** El
  diagnóstico del registro del paquete sparse se escribe ahora en
  `%PROGRAMDATA%\OpenWave\openwave-identity.log`, se comprueba al arrancar y
  Ajustes → Acerca de avisa si falta, con un botón «Reparar» que vuelve a
  registrar la identidad con UAC sin reinstalar la app (hay que reiniciar
  OpenWave para que el proceso actual la tome). El script del MSI verifica
  además que el paquete quedó registrado antes de dar el alta por buena.
- **La versión de «Acerca de» sale del `package.json`** en vez de un valor
  fijo que se había quedado en 1.0.0.

## [1.1.1] - 2026-10-20

### Added

- **La pantalla de letras puede llevar el videoclip de la canción de fondo.**
  Se elige el clip oficial de la canción, se descarga con la mejor calidad
  disponible de la sesión (1080p; hasta 4K cuando la pantalla lo admite), llena
  el área de letras completa y arranca al tempo de la música: el desfase entre
  clip y canción se mide al preparar el vídeo y se compensa al reproducirlo. Si
  la canción no tiene clip o la preparación falla, se avisa en pantalla con
  botón de reintento.
- **La caché de vídeos se administra desde Ajustes → Almacenamiento.** Se
  lista cada clip con su tamaño y resolución, y se puede borrar uno a uno o
  vaciarla entera; el espacio queda libre en el momento.

### Changed

- **El consumo de GPU de la pantalla de Letras baja notablemente.** Con
  videoclip o con la portada difuminada, la pantalla compone menos capas y
  texturas por fotograma y el karaoke hace menos trabajo por palabra; la
  interfaz, además, deja de pedir fotogramas mientras no hay nada que cambiar.
- **La jerarquía visual la da el material, no los contornos.** Tarjetas de
  Inicio, biblioteca, hojas de opciones, Ajustes y la pantalla de letras
  prescinden de los bordes de 1 px: separan superficies, sombras suaves y el
  acento de la canción, igual que el player bar.
- **La barra de título se integra con el estilo de la aplicación.** Botones
  cuadrados con el radio de la interfaz y los tres controles de ventana
  dibujados a trazo; nada de desenfoque en una zona donde no se mueve nada.
- **Sesiones restringidas de YouTube mejor atendidas.** Las descargas y el
  streaming admiten un `cookies.txt` opcional en el directorio de datos y
  recurren a las cookies del navegador como respaldo, de modo que las peticiones
  disponen de una sesión real y suelen conseguir más calidad.

## [1.0.1] - 2026-10-12

### Added

- **«Para ti» ahora es un mix real, estilo YouTube Music**. El home elige una
  **Canción Ancla** —la que más has repetido en las últimas 72 h— la coloca en
  el puesto #1 y pide su **radio** a YouTube (`get_watch_playlist`) para traer
  las canciones que de verdad se relacionan con ella. Se apoya en una tabla
  nueva `play_events` que registra cada reproducción con marca de tiempo, para
  poder medir repeticiones recientes (antes solo existía un contador total).

### Changed

- **Motor de recomendaciones reescrito.** Antes «Para ti» se armaba buscando
  por **nombre de artista**, así que la sección acababa copada por el cantante
  más escuchado (p. ej. C.R.O / CRO) y apenas aparecía el resto del historial.
  Ahora el orden lo deciden YouTube y tu afinidad real, **sin repartir por
  artista**: las canciones que ya disfrutas (más reproducidas de siempre o con
  «Me gusta») van justo después del ancla y el descubrimiento completa el mix.
- **El orden varía en cada armado.** Las canciones pueden repetirse entre
  visitas, pero ya no salen siempre en la misma secuencia: conocidas y
  descubrimiento se barajan, y cada reproducción invalida la caché para
  recalcular el ancla al momento.
- **Menos espera.** El mix hace una sola llamada a la radio (antes encadenaba
  varias): pasa de ~8 s a ~2 s la primera vez y es instantáneo después.

## [1.0.0] - 2026-10-11

Primera versión pública y completa de OpenWave.

### Added

- **Reproducción**: streaming en tres calidades (Baja / Estándar / Alta), cola
  con rotación de YouTube Music, aleatorio con crossfade, repetición
  off→todas→una, recomendaciones opcionales de cola y palanca de
  «Pausar historial de escuchas» que ahora SÍ corta el registro de escuchas.
- **Descargas MP3** (128/192/320 kbps) con conversión **atómica**
  (`ffmpeg` a `.part` + `os.replace`): un archivo en disco siempre está
  completo; reproducción completa en modo Alta esperando la descarga.
- **Letras karaoke** sincronizadas con selector de fuente, y **tema dinámico**
  generado desde la portada del álbum.
- **Interfaz**: sidebar retráctil con botón Liquid Glass, home en bandas
  horizontales arrastrables, escalera tonal M3 en superficies planas, tarjeta
  de la taskbar con portada/nombre (Media Session/SMTC), estados de
  error con código reportable + «Reintentar» (`StatusState`) y
  error boundary amigable con «Recargar app» (Liquid Glass, blanco y negro).
- **Copias de seguridad completas**: la exportación incluye ahora las
  canciones de cada playlist y la importación es REAL —
  `POST /history/import` y `POST /playlists/import` restauran en SQLite con
  fusión idempotente (reimportar no duplica nada) y la UI se refresca sola.
- **Mensajes de error visibles**: los fallos de reproducción aparecen como
  mensaje flotante con estilo Liquid Glass en blanco y negro (sin rojos), con
  deduplicación de toasts; las promesas rechazadas sin `catch` quedan
  registradas en consola.
- Interfaz en español e inglés (selector de idioma), códigos de error
  reportables en todos los estados de fallo, e2e con Playwright.


- **Pantalla «Todas las canciones del artista»**: nuevo botón en la página
  del artista que abre una vista dedicada con el catálogo COMPLETO
  (`GET /artist/{id}/songs`: la playlist VL entera con fallback de
  búsqueda, sin recorte de 5-10 canciones) y navegación ESC/atrás que
  vuelve al artista.
- **Álbumes completos del artista**: el scroll horizontal de la página del
  artista ahora carga TODOS los álbumes y singles en segundo plano
  (`GET /artist/{id}/albums` paginado con `get_artist_albums(limit=None)`,
  deduplicado y cacheado) — antes solo aparecía el primer carrusel.
- **Descargas con máxima calidad**: la fuente de audio pasa a `bestaudio`
  (m4a/opus de mayor bitrate, con reintento automático al itag 18 si
  falla), la portada se guarda en la resolución más alta disponible
  (maxres/w2048, con candidatas de fallback) y el MP3 lleva tags ID3 con
  título/artista/álbum/año y la portada embebida (`attached_pic`).
- **Offline-first**: las canciones descargadas se reproducen desde el MP3
  local en TODAS las vistas (historial, playlists, tendencia, álbum,
  búsquedas — antes solo en playlists), sus portadas se sirven desde
  disco (`/music/covers/{id}.jpg`, primera fuente del srcset) y la letra
  se lee del `.lrc` guardado sin ir a la red.
- **Letras persistidas**: las letras automáticas quedan en localStorage
  por canción y sobreviven a recargas/reinicios sin internet («Recargar
  letras» las limpia y vuelve a la fuente).
- **Biblioteca navegable sin backend**: si una petición GET falla por red,
  `api.js` sirve la última respuesta conocida (aunque haya expirado) en
  vez de lanzar error.
- **Buscador local en «Me gusta», «Historial», «Descargas» y
  Playlist**: una barra glass (la misma de Inicio/Búsqueda) filtra en
  memoria las canciones de esa pantalla mientras escribes — título,
  artista(s) y álbum, sin red y sin tocar el catálogo global. La
  comparación es insensible a mayúsculas y acentos («musica» encuentra
  «Música»); sin coincidencias muestra un aviso con la consulta. En
  Playlist, mientras hay consulta activa se desactiva el
  arrastrar-reordenar porque los índices no corresponden a la lista
  completa; al cambiar de playlist la consulta se limpia.

### Changed

- **Ajustes → Contenido**: se eliminaron los toggles «LrcLib» y «KuGou» de
  proveedor de letras (no tenían ningún consumidor; las fuentes se eligen
  desde el reproductor de letras).
- Errores de reproducción: la política de silencio total se sustituye por
  aviso discreto cuando ambos intentos de reproducción fallan, y la UI
  revierte a «pausado» si `play()` rechaza (antes se quedaba «sonando» sin
  sonar).
- `ErrorBoundary` muestra una tarjeta amigable con botón «Recargar app» en
  vez del stack trace crudo.
- README y documentación actualizados con las cifras reales de la suite
  (970 Vitest + 444 Pytest, verify-msi 75 checks).

- **Álbumes del artista en orden cronológico inverso**: la sección
  «Álbumes» (y el endpoint `/artist/{id}/albums`) ahora muestra todo de
  lo más reciente a lo más viejo; los álbumes sin año se quedan al
  final. Antes seguían el orden arbitrario de YouTube Music.

- **Pool de hilos dedicado para la transcodificación**: la re-codificación
  a baja calidad (ffmpeg, minutos por canción) ya no compite con el
  executor por defecto del event loop, que sirve las llamadas a
  ytmusicapi y SQLite de casi todos los endpoints — con builds
  concurrentas, búsqueda y descargas se encolaban detrás. Ahora corre en
  un pool propio de 4 hilos.

### Fixed

- **CI en rojo desde hacía días**: `ruff format` sobre 8 archivos backend
  (el gate local solo corría pytest); ahora el gate local incluye
  `ruff check` + `ruff format --check`.
- **«0 %» sin salida al descargar** desde el menú de opciones: el POST y el
  SSE de progreso ahora capturan errores, reinician el botón y avisan
  (incluye el rate limit de 5/min y la caída del backend).
- **Error pintado como «vacío»**: `fetchPlaylistSongs` propaga el fallo y
  Playlists/Historial/Descargas muestran estado de error con «Reintentar»
  en vez de «Esta playlist está vacía» / «No hay historial aún».
- **`GET /song/details` envenenaba la caché**: un fallo puntual se cacheaba
  1 h y dejaba el panel «Detalles» vacío; ahora los fallos no se cachean.
- **Copias de seguridad**: la importación de historia y playlists se escribía
  a claves `localStorage` que nadie leía y aun así decía «Datos importados».

- **Botón «Ver todas las canciones» que no hacía nada**: la rama de
  `MainRouter` para la pantalla dedicada estaba DESPUÉS de la del
  artista; como `artistBrowseId` sigue activo al apilar, la página del
  artista volvía a ganar y la vista nueva nunca se renderizaba. Ahora
  `artistSongs` tiene prioridad (y hay test de integración que cubre el
  orden de ramas).

- **MSI con backend obsoleto**: empaquetar con `-SkipRuntime` reutilizaba
  `build\staging` sin refrescar la copia de `backend\`, así el instalador
  podía llevar un backend viejo junto a un exe nuevo. `verify-msi.ps1`
  ahora exige que el hash de código del staging coincida con el del
  repositorio (nueva comprobación 75/75), y el build se relanzó sin
  `-SkipRuntime` para que el payload lleve el código real de esta ronda.

- **Tipografía inconsistente en botones, inputs y varios modales**: el
  navegador NO hereda la fuente en los controles de formulario
  (`button`/`input`/`select`/`textarea` usaban la del sistema —Segoe/Arial—
  en vez de DM Sans: «Reproducir todo», «Aleatorio», «Limpiar», los
  botones de ConfirmModal/CreatePlaylistModal…). Regla global
  `font-family: inherit` en `dynamic-theme.css` (más `body` como red de
  seguridad para contenido montado en `<body>` por portales); los
  estilos inline con familia propia siguen mandando.

- **Pantalla principal en blanco con una pestaña corrupta**: si la clave
  de pestaña de `localStorage` estaba dañada (o venía de una versión
  futura), el `switch` de `MainRouter` caía a `default: null` y el
  contenido quedaba VACÍO sin ningún error. Cualquier clave desconocida
  ahora renderiza Inicio.

- **«Eliminar descarga» sin aviso si fallaba**: la acción del menú de
  canciones no tenía `try/catch`; un fallo (backend caído, red) moría
  como promesa rechazada sin toast y con la hoja quieta sin explicación.
  Ahora avisa del error y deja la hoja abierta para reintentar.

- **500 cuando YouTube Music cambia** en `/artist`, `/artist/{id}/albums`,
  `/artist/{id}/songs`, `/artist/related/{id}`, `/search` y
  `/home/quick-picks`: estos endpoints no tenían manejo de fallo (el
  resto ya degradaba). Ahora devuelven la forma vacía correspondiente
  y registran el aviso, sin cachear el fallo.

- **Dos descargas concurrentes del mismo vídeo corrompían el MP3**: no
  había lock por `video_id`, así que la individual y la pista de un
  álbum (o dos álbumes) pasaban ambas el check `exists()` y dos ffmpeg
  escribían el mismo `.mp3.part`; el `os.replace` de uno publicaba un
  archivo mientras el otro seguía escribiendo. Lock por vídeo: la
  segunda hebra espera y al entrar ve el MP3 completo.

- **Spinner de progreso infinito si yt-dlp se colgaba**: el SSE de
  progreso (individual y de álbum) no tenía tope de tiempo y emitía
  `{"status": "downloading"}` para siempre. Ahora cierra con un evento
  `{"status": "error", "error": "timeout"}` a los 10 minutos.

- **Resultados de la búsqueda anterior visibles bajo el skeleton de la
  nueva**: al buscar por segunda vez, el bloque de resultados no se
  gateaba con el estado «buscando» y los resultados viejos aparecían
  DEBAJO del skeleton de la consulta nueva. Ahora, mientras hay una
  búsqueda en vuelo solo se pinta el skeleton.

- **La vista de letras no se reiniciaba al cambiar de canción**: el
  contenedor de scroll es el mismo y conservaba el `scrollTop` de la
  anterior, así que la letra nueva arrancaba a media altura o abajo.
  Ahora cada canción empieza en el inicio de su letra.

- **Clic en la canción que ya suena reiniciaba en vez de
  pausar/reanudar**: el toggle existía pero solo SIN contexto — desde
  álbum, playlist, favoritos o descargas (que pasan su lista), el clic
  en la misma pista volvía a cargar el audio desde el segundo 0. Ahora
  la pausa/reanuda funciona desde cualquier vista (el clic con lista
  re-ancla además la cola a ese contexto sin recargar el audio, para que
  «Reproducir todo» siga montando la cola de la lista); la única
  excepción es un `startFrom` explícito (seek desde la letra), que
  posiciona el reloj como antes.

### Removed

- **`TrackPickerModal` y `SelectionModal` (UI muerta)**: ninguno de los
  dos podía abrirse — ningún flujo les pasaba `open=true` y sus setters
  de datos ni se usaban (~600 líneas inalcanzables en el bundle). Las
  funciones que representaban ya existen por otra vía: añadir canciones
  a playlists (PlaylistPickerModal) y borrado múltiple de descargas
  (multi-select propio de Descargas).

### Security

- **`/thumbnail-proxy` exfiltraba datos del usuario a cualquier web
  (SSRF + CORS)**: la validación era un `re.match` por prefijo, pero
  httpx normaliza `..` al hacer la petición —
  `.../music/covers/../../history` pasaba el check y el proxy servía
  historial, descargas, playlists y MP3s con `Access-Control-Allow-Origin:
  *` (legible desde cualquier origen, sin que la app tuviese el foco).
  Ahora el path se valida YA NORMALIZADO y con puerto exacto del
  backend, la URL final tras redirects vuelve a pasar las mismas reglas
  (sin SSRF por redirect), las respuestas 404/HTML ya no se sirven como
  imagen ni se cachean 7 días, y se quitaron los `*` de ACAO (el
  middleware CORS pone el origen real de la app).

- **CSRF sobre la API local y DNS rebinding**: el middleware CORS solo
  decide si el navegador puede LEER la respuesta; las peticiones
  «simple» (POST JSON) de una web maliciosa llegaban igual y ejecutaban
  efectos (borrar descargas, limpiar caché, forzar descargas, crear
  playlists…). Nueva guardia ASGI `LocalOnlyGuard`: rechaza con 403
  cualquier `Origin` que no sea la webview de Tauri o el dev server, y
  cualquier `Host` no local (una web rebindada llegaría same-origin pero
  con Host de su dominio). Sin cabecera Origin = cliente nativo, se
  permite.

[Unreleased]: https://github.com/JharrysA2/OpenWave/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.2.1
[1.2.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.2.0
[1.1.9]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.9
[1.1.8]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.8
[1.1.7]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.7
[1.1.6]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.6
[1.1.5]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.5
[1.1.4]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.4
[1.1.3]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.3
[1.1.2]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.2
[1.1.1]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.1
[1.1.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.0
[1.0.1]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.1
[1.0.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.0

## Interno (CI y herramientas)

Cambios de infraestructura, empaquetado y publicación. Son para el flujo de
trabajo del proyecto y **no forman parte de las notas de una versión de la app**
(esas van en las secciones `## [X.Y.Z]`).

### Added

- **`scripts/bump-version.py` sube la versión en un fichero más**:
  `packaging/arch/PKGBUILD` (`pkgver`), que ahora es el séptimo sitio donde
  vive la versión, y de paso deja `pkgrel=1` en cada versión nueva (el `r2`
  solo lo toca el empaquetado). El resto del flujo de release no cambia.
- **Plan de soporte nativo de Linux** (`docs/linux.md`): cómo repartir la
  separación entre configuración por plataforma, staging del runtime y CI sin
  bifurcar el código, con cinco fases, un gate por fase y los riesgos de
  WebKitGTK. Incluye una grieta ya localizada: `_es_instalado` devuelve
  `False` fuera de Windows (`backend/config.py:39`, `src-tauri/src/lib.rs:204`),
  así que en una instalación Linux la decisión de dónde viven los datos queda
  en manos de si el directorio del código es escribible. El arreglo es aceptar
  la marca `runtime/` (ya presente en el layout empaquetado) también en Linux,
  en los dos sitios.

### Changed

- **`scripts/prepare-runtime.sh` recorta el Tcl/Tk completo**: además de
  `libtcl*`/`libtk*` y el paquete `tkinter`, se van `_tkinter.so` y las
  extensiones Tcl (`tcl9*`, `tk9.0`, `itcl*`, `thread3*`). Ese módulo enlaza
  contra `libtcl9tk9.0.so`, que el Python portátil no trae, y `linuxdeploy`
  persigue la dependencia al construir el `.AppImage` →
  `Could not find dependency: libtcl9tk9.0.so`. El staging queda en 264 MB y
  el `.deb`/`.pkg.tar.zst` bajan unos 1000 ficheros.
- **`docs/linux.md` documenta los dos escollos del AppImage en Arch/CachyOS**:
  `NO_STRIP=1` (el `strip` de 2024 que trae linuxdeploy no lee las secciones
  `.relr.dyn` de las librerías actuales y aborta) y el `AppDir` y la copia
  `target/release/_up_/` que no se limpian entre pasadas y arrastran staging
  obsoleto. Con esto el `.AppImage` se genera en local: `OpenWave_1.2.0_amd64
  .AppImage` (241 MB).
- **`packaging/arch/PKGBUILD` sube a `pkgrel=3`**: el frontend va embebido en
  el binario, así que el paquete `1.1.9` se vuelve a generar con el arreglo
  del fondo de Letras; sin ese incremento pacman no distingue el artefacto
  nuevo del `openwave-1.1.9-2` anterior.

### Fixed

- **El barrido de CSP de `LyricsView.test.jsx` volvía a la carga**: el comentario
  de `LyricsView.jsx` citaba literalmente `<style`, que el test detecta como
  inyección de estilos en runtime (2 tests en rojo desde `89e6fd9`). El
  comentario habla ahora de «hoja de estilos que React inyecta».
- **Verificación de la regla de videoclips de la 1.1.5 y del reintento IPv4 de
  la 1.1.6** en `docs/PERFORMANCE.md`: resolver por canal del catálogo con el
  catálogo real (3/3 clips de MDBCrew), migración de la caché («sin videoclip»
  olvidadas al actualizar) y `POST /video/prepare` end-to-end con el
  bot-check de IPv6 visible en el log y la bajada final por IPv4.
- **Verificación de la regla de videoclips en la 1.1.4** en `docs/PERFORMANCE.md`:
  resolver con la regla nueva (solo el OMV sobrevive de 20 candidatos reales),
  `POST /video/prepare` end-to-end (30 s, 1080p, desfase medido) y la nota de
  diagnóstico de `video/status` / el SSE `video/progress`.
- **Los tests de versión no van más con el número pegado en duro.** «Acerca
  de» y «Ajustes → Acerca de» leen el `__APP_VERSION__` que inyecta vite desde
  `package.json`; al subir versión el workflow no rompía la suite.
- **La identidad del paquete (Task Manager en un grupo) ya no se pierde al
  instalar un MSI construido en CI.** El certificado de una build de CI es
  nuevo en cada build y la SAC solo lo importaba como de confianza en el
  almacén por usuario, mientras que `Add-AppxPackage` valida la firma contra
  el almacén del equipo: el alta fallaba con `0x800B0109` después de quitar
  el paquete previo y la app quedaba agrupada como «Administrador de
  WebView2». Ahora la SAC importa la confianza por thumbprint también en el
  almacén del equipo (con reintento si el alta vuelve a rechazar la firma) y
  `install-msi.ps1` repara en caliente si el paquete quedó sin registrar.
- **Instalar con `install-msi.ps1 -Launch` ya no puede dejar dos OpenWave
  abiertos.** La instalación usa `msiexec /qb` y el MSI puede autolanzar la app
  al registrar la identidad (acción AUTOLAUNCHAPP), así que el `-Launch` añadía
  una segunda instancia: dos ventanas con su vídeo de fondo y su cristal sobre
  la misma iGPU → la GPU al doble y la delante a tirones (parece que la app va a
  2 fps). Ahora, si ya hay una instancia arrancada, el script no abre otra y se
  limita a verificar `/health`. (`/qn` se probó para no depender del autolanzado
  y msiexec devolvía 1603: esta instalación necesita la secuencia de UI.)
- **`verify-msi.ps1` contempla la nueva clave de registro del MSI**: la tabla
  Registry pasa de 8 a 9 filas (la preferencia de gráficas `GpuPreference=2`
  que escribe `main.wxs`) y hay una comprobación [OK] específica para esa
  clave, para que nadie la quite sin que el verificador lo note.

### Added

- **Publicación automática** (`release.yml` + `build-msi.yml`): al empujar un
  tag `vX.Y.Z`, o a mano (`gh workflow run release.yml -f bump=patch|minor|major`,
  o `-f version=X.Y.Z`), un workflow sube la versión, compila el MSI en un runner
  Windows con la misma receta que en local (`prepare-runtime` + `package-appx` +
  `tauri` + `verify-msi`) y publica la release con el MSI, el sha256 y las notas
  del `CHANGELOG`. Con `-f dry_run=true` solo compila, sin tocar la versión ni
  crear la release.
- **`scripts/bump-version.py`**: sube la versión en los seis ficheros que la
  declaran y mueve `[Unreleased]` a `## [X.Y.Z] - fecha` con sus enlaces.
- **`scripts/install-msi.ps1`**: descarga el MSI de una release, lo instala en
  silencio y verifica `/health` y `/home/for-you`.
- **Memoria y skill del proyecto**: `AGENTS.md` (se carga en cada conversación)
  y la skill `.opencode/skills/openwave-release`, con la política de versionado
  y el flujo de publicación.

### Changed

- **`scripts/package-appx.ps1`**: ya **no** importa el certificado autofirmado
  en `Cert:\CurrentUser\Root` (esa operación se queda colgada en un runner
  headless, sin diálogo de consentimiento) y la comprobación de firma del
  `.msix` tolera una cadena sin raíz de confianza: la firma se valida
  criptográficamente y el instalador es quien confía el `.cer`. Así el build
  funciona igual en una máquina limpia y en CI.
- **Política de versionado explícita** (SemVer): la versión refleja la **app**;
  MINOR para mejoras o arreglos grandes, PATCH para pequeños y MAJOR para
  cambios incompatibles (en la duda, PATCH). Los cambios de CI/herramientas **no**
  suben versión. Documentada en `AGENTS.md`, `docs/release.md` y la skill.
- **`docs/release.md`** reescrito: distingue la vía automática (Actions) de la
  local (fallback) manteniendo los gates.
- **`build-msi.yml`** desglosado en pasos atómicos numerados (licencia, gráficos,
  runtime, identidad, `tauri build`, post-proceso, `verify-msi`), con
  `timeout-minutes` por paso y por job y modo no interactivo
  (`$ConfirmPreference='None'`): si algo falla o se cuelga, el paso concreto lo
  delata de inmediato en vez de un bloque gigante.

### Fixed

- **Pasos de CI que quedaban en rojo sin motivo**: `prepare-runtime.ps1` y
  `package-appx.ps1` heredaban un `$LASTEXITCODE` distinto de cero de comandos
  nativos (una comprobación de `pip`, un `signtool verify` sin raíz de
  confianza); el wrapper de `shell: pwsh` termina con `exit $LASTEXITCODE`, así
  que el paso fallaba aunque hubiera ido bien. Ahora lo resetean en el scope
  global.
- **`scripts/verify-msi.ps1`**: las dos comprobaciones de los gráficos del
  asistente fallaban en CI. `dark.exe` se buscaba en una ruta fija y, sobre
  todo, el `-MsiPath` que pasa el workflow llega **relativo** y el descompilador
  se ejecuta tras un `Push-Location`, así que `dark.exe` ya no encontraba el MSI
  (salía con código 103 y sin extraer nada). Ahora la ruta del MSI se normaliza a
  **absoluta** y `dark.exe` se localiza en los sitios habituales
  (`%LOCALAPPDATA%`/`%APPDATA%\tauri`, `PATH`, WiX del sistema), con diagnóstico
  si falla.
- **`scripts/install-msi.ps1`**: sustituido un guion largo (UTF-8) por uno
  ASCII; Windows PowerShell 5.1 lee los `.ps1` como ANSI si no llevan BOM y
  rompía el parseo.
- **`build-msi.yml` (paso 8)**: `Write-Host "MSI $version: …"` se parseaba como
  la variable `$version:` (inválida); se cambió a `${version}`. Era el último
  fallo del `dry_run` una vez arreglado `verify-msi`.
