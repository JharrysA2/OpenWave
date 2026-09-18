# 🎵 SoundWave — App de Música

App de música para PC usando **Tauri + React + FastAPI + ytmusicapi**.

- ✅ Streaming desde YouTube Music con **crossfade estilo Spotify** (fade simultáneo A→B)
- ✅ **Cola inteligente** (rellenada desde resultados y relacionados, con feedback de reproducción)
- ✅ **Letras sincronizadas** estilo karaoke (LRCLib + YTMusic + Genius)
- ✅ **Temas dinámicos** — colores extraídos de la portada del álbum
- ✅ Vistas de **Álbum, Artista y Playlist**, historial y likes
- ✅ Descarga offline con yt-dlp
- ✅ UI oscura con glassmorphism (True Liquid Glass)
- ✅ Instalador .exe para Windows con NSIS (~40MB RAM en reposo)
- ✅ Suite de **tests**: 552 tests unitarios (Vitest) + e2e (Playwright) + Pytest

---

## 📋 Requisitos

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) — `rustup install stable`
- [Python](https://python.org/) 3.10+
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

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Inicia Vite dev server |
| `npm run build` | Build de producción (Vite) |
| `npm run preview` | Previsualiza el build |
| `npm run tauri [dev]` | Comandos de Tauri |
| `npm test` | Tests unitarios (Vitest, modo run) |
| `npm run test:watch` | Vitest en watch |
| `npm run test:ui` | Vitest con UI |
| `npm run test:e2e` | Tests e2e (Playwright) |
| `npm run test:e2e:ui` | Playwright con UI |
| `npm run test:e2e:debug` | Playwright en modo debug |
| `npm run lint` | ESLint (frontend `src/`) |
| `npm run lint:fix` | ESLint con auto-fix |
| `npm run format` | Prettier (formateo frontend) |
| `npm run format:check` | Verifica formato Prettier |
| `npm run check` | ESLint + Prettier check |
| `npm run prepare` | Inicializa Husky (pre-commit hooks) |
| `ruff check backend/` | Ruff linter (backend Python) |
| `ruff format backend/` | Ruff formatter (backend) |
| `python -m pytest` | Tests del backend (en `backend/`) |

---

## 🗂️ Estructura del proyecto

```
soundwave/
├── .github/workflows/
│   └── ci.yml                 ← CI: lint + format + build + tests (frontend) y ruff + pytest (backend)
├── .husky/
│   └── pre-commit             ← Ejecuta lint-staged antes de cada commit
├── e2e/                       ← Tests e2e (Playwright)
│   ├── helpers.js
│   └── *.spec.js
├── public/                    ← Assets estáticos (logo, favicon)
├── src/                       ← Frontend React
│   ├── App.jsx                ← Entry point (enrutado, dynamic theme, player)
│   ├── main.jsx
│   ├── constants.js
│   ├── components/            ← 23 componentes UI
│   │   ├── AlbumView.jsx          HomeView.jsx        PlaylistView.jsx
│   │   ├── ArtistView.jsx         LikedView.jsx       SearchView.jsx
│   │   ├── ConfirmModal.jsx       LyricsView.jsx      SelectionModal.jsx
│   │   ├── ConnectionBanner.jsx   MusicCover.jsx      SettingsComponents.jsx
│   │   ├── CreatePlaylistModal.jsx PlayerBar.jsx      SettingsPanel.jsx
│   │   ├── DownloadsView.jsx      SkeletonLoader.jsx  SettingsPages.jsx
│   │   ├── ErrorBoundary.jsx      SongOptionsSheet.jsx Toast.jsx
│   │   ├── HistoryView.jsx        TrackPickerModal.jsx
│   ├── hooks/                  ← 6 hooks
│   │   ├── useToast.js
│   │   ├── usePlayer.js        ← reproducción, crossfade, cola inteligente
│   │   ├── useLibrary.js
│   │   ├── useSearch.js
│   │   ├── useBackendStatus.js
│   │   └── useDynamicTheme.js  ← tema dinámico desde la portada (rAF + --neon)
│   ├── contexts/
│   │   └── SettingsContext.jsx / useSettings.js
│   ├── icons/
│   │   └── Icons.jsx
│   ├── utils/
│   │   ├── api.js              ← cliente HTTP del backend
│   │   ├── backendHealth.js
│   │   ├── formatTime.js
│   │   ├── lrc.js              ← parser .lrc (multi-timestamp, offset)
│   │   ├── playerStyles.js
│   │   ├── theme.js            ← design tokens (colores, tipografía, radios, glass)
│   │   ├── thumbnails.js
│   │   └── windowControls.js
│   └── i18n/
│       └── translations.js
├── backend/                    ← Backend Python (FastAPI)
│   ├── main.py                 ← Entry point (health, thumbnail-proxy, extract-colors)
│   ├── config.py
│   ├── db.py
│   ├── ytmusic_client.py
│   ├── cache.py
│   ├── logging_config.py
│   ├── rate_limit.py
│   ├── utils.py
│   ├── streaming.py
│   ├── downloads.py
│   ├── lyrics.py
│   ├── conftest.py             ← Fixtures de pytest
│   ├── test_*.py               ← Tests (pytest)
│   ├── requirements.txt
│   └── routes/
│       ├── __init__.py
│       ├── search.py
│       ├── songs.py
│       ├── streaming.py
│       ├── downloads_routes.py
│       ├── playlists.py
│       ├── history.py
│       └── lyrics_routes.py
├── src-tauri/                  ← Tauri (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── color_extract.rs    ← extracción de color de la portada
│   ├── capabilities/migrated.json
│   ├── icons/
│   ├── build.rs
│   ├── Cargo.toml / Cargo.lock
│   └── tauri.conf.json
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

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Salud del backend |
| GET | `/thumbnail-proxy` | Proxy de miniaturas (CORS) |
| GET | `/extract-colors/{videoId}` | Extracción de colores de la portada |

### Búsqueda y home

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/search?q=&limit=` | Buscar canciones, artistas, álbumes |
| GET | `/search/videos?q=` | Buscar videos |
| GET | `/trending` | Tendencias |
| GET | `/home/quick-picks` | Reproducciones recientes |
| GET | `/home/for-you` | Recomendaciones personalizadas |
| GET | `/home/albums` | Álbumes sugeridos |
| GET | `/home/trending-fixed` | Tendencias fijas |

### Canciones y reproducción

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stream-url/{videoId}` | URL de streaming |
| GET | `/stream/play/{videoId}` | Reproducción vía proxy |
| GET | `/stream/{videoId}` | Stream de archivo local |
| GET | `/stream/prefetch/{videoId}` | Precargar en caché |
| GET | `/song/details/{videoId}` | Detalles de canción |
| GET | `/song/album/{videoId}` | Álbum de canción |
| GET | `/album/{browseId}` | Detalles de álbum |
| GET | `/artist/{browseId}` | Detalles de artista |
| GET | `/artist/related/{browseId}` | Artistas relacionados |
| GET | `/queue/{videoId}` | Cola de reproducción |
| POST | `/queue/feedback` | Feedback de reproducción (completada) |

### Descargas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/download/{videoId}` | Iniciar descarga |
| GET | `/download/progress/{videoId}` | Progreso de descarga |
| GET | `/downloads` | Listar descargas |
| DELETE | `/downloads/{videoId}` | Eliminar descarga |
| DELETE | `/downloads/all` | Limpiar todas |
| POST | `/downloads/delete` | Eliminar selección |

### Playlists e historial

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/playlists` | Listar playlists |
| POST | `/playlists` | Crear playlist |
| PUT | `/playlists/{pid}` | Renombrar/actualizar playlist |
| DELETE | `/playlists/{pid}` | Eliminar playlist |
| GET | `/playlists/{pid}/songs` | Canciones de una playlist |
| POST | `/playlists/{pid}/songs` | Agregar canciones |
| DELETE | `/playlists/{pid}/songs/{videoId}` | Quitar canción |
| POST | `/playlists/{pid}/reorder` | Reordenar |
| GET | `/history` | Historial |
| POST | `/history` | Registrar reproducción |
| DELETE | `/history` | Eliminar una entrada |
| DELETE | `/history/all` | Limpiar historial |
| GET/POST | `/player/state` | Persistencia del estado del player |

### Letras

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/lyrics/{videoId}` | Letras automáticas |
| GET | `/lyrics/search` | Buscar letras |
| GET | `/lyrics/local/{videoId}` | Letras locales (.lrc) |

---

## 🧪 QA y calidad de código

- **ESLint** — Reglas para React 18 + JSX + Hooks
- **Prettier** — Formateo automático
- **Vitest** — 552 tests unitarios (componentes, hooks y utils del frontend)
- **Playwright** — Tests e2e (navegación, búsqueda, reproducción, settings, librería)
- **Ruff** — Linter y formatter para Python backend
- **Pytest** — Tests del backend (rutas, DB, streaming, descargas, letras, utils)
- **Husky + lint-staged** — Pre-commit hook que ejecuta Prettier + ESLint automáticamente
- **GitHub Actions CI** — Frontend: lint + formato + build + `npm test`; Backend: ruff + pytest

---

## ⚠️ Notas legales

- `ytmusicapi` usa la API privada de YouTube Music (reverse engineering).
- Para **uso personal** funciona sin problemas.
- **No distribuir comercialmente** ni usar para servicios públicos.
- Alternativa legal: usar la [YouTube Data API v3](https://developers.google.com/youtube/v3) oficial (gratuita con límites).