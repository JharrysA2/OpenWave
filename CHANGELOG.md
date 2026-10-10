# Changelog

Todo los cambios notables de OpenWave se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el
proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Fixed

- **MSI con backend obsoleto**: empaquetar con `-SkipRuntime` reutilizaba
  `build\staging` sin refrescar la copia de `backend\`, así el instalador
  podía llevar un backend viejo junto a un exe nuevo. `verify-msi.ps1`
  ahora exige que el hash de código del staging coincida con el del
  repositorio (nueva comprobación 75/75), y el build se relanzó sin
  `-SkipRuntime` para que el payload lleve el código real de esta ronda.

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

[Unreleased]: https://github.com/JharrysA2/OpenWave/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JharrysA2/OpenWave/releases/tag/v1.0.0
