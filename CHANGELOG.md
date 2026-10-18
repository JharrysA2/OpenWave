# Changelog

Todo los cambios notables de OpenWave se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el
proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Los vídeos de fondo se pueden borrar desde Ajustes → Almacenamiento.** La
  nueva sección «Vídeos de fondo» lista cada clip cacheado con su canción,
  tamaño y resolución medida, y permite borrar uno a uno (con confirmación) o
  vaciar toda la caché de una vez; el espacio se libera al momento y la próxima
  apertura vuelve a preparar el clip desde cero.

### Changed

- **El karaoke gasta menos con el vídeo de fondo.** La letra animada cambiaba de
  tamaño con una transición larga (.65 s), y eso obliga al navegador a rehacer
  el diseño y repintar toda el área visible de la letra en cada fotograma del
  cambio de línea (unas 40 pasadas, justo cuando las líneas vecinas se
  recolocan); con el videoclip detrás, cada repintado se compone encima de un
  fondo que se mueve, y ahí estaban los picos de GPU. La transición del tamaño
  dura ahora **.3 s** (la mitad de fotogramas y el movimiento sigue siendo
  continuo) y el «lente» de tamaños queda en **tres escalones** (activa / vecina
  / resto) en vez de una curva continua, así que cada cambio de línea toca el
  tamaño de menos líneas (~4 en vez de ~7); la única diferencia visible son ~3 px
  en la segunda vecina. La suavidad palabra a palabra (fundido de color y peso)
  se queda intacta, que es lo que le da el aire al karaoke.
- **La interfaz deja de pedir fotogramas cuando no hay nada que cambiar.** El
  reloj del karaoke y el sincronizador del vídeo de fondo eran bucles de
  `requestAnimationFrame` encadenados: mientras la pantalla de Letras estaba
  abierta mantenían al compositor produciendo 60 fotogramas por segundo aunque
  entre palabra y palabra —o con el videoclip ya terminado— no cambiara nada en
  pantalla. Ahora el reloj es el propio `<audio>`: sus eventos (`timeupdate`
  ~4 Hz y solo con el medio en marcha, más `seeked`, `play`, `pause`…)
  re-sincronizan y un temporizador despierta justo en el instante del próximo
  cambio de palabra o de línea, así que entre despertar y despertar no se pide
  ni un fotograma y con la música en pausa no queda ningún temporizador. El
  vídeo de fondo se sigue solo con esos mismos eventos (más los suyos propios,
  porque `autoPlay` lo arranca solo) comparando los dos relojes: sin bucle, el
  `<video>` se presenta por sí mismo. El karaoke sigue igual de fino (cambia
  exactamente al cruzar la palabra, que era el motivo del bucle) y el ahorro se
  nota sobre todo con la ventana quieta o el clip parado.
- **Los últimos contornos de la interfaz se van, y todo pasa al material del
  player bar.** Los botones y campos que aún dibujaban un aro de 1px usan ya
  el cristal del player bar —gradiente, brillo interior y sombra— sin
  contorno: las pestañas de la barra lateral (Inicio, Buscar, Me gusta,
  Historial y Descargas) y sus filas de playlists, el botón de ajustes, la
  barra de búsqueda en todas las pantallas, los iconos de las pantallas de
  ajustes, los botones de Aleatorio, Reproducir y Seleccionar de Me gusta,
  Historial y Descargas, y las pestañas Canciones/Álbumes/Artistas de la
  biblioteca (y las de Música/Vídeos del buscador). El estado activo (pestaña
  o modo selección) se marca con el relleno y el color del acento, nunca con
  un aro; el candado de la cola de letras, el asa de arrastre y el botón
  «Siguiendo» del artista también dejan su borde. Los tokens compartidos
  (`GLASS.btn`, `btnHover`, `btnHoverSoft`, `navItem`, `navItemActive` y
  `searchbar`) pierden el borde, así que el material se aplica de una vez en
  toda la app. El hover realza el cristal y ya no deja el fondo «despegado»
  al salir. Los botones de cancelar de los selectores de Ajustes (color de la
  app, barra y forma de botón) y el campo de nombre de «Nueva playlist» (y su
  vista previa hexadecimal) también dejan su contorno.
- **El resto de borrados pierde el rojo.** «Eliminar (N)» de álbum y lista
  (además del de biblioteca), «Eliminar playlist», «Eliminar todo» de
  Descargas y «Limpiar» de Historial se pintan como el resto de acciones de
  su barra: el material del player bar con el texto neutro, y al pasar el
  ratón el texto aclara. El aviso lo da la propia selección (o el modal de
  confirmación, donde ya lo había).
- **La GPU manda en el modo vídeo, y ahora sin pagos cruzados.** El
  instalador registra OpenWave como app de «Alto rendimiento» en
  Configuración → Gráficas de Windows y el WebView arranca con rasterización
  por GPU, copia cero y sin el blocklist de drivers. El arranque **ya no
  lleva** `--force-high-performance-gpu`: en un portátil con la señal
  saliendo por la integrada, forzar el render en la dedicada hacía que cada
  frame pagara un copiado cruzado constante (motor Copy ≈27%). Medido en la
  misma máquina, la pantalla de letras con vídeo activo pasa de ≈50% de GPU
  total (copy 27 · 3d 10 · decode 8) a ≈20% con la ventana normal y ≈40%
  maximizada (3d y decode sobre la integrada, sin copia), y el uso en reposo
  sonando cae de ≈36% a ≈7%. El vídeo de fondo se pausa solo cuando la
  ventana está oculta o un modal la tapa: deja de decodificar mientras nadie
  lo vea y se reanuda sincronizado al volver.
- **La pantalla de letras con vídeo respira mejor.** El cristal de la
  portada + cola difumina a 12px en vez de 20px (es el pase que se vuelve a
  ejecutar en cada frame del clip) con un punto más de tinte: la lectura es
  la misma y el coste por frame baja en torno a un 40%.
- **Sin degradado bajo el encabezado de la barra lateral.** La sombra de zona
  que quedaba justo debajo de la marca, la flecha de retraer y el botón de
  ajustes ya no se dibuja; la jerarquía la da el degradado del fondo.
- **Adiós a las líneas de contorno finas.** La titlebar, la barra lateral, las
  cabeceras de ajustes y de modales, las filas de listas de álbumes y
  el editor de letras ya no dibujan hairlines de 1px: la separación es una
  sombra suave, como se pidió para la pantalla de letras.
- **Botones con el estilo del player bar en Letras.** Los botones ⋯ y ✕ de
  la pantalla, las opciones de la configuración de letras (y las filas de su
  sección «Apariencia») y los botones de los modales que abren esas opciones
  («Buscar», «Guardar cambios», «Cancelar» y los de cerrar) usan el mismo
  material de los botones del player bar —cristal con gradiente, brillo
  interior y sombra— y ninguno lleva contorno. Las opciones antes solo tenían
  una sombra suelta debajo que, sin material, se veía rara. Los selectores de
  «Tamaño» y «Alineación» de la sección «Apariencia» son botones del mismo
  material: la opción activa se marca con el relleno del acento, no con un
  contorno.
- **El cristal de la hoja de configuración de letras, a la vista.** La hoja
  (y los modales de sus opciones) llevaba una capa oscura bajo el degradado
  que tapaba el desenfoque y contornos de 1px —el de acento que llevaba
  encima y el blanco que trae el propio cristal de hoja—; ahora difumina
  como el resto de hojas y se apoya solo en el material y la sombra.
- **Los campos y los iconos de las hojas, sin contornos.** En «Buscar letras»
  los dos campos (canción y artista) y en «Editar letras» el cuadro de texto
  usan el material del player bar —cristal, brillo interior y sombra— y al
  enfocarlos se realza el cristal en vez de encenderse un aro de acento. En
  las opciones de canción, álbum, artista y lista los botones de icono y el de
  cerrar pierden su contorno y pasan al mismo material, y «Eliminar de
  biblioteca» deja el rojo y se pinta como el resto de botones.
- **Las tarjetas de Inicio, con el material del player bar.** Las tarjetas de
  canciones, álbumes y playlists de Inicio pierden el contorno y pasan al
  cristal de los botones del player bar —brillo interior y sombra incluidos—
  conservando las esquinas redondeadas; la tarjeta que está sonando se
  distingue por el tinte y el glow del acento, ya sin aro. Las filas de
  resultados del buscador de letras también dejan su contorno.
- **La biblioteca deja de pintar el borrado en rojo.** El botón «Eliminar (N)»
  de la barra de selección se pinta como el resto de acciones de la barra (la
  propia selección ya avisa de lo que se va a borrar).
- **Sin sombras separadoras en las hojas de opciones.** La hoja de opciones
  de una canción (y la de álbumes, artistas y listas) ya no dibuja la sombra
  que separaba el nombre de las opciones; tampoco los modales de letras la
  que separaba su cabecera del contenido. La jerarquía la da el material.
- **Ajustes sin sombras raras y sin desenfoque.** La separación entre filas
  es ahora una línea de pelo solo entre filas contiguas (antes cada fila
  dejaba una banda oscura de sombra, incluso tras la última dentro de la
  tarjeta) y la cabecera usa una sombra ajustada en vez de la ancha. La
  pantalla va sin backdrop-filter: la lectura la da su base opaca (la barra
  lateral y Ajustes son las pantallas sin blur).

### Removed

- **El aviso de aceleración por hardware se retiró de Rendimiento.** La sección
  «GPU» de Ajustes → Rendimiento («Aceleración por hardware activa» / «Render
  por software») ya no aparece en la interfaz.

### Fixed

- **Los botones se quedan con el cristal y sin contorno, de verdad.** Al
  quitarle el borde a los tokens, los botones y campos que no declaraban uno
  propio dejaron ver el borde nativo del navegador —un `2px outset` con el
  canto claro arriba e izquierda y gris abajo y derecha—, que se veía como un
  aro grueso alrededor del material. La hoja base anula ahora el borde de
  `button`, `input`, `textarea` y `select`; los sitios que lo declaran a
  propósito lo conservan, porque la regla no lleva `!important`.
- **Un videoclip más corto que la canción ya no satura la GPU.** Cuando el
  clip llegaba a su fin antes que la canción, el sincronizador seguía
  pidiendo `play()` al vídeo terminado: cada frame lo reiniciaba y el seek
  siguiente volvía a acabarlo, un bucle de reanudar y vaciar el decodificador
  a cadencia de frame que disparaba el uso de GPU a los pocos minutos. El clip
  final se queda en su último fotograma y solo se reanuda si el audio vuelve a
  caer dentro del clip (seek atrás o «repetir canción»).
- **Un vídeo de fondo recortado por YouTube ya no se queda bajo para siempre.**
  Al preparar un clip se anotaba el tope de resolución que se había pedido, no
  el que YouTube acabó sirviendo: sin una sesión válida YouTube recorta y puede
  entregar 720p aunque se pidieran 1080p, y como el sidecar ya decía «1080» la
  app daba el vídeo por bueno y no volvía a bajarlo nunca. Ahora, al preparar
  un clip sin medida anotada, se lee la resolución real del fichero (con el
  ffmpeg que ya viaja con la app) y es lo que queda anotado, así que un clip
  recortado se corrige solo en la siguiente apertura. El sidecar sigue siendo
  caché: si ya existe no se vuelve a medir, para no pagar una llamada a ffmpeg
  en cada apertura de la pantalla de letras.
- **La app instalada por fin encuentra su ffmpeg.** La búsqueda en
  `video_fondo` miraba un nivel por encima de donde el MSI instala el binario
  (`C:\Program Files\ffmpeg` en vez de `C:\Program Files\OpenWave\ffmpeg`), así
  que en una instalación real no se medía la resolución de ningún vídeo (los
  sidecars no se corrigen) ni se calculaba el desfase del videoclip (se
  asumía «va a la par»). Ahora la búsqueda recorre las mismas rutas que la
  descarga de música, que sí encuentra el ffmpeg empaquetado.
- **Los sidecars escritos por las builds anteriores ya no se dan por buenos.**
  Ahora el sidecar dice de qué habla: `medida=<ancho>x<alto>` es lo medido en
  el fichero y `pedida=<alto>` el tope pedido cuando no hubo forma de medir la
  descarga. Un valor sin prefijo (lo que escribían las builds anteriores) se
  ignora y se vuelve a medir una sola vez, con lo que un clip mal anotado se
  corrige. La promesa no tapa lo que llegue a medirse, y además evita que en
  una pantalla 4K sin ffmpeg se repita la descarga en cada consulta.
- **Un clip insuficiente ya no se borra y se redescarga en cada apertura.**
  Con la resolución real midiendo, cualquier recorte podía provocar un bucle:
  cada apertura borraba el vídeo y volvía a bajar unos 26 MB sin mejorar
  (YouTube recorta sin sesión y hay clips panorámicos de contenido). Ahora la
  comparación es por clase de resolución —un clip letterbox 1920x720 cuenta
  como 1080p por su ancho—, sin `cookies.txt` no se vuelve a pedir más de
  1080p (YouTube no sirve más y en pantalla 4K solo se repetiría la
  descarga), y como último freno un fichero recién descargado no se vuelve a
  bajar hasta pasadas 2 horas, tiempo de sobra para corregir la causa (un 429
  puntual o cookies nuevas).

## [1.1.1] - 2026-10-15

- **Cookies de YouTube opcionales.** Si dejas un `cookies.txt` (formato
  Netscape) en el directorio de datos, las descargas y el streaming lo usan
  para las sesiones restringidas antes de probar las cookies del navegador
  (Chrome, Firefox, Edge y Brave), que siguen siendo el respaldo.

### Changed

- **El vídeo de fondo se ve en alta definición (hasta 1080p).** Antes se quedaba
  en 360p: YouTube firma los formatos buenos y, sin descifrar la firma, la única
  variante que respondía era el 360p del cliente clásico. Ahora la descarga usa
  el cliente «embed» (que no pide PO token) con el descifrado de retos de
  yt-dlp, así que llega a 1080p; si el equipo no tiene un runtime de JavaScript
  (Node, Deno, Bun o QuickJS), la cadena de intentos sigue degradando hasta el
  vídeo de antes en vez de fallar.
- **El vídeo de fondo se ve en la resolución que admite la pantalla (hasta 4K).**
  Antes todo se pedía a 1080p: en una pantalla 4K el clip se veía reescalado y
  poco nítido. Ahora la pantalla de letras informa de la altura física de su
  display y el backend la usa como tope de la descarga (entre 720p y 4K). Ojo:
  el tope real lo fija YouTube, no el equipo: por encima de 1080p la resolución
  que llegue depende del cliente y de la sesión que acepte YouTube en cada
  momento, así que un clip puede quedarse en 1080p aunque la pantalla pida 4K.
  Para pedir lo máximo hacen falta un `cookies.txt` o las cookies del navegador;
  sin ellos la cadena sigue degradando hasta el mejor disponible. El tope pedido
  queda anotado por
  vídeo, así que un clip descargado para una pantalla grande no se vuelve a
  bajar en cada apertura (y si cambias de pantalla a una más grande, sube de
  resolución una sola vez).
- **El vídeo de fondo deja leer la letra.** El clip va un punto más atenuado y,
  mientras es el fondo, la barra lateral (portada + cola) y los botones de
  arriba (⋮ y cerrar) llevan su propio cristal: si no, el vídeo se movía por
  detrás de la portada y de la cola y costaba leerlas. Sin vídeo no cambia nada:
  esas piezas pierden el cristal y el fondo vuelve a cubrirlo todo como siempre.
- **La pantalla de letras se limpia de líneas de contorno.** Desaparecen la
  línea que separaba la cola de las letras y los bordes de 1px de cada fila de
  la cola: ahora la jerarquía la da el material, como en el player bar (brillo
  interior superior y sombra suave, con el glow del acento en la pista actual).
  Con el vídeo de fondo esas piezas van sobre cristal; solo con la portada
  llevan el mismo material sin desenfoque.

### Fixed

- **Icono del micrófono en la pantalla de letras.** Cuando la canción no tenía
  letra, el icono se renderizaba sin llamarlo y no aparecía nada.
- **Vídeo de fondo desincronizado con la música.** El videoclip sigue el reloj
  del audio, así que si llevaba intro la línea de tiempo no cuadraba y se veía
  desfasado. Ahora el backend mide el desfase entre el clip y la canción al
  prepararlo y la pantalla de letras lo aplica: el vídeo va por delante el
  tiempo exacto que midió (o espera en su primer fotograma si el clip arranca
  dentro de la canción). Un clip más corto que la canción ya no se descarta:
  se queda en su último fotograma al terminar.
- **Muchas canciones se quedaban sin videoclip para el fondo.** El criterio
  solo aceptaba clips con ±5 s de la duración de la canción y guardaba el
  «sin videoclip» en caché, con lo que canciones con clip oficial válido (p. ej.
  con intro) perdían el fondo para siempre. Ahora se puntúan los resultados de
  YouTube Music (el videoclip oficial pesa más que los otros vídeos), se
  admiten diferencias grandes de duración y una búsqueda sin resultados ya no
  se cachea: se puede reintentar.
- **El aviso de vídeo ya no desaparece en silencio.** Si la canción no tiene
  videoclip se muestra «Esta canción no tiene videoclip» (se va solo a los
  5 s); si la preparación falla o el vídeo no se puede decodificar aparece
  «No se pudo preparar el vídeo» con un botón **Reintentar**, antes el error
  dejaba la pantalla muda. Además, al reintentar (o al cambiar de canción) el
  progreso «Preparando el vídeo…» vuelve a empezar de cero.

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

[Unreleased]: https://github.com/JharrysA2/OpenWave/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.1
[1.1.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.1.0
[1.0.1]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.1
[1.0.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.0

## Interno (CI y herramientas)

Cambios de infraestructura, empaquetado y publicación. Son para el flujo de
trabajo del proyecto y **no forman parte de las notas de una versión de la app**
(esas van en las secciones `## [X.Y.Z]`).

### Fixed

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
