# Changelog

Todo los cambios notables de OpenWave se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el
proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Vídeo de fondo en la pantalla de letras.** Un ajuste nuevo (⋮ →
  Apariencia, y también en Ajustes → Apariencia → Letras) pone el **videoclip
  oficial** de la canción detrás de la letra en lugar de la portada. Se busca y
  se prepara solo al abrir las letras, con su progreso, y queda cacheado para la
  próxima vez; el vídeo va mudo y sincronizado con el audio de siempre. Si la
  canción no tiene videoclip oficial (los «art track» son la portada hecha
  vídeo), se queda la portada y no se descarga nada.
- **Cookies de YouTube opcionales.** Si dejas un `cookies.txt` (formato
  Netscape) en el directorio de datos, las descargas y el streaming lo usan
  para las sesiones restringidas antes de probar las cookies del navegador
  (Chrome, Firefox, Edge y Brave), que siguen siendo el respaldo.

### Fixed

- **Icono del micrófono en la pantalla de letras.** Cuando la canción no tenía
  letra, el icono se renderizaba sin llamarlo y no aparecía nada.

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

[Unreleased]: https://github.com/JharrysA2/OpenWave/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.1
[1.0.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.0

## Interno (CI y herramientas)

Cambios de infraestructura, empaquetado y publicación. Son para el flujo de
trabajo del proyecto y **no forman parte de las notas de una versión de la app**
(esas van en las secciones `## [X.Y.Z]`).

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
