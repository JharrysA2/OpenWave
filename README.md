# 🎵 OpenWave — App de Música

App de música para PC usando **Tauri + React + FastAPI + ytmusicapi**.

- ✅ Streaming desde YouTube Music con **crossfade estilo Spotify** (fade simultáneo A→B)
- ✅ **Cola inteligente** (rellenada desde resultados y relacionados, con feedback de reproducción)
- ✅ **Letras sincronizadas** estilo karaoke (LRCLib + YTMusic + Genius)
- ✅ **Temas dinámicos** — colores extraídos de la portada del álbum
- ✅ Vistas de **Álbum, Artista y Playlist**, historial y likes
- ✅ Descarga offline con yt-dlp
- ✅ UI oscura con glassmorphism (True Liquid Glass)
- ✅ Instalador .MSI para Windows
- ✅ Suite de **tests**: 970 tests unitarios (Vitest) + e2e (Playwright) + Pytest

---

## 📸 Capturas

**Inicio** — recientes, para ti, tendencias y álbumes:

![OpenWave — vista de inicio](docs/screenshots/inicio.jpg)

|                       Búsqueda                        |                      Letras sincronizadas                       |
| :---------------------------------------------------: | :-------------------------------------------------------------: |
| ![OpenWave — búsqueda](docs/screenshots/busqueda.jpg) | ![OpenWave — letras sincronizadas](docs/screenshots/letras.jpg) |

---

## 📥 Descarga e instalación (usuarios)

1. Descarga el instalador `OpenWave-*-x64-es-ES.msi` desde la [página de
   Releases](https://github.com/JharrysA2/OpenWave/releases).
2. Ejecútalo y acepta el diálogo de Windows. SmartScreen puede avisar de que
   el editor es desconocido (app sin firma comercial): «Más información» →
   «Ejecutar de todos modos».
3. Requisitos: Windows 10 o 11 con WebView2 (incluido en Windows 11; en
   Windows 10 se instala desde la web de Microsoft).
4. La primera ejecución necesita internet (catálogo de YouTube Music). Las
   canciones **descargadas** se reproducen sin conexión desde la pestaña
   Descargas.

**Actualizaciones**: 1.0.0 no trae actualizador automático — descarga el MSI
más reciente e instálalo por encima de la versión anterior; tus datos
(descargas, playlists, historial y preferencias) se conservan.

**Datos**: todo se guarda en tu equipo. En Windows **instalado** van a
`%PROGRAMDATA%\OpenWave`; si esa carpeta no es escribible se usa
`%LOCALAPPDATA%\OpenWave`, y en desarrollo los datos quedan junto al código
(`backend/`). La variable `OPENWAVE_DATA_DIR` fija la ruta a mano. La app no
recopila ni envía telemetría.

---

## 📋 Requisitos

- [Node.js](https://nodejs.org/) 20.19+ (o 22.12+) — lo que exige Vite 7; el CI usa Node 24
- [Rust](https://rustup.rs/) — `rustup install stable`
- [Python](https://python.org/) 3.12+ — el CI usa 3.12 y el runtime embebido del MSI, 3.14.7
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Windows)
- [WebView2](https://developer.microsoft.com/es-es/microsoft-edge/webview2/) (ya incluido en Windows 11)

---

## 🚀 Instalación y desarrollo

```bash
# 1. Frontend
npm install

# 2. Backend
cd backend
pip install -r requirements.txt
cd ..

# 3. Ejecutar en desarrollo (dos terminales)
# Terminal 1 — Backend Python:
cd backend && python main.py

# Terminal 2 — App Tauri:
npm run tauri dev
```

> 💡 Alternativa en Windows: ejecuta `start.bat`, que inicia el backend y la app automáticamente.

---

## 📦 Scripts disponibles

| Script                                                               | Descripción                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                        | Inicia Vite dev server                                                                                           |
| `npm run build`                                                      | Build de producción (Vite)                                                                                       |
| `npm run preview`                                                    | Previsualiza el build                                                                                            |
| `npm run tauri [dev]`                                                | Comandos de Tauri                                                                                                |
| `npm test`                                                           | Tests unitarios (Vitest, modo run)                                                                               |
| `npm run test:watch`                                                 | Vitest en watch                                                                                                  |
| `npm run test:ui`                                                    | Vitest con UI                                                                                                    |
| `npm run test:e2e`                                                   | Tests e2e (Playwright)                                                                                           |
| `npm run test:e2e:ui`                                                | Playwright con UI                                                                                                |
| `npm run test:e2e:debug`                                             | Playwright en modo debug                                                                                         |
| `npm run lint`                                                       | ESLint (frontend `src/`)                                                                                         |
| `npm run lint:fix`                                                   | ESLint con auto-fix                                                                                              |
| `npm run format`                                                     | Prettier (formateo frontend)                                                                                     |
| `npm run format:check`                                               | Verifica formato Prettier                                                                                        |
| `npm run check`                                                      | ESLint + Prettier check                                                                                          |
| `npm run prepare`                                                    | Inicializa los hooks de git                                                                                      |
| `ruff check backend/`                                                | Ruff linter (backend Python)                                                                                     |
| `ruff format backend/`                                               | Ruff formatter (backend)                                                                                         |
| `python -m pytest`                                                   | Tests del backend (en `backend/`)                                                                                |
| `scripts/sync-windows`                                               | (WSL) Sincroniza la copia de trabajo de Windows con este repo                                                    |
| `scripts/generate-license.ps1`                                       | (Windows) Genera `build/windows/licencia.txt` para el diálogo de licencia del MSI                                |
| `scripts/prepare-runtime.ps1`                                        | (Windows) Prepara Python embebido + dependencias + ffmpeg en `build/staging`                                     |
| `scripts/package-windows.ps1`                                        | (Windows) Construye el instalador MSI completo → `build/windows/`                                                |
| `scripts/verify-msi.ps1`                                             | (Windows) Verificación estática del MSI compilado: 75 comprobaciones sobre sus tablas y su payload, sin instalar |
| `scripts/package-appx.ps1`                                           | (Windows) Construye el paquete MSIX/APPX desde `packaging/appx/`                                                 |
| `scripts/msi-postprocess.ps1` / `scripts/generate-installer-art.ps1` | (Windows) Post-proceso del MSI e imagen del instalador                                                           |
| `scripts/measure-perf.ps1`                                           | (Windows) Mide tiempos de arranque/render                                                                        |
| `scripts/sort-ico.py`                                                | Ordena los frames de un `.ico`                                                                                   |

Documentación relacionada:

- Guía completa del instalador (pasos, decisiones de diseño y checklist de
  aceptación): **[docs/instalador/README.md](docs/instalador/README.md)**
- Checklist de release: **[docs/release.md](docs/release.md)**
- Notas de rendimiento: **[docs/PERFORMANCE.md](docs/PERFORMANCE.md)**
- Cambios por versión: **[CHANGELOG.md](CHANGELOG.md)**

---

## 🗂️ Estructura del proyecto

```
openwave/
├── .github/workflows/
│   └── ci.yml                 ← CI: lint + format + build + tests (frontend) y ruff + pytest (backend)
├── e2e/                       ← Tests e2e (Playwright)
│   ├── helpers.js
│   └── navigation, search, player, settings, library
├── public/                    ← Assets estáticos (logo: logo.png + máscaras logo-plate/mark.png, fuentes DM Sans)
├── src/                       ← Frontend React
│   ├── App.jsx                ← Entry point (enrutado, dynamic theme, player)
│   ├── main.jsx
│   ├── constants.js
│   ├── dynamic-theme.css      ← estilos del tema dinámico (@property --neon)
│   ├── components/            ← 54 componentes UI (40 en raíz + 14 en settings/)
│   │   ├── MainRouter.jsx         ← enrutado principal
│   │   ├── Sidebar.jsx            ← navegación
│   │   ├── Logo.jsx               ← marca de la app (máscaras, color de tema)
│   │   ├── TitleBar.jsx           SearchBar.jsx        BootScreen.jsx
│   │   ├── HomeView.jsx           SearchView.jsx       LikedView.jsx
│   │   ├── AlbumView.jsx          ArtistView.jsx       PlaylistView.jsx
│   │   ├── ArtistSongsView.jsx    HistoryView.jsx      DownloadsView.jsx
│   │   ├── LyricsView.jsx         TrackList.jsx        SongRow.jsx
│   │   ├── PlayerBar.jsx          MusicCover.jsx       AudioElements.jsx
│   │   ├── SettingsPanel.jsx      SettingsPages.jsx    SettingsComponents.jsx
│   │   ├── AlbumCardRow.jsx       ArtistCardPill.jsx   LibraryCard.jsx
│   │   ├── LibraryTabs.jsx        LibrarySelectActions.jsx
│   │   ├── PlaylistPickerModal.jsx  CreatePlaylistModal.jsx
│   │   ├── SongOptionsSheet.jsx   EntityOptionsSheet.jsx
│   │   ├── ConfirmModal.jsx       TransferModal.jsx    Toast.jsx
│   │   ├── ConnectionBanner.jsx   ErrorBoundary.jsx    StatusState.jsx
│   │   ├── SkeletonLoader.jsx
│   │   └── settings/           ← 14 ficheros: páginas y modales del panel de ajustes
│   │       ├── PageApariencia.jsx  PageReproductor.jsx  PageContenido.jsx
│   │       ├── PageAlmacenamiento.jsx  PagePrivacidad.jsx  PageRendimiento.jsx
│   │       ├── PageCopias.jsx      PageTraduccion.jsx   PageAcercaDe.jsx
│   │       ├── AppColorModal.jsx   BarStyleModal.jsx    BtnShapeModal.jsx
│   │       └── ConfirmPanel.jsx    icons.jsx
│   ├── hooks/                  ← 16 hooks
│   │   ├── usePlayer.js        ← reproducción, crossfade, cola inteligente
│   │   ├── useDynamicTheme.js  ← tema dinámico desde la portada (@property --neon)
│   │   ├── useLibrary.js       useSearch.js        useBackendStatus.js
│   │   ├── useToast.js         useMediaSession.js   useMultiSelect.js
│   │   ├── useLibraryGroups.js useSavedEntities.js  useEntityOptions.jsx
│   │   ├── useSongOptions.jsx  useDragScroll.js      useEscape.js
│   │   ├── useOverlayLayer.js  useVisibility.js
│   ├── contexts/
│   │   ├── SettingsContext.jsx / useSettings.js
│   │   └── PerformanceContext.jsx
│   ├── icons/
│   │   └── Icons.jsx
│   ├── utils/                  ← 16 utilidades
│   │   ├── api.js              ← cliente HTTP del backend
│   │   ├── backendHealth.js    formatTime.js       thumbnails.js
│   │   ├── lrc.js              ← parser .lrc (multi-timestamp, offset)
│   │   ├── lyricsCache.js      lyricsOverrides.js
│   │   ├── playerStyles.js     theme.js  ← design tokens (colores, tipografía, radios, glass)
│   │   ├── appPalette.js       colorTheme.js       imageBlur.js
│   │   ├── songFilter.js       errorCodes.js
│   │   ├── softwareRenderer.js windowControls.js
│   │   └── *.test.js           ← tests unitarios (57 ficheros de test en total en src/)
│   └── i18n/
│       └── translations.js
├── backend/                    ← Backend Python (FastAPI)
│   ├── main.py                 ← Entry point (health, thumbnail-proxy)
│   ├── config.py               ← rutas de datos (%PROGRAMDATA% / %LOCALAPPDATA% / dev)
│   ├── db.py
│   ├── ytmusic_client.py
│   ├── cache.py
│   ├── logging_config.py
│   ├── rate_limit.py
│   ├── utils.py
│   ├── range_utils.py          ← parsing de cabecera Range (streams parciales)
│   ├── streaming.py
│   ├── downloads.py
│   ├── lyrics.py
│   ├── conftest.py             ← Fixtures de pytest
│   ├── test_*.py               ← Tests (pytest, 19 ficheros / 444 tests)
│   ├── requirements.txt        ← incluye requirements-runtime.txt (deps reales)
│   ├── requirements-runtime.txt
│   └── routes/
│       ├── __init__.py
│       ├── search.py
│       ├── songs.py
│       ├── streaming.py
│       ├── downloads_routes.py
│       ├── playlists.py
│       ├── history.py
│       ├── lyrics_routes.py
│       └── cache_routes.py     ← /cache/stats, /cache/clear
├── src-tauri/                  ← Tauri (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── capabilities/migrated.json
│   ├── icons/
│   ├── build.rs
│   ├── Cargo.toml / Cargo.lock
│   └── tauri.conf.json
├── scripts/                    ← Automatización de build y QA
│   ├── sync-windows            ← (WSL) copia de trabajo hacia Windows
│   ├── package-windows.ps1     ← construye el MSI
│   ├── package-appx.ps1        ← construye el paquete MSIX/APPX
│   ├── prepare-runtime.ps1     ← Python embebido + deps + ffmpeg
│   ├── verify-msi.ps1          ← 75 comprobaciones estáticas del MSI
│   ├── msi-postprocess.ps1     generate-installer-art.ps1
│   ├── generate-license.ps1    measure-perf.ps1    sort-ico.py
├── packaging/                  ← manifiestos APPX/MSI e identidad de firma
│   └── appx/                   ← AppxManifest.xml, app.manifest, openwave-identity-ca.ps1
├── docs/
│   ├── instalador/README.md    ← guía completa del instalador
│   ├── release.md              ← checklist de release
│   ├── PERFORMANCE.md          ← notas de rendimiento
│   └── screenshots/            ← capturas del README (inicio, búsqueda, letras)
├── OpenWave-1.0.0-x64-es-ES.wxs  ← fuente WiX del MSI (3,9 MB)
├── start.bat                   ← arranca backend + app en Windows
├── CHANGELOG.md
├── DESIGN.md                    ← System design (paleta, tipografía, glass)
├── .prettierrc
├── .prettierignore
├── eslint.config.js
├── pyproject.toml               ← Ruff config (backend Python)
├── playwright.config.js
├── package.json
└── vite.config.js
```

---

## 🔌 API Endpoints

### Sistema

| Método | Ruta               | Descripción                |
| ------ | ------------------ | -------------------------- |
| GET    | `/health`          | Salud del backend          |
| GET    | `/thumbnail-proxy` | Proxy de miniaturas (CORS) |

### Búsqueda y home

| Método | Ruta                   | Descripción                         |
| ------ | ---------------------- | ----------------------------------- |
| GET    | `/search?q=&limit=`    | Buscar canciones, artistas, álbumes |
| GET    | `/search/videos?q=`    | Buscar videos                       |
| GET    | `/trending`            | Tendencias                          |
| GET    | `/home/quick-picks`    | Reproducciones recientes            |
| GET    | `/home/for-you`        | Tu Mix del Momento (radio del ancla) |
| GET    | `/home/albums`         | Álbumes sugeridos                   |
| GET    | `/home/trending-fixed` | Tendencias fijas                    |

### Canciones y reproducción

| Método | Ruta                         | Descripción                           |
| ------ | ---------------------------- | ------------------------------------- |
| GET    | `/stream-url/{videoId}`      | URL de streaming                      |
| GET    | `/stream/play/{videoId}`     | Reproducción vía proxy                |
| GET    | `/stream/{videoId}`          | Stream de archivo local               |
| GET    | `/stream/prefetch/{videoId}` | Precargar en caché                    |
| GET    | `/stream/quality/{videoId}`  | Calidad disponible del stream         |
| GET    | `/stream/exists/{videoId}`   | ¿Existe ya en la caché local?         |
| GET    | `/song/details/{videoId}`    | Detalles de canción                   |
| GET    | `/song/album/{videoId}`      | Álbum de canción                      |
| GET    | `/album/{browseId}`          | Detalles de álbum                     |
| GET    | `/artist/{browseId}`         | Detalles de artista                   |
| GET    | `/artist/{browseId}/albums`  | Álbumes de un artista                 |
| GET    | `/artist/{browseId}/songs`   | Canciones de un artista               |
| GET    | `/artist/related/{browseId}` | Artistas relacionados                 |
| GET    | `/queue/{videoId}`           | Cola de reproducción (radio de YTM)   |
| POST   | `/queue/feedback`            | Feedback de reproducción (completada) |

> `GET /queue/{videoId}` construye la radio de YouTube Music (watch playlist,
> con fallbacks a watch playlist normal y a búsqueda) y **rota el orden en cada
> petición**: al volver a reproducir la misma canción, la cola que llega al
> cliente siempre cambia (refresco estilo YouTube Music; la caché de 600 s solo
> protege la llamada a YouTube, no fija el orden). Requiere
> `ytmusicapi==1.12.3` (`backend/requirements-runtime.txt`) — en 1.7.3
> `get_watch_playlist` fallaba con `KeyError 'endpoint'` y la cola salía siempre
> del mismo fallback de búsqueda.

### Descargas

| Método | Ruta                                  | Descripción                      |
| ------ | ------------------------------------- | -------------------------------- |
| POST   | `/download/{videoId}`                 | Iniciar descarga                 |
| GET    | `/download/progress/{videoId}`        | Progreso de descarga             |
| GET    | `/downloads`                          | Listar descargas                 |
| DELETE | `/downloads/{videoId}`                | Eliminar descarga                |
| DELETE | `/downloads/all`                      | Limpiar todas                    |
| POST   | `/downloads/delete`                   | Eliminar selección               |
| POST   | `/downloads/album`                    | Descargar un álbum entero        |
| GET    | `/download/progress/album/{browseId}` | Progreso de la descarga de álbum |

### Playlists e historial

| Método | Ruta                               | Descripción                   |
| ------ | ---------------------------------- | ----------------------------- |
| GET    | `/playlists`                       | Listar playlists              |
| POST   | `/playlists`                       | Crear playlist                |
| PUT    | `/playlists/{pid}`                 | Renombrar/actualizar playlist |
| DELETE | `/playlists/{pid}`                 | Eliminar playlist             |
| GET    | `/playlists/{pid}/songs`           | Canciones de una playlist     |
| POST   | `/playlists/{pid}/songs`           | Agregar canciones             |
| DELETE | `/playlists/{pid}/songs/{videoId}` | Quitar canción                |
| POST   | `/playlists/{pid}/reorder`         | Reordenar                     |
| POST   | `/playlists/import`                | Importar playlists (JSON)     |
| GET    | `/history`                         | Historial                     |
| POST   | `/history`                         | Registrar reproducción        |
| DELETE | `/history`                         | Eliminar una entrada          |
| DELETE | `/history/all`                     | Limpiar historial             |
| POST   | `/history/import`                  | Importar historial            |

### Caché

| Método | Ruta           | Descripción                   |
| ------ | -------------- | ----------------------------- |
| GET    | `/cache/stats` | Tamaño y entradas de la caché |
| POST   | `/cache/clear` | Vaciar la caché               |

### Letras

| Método | Ruta                      | Descripción           |
| ------ | ------------------------- | --------------------- |
| GET    | `/lyrics/{videoId}`       | Letras automáticas    |
| GET    | `/lyrics/search`          | Buscar letras         |
| GET    | `/lyrics/local/{videoId}` | Letras locales (.lrc) |

---

## 🧪 QA y calidad de código

- **ESLint** — Reglas para React 18 + JSX + Hooks
- **Prettier** — Formateo automático
- **Vitest** — 970 tests unitarios en 57 ficheros (componentes, hooks y utils del frontend)
- **Playwright** — Tests e2e (navegación, búsqueda, reproducción, settings, librería)
- **Ruff** — Linter y formatter para Python backend
- **Pytest** — 444 tests del backend (rutas, DB, streaming, descargas, letras, utils)
- **GitHub Actions CI** — Frontend (Node 24): lint + `format:check` + build +
  `npm test`; Backend (Python 3.12): `ruff check` + `ruff format --check` +
  pytest

---

## ⚠️ Notas legales

- **Licencia del código**: [CC BY-NC 4.0](LICENSE) — libre para uso
  personal: puedes copiarlo, modificarlo y redistribuirlo citando al autor,
  pero **no con fines comerciales** ni con ánimo de lucro. Cualquier
  distribución con fines de lucro corresponde a quien la realice, quedando
  dicha persona o entidad responsable de las consecuencias que de ello se
  deriven.
- OpenWave consulta contenido a través de la **API privada de YouTube
  Music** (`ytmusicapi`, reverse engineering). No está afiliada, patrocinada
  ni respaldada por Google ni por YouTube; el acceso queda sujeto a las
  [Condiciones de Servicio de Google](https://www.youtube.com/t/terms) y la
  disponibilidad del contenido depende de terceros. El uso de dicha API es
  responsabilidad de quien la emplee.
- Para uso personal funciona sin problemas. Para un servicio público o
  comercial, la alternativa legal sería la
  [YouTube Data API v3](https://developers.google.com/youtube/v3) oficial
  (gratuita con límites).
- El software se distribuye «tal cual», sin garantía de ningún tipo (Sección
  5 de la licencia).
