# Changelog

Todo los cambios notables de OpenWave se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el
proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/spec/v2.0.0.html).

## [1.0.0] - 2026-10-09

Primera versión completa y terminada.

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
  (938 Vitest + 399 Pytest, verify-msi 74 checks).

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

[1.0.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.0
