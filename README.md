# 🎵 SoundWave — App de Música

App de música para PC usando **Tauri + React + FastAPI + ytmusicapi**.

- ✅ ~40MB RAM en reposo
- ✅ Instalador .exe para Windows con NSIS
- ✅ Streaming desde YouTube Music
- ✅ UI oscura con glassmorphism
- ✅ Descarga offline con yt-dlp
- ✅ Letras sincronizadas (LRCLib + YTMusic + Genius)

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

---

## 📦 Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Inicia Vite dev server |
| `npm run build` | Build de producción (Vite) |
| `npm run lint` | ESLint (frontend `src/`) |
| `npm run lint:fix` | ESLint con auto-fix |
| `npm run format` | Prettier (formateo frontend) |
| `npm run format:check` | Verifica formato Prettier |
| `npm run check` | ESLint + Prettier check |
| `npm run prepare` | Inicializa Husky (pre-commit hooks) |
| `ruff check backend/` | Ruff linter (backend Python) |
| `ruff format backend/` | Ruff formatter (backend) |

---

## 🗂️ Estructura del proyecto

```
soundwave/
├── .github/workflows/
│   └── ci.yml              ← CI: lint + format + build (frontend + backend)
├── .husky/
│   └── pre-commit           ← Ejecuta lint-staged antes de cada commit
├── src/                     ← Frontend React
│   ├── App.jsx              ← Entry point (~350 líneas)
│   ├── main.jsx
│   ├── constants.js
│   ├── components/          ← 13 componentes UI
│   │   ├── ErrorBoundary.jsx
│   │   ├── HomeView.jsx
│   │   ├── SearchView.jsx
│   │   ├── LikedView.jsx
│   │   ├── HistoryView.jsx
│   │   ├── DownloadsView.jsx
│   │   ├── PlayerBar.jsx
│   │   ├── SettingsPanel.jsx
│   │   ├── SongOptionsSheet.jsx
│   │   ├── MusicCover.jsx
│   │   ├── Toast.jsx
│   │   ├── TrackPickerModal.jsx
│   │   └── SelectionModal.jsx
│   ├── hooks/
│   │   └── useToast.js
│   ├── contexts/
│   │   ├── SettingsContext.jsx
│   │   └── useSettings.js
│   ├── icons/
│   │   └── Icons.jsx
│   ├── utils/
│   │   ├── formatTime.js
│   │   ├── windowControls.js
│   │   └── playerStyles.js
│   └── i18n/
│       └── translations.js
├── backend/                 ← Backend Python (FastAPI)
│   ├── main.py              ← Entry point (~120 líneas)
│   ├── config.py
│   ├── db.py
│   ├── ytmusic_client.py
│   ├── cache.py
│   ├── utils.py
│   ├── streaming.py
│   ├── downloads.py
│   ├── lyrics.py
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
├── src-tauri/               ← Tauri (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── color_extract.rs
│   └── tauri.conf.json
├── .prettierrc
├── .prettierignore
├── eslint.config.js
├── pyproject.toml           ← Ruff config (backend Python)
├── package.json
└── vite.config.js
```

---

## 🔌 API Endpoints

### Búsqueda y home

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/search?q=&limit=` | Buscar canciones, artistas, álbumes |
| GET | `/search/videos?q=` | Buscar videos |
| GET | `/trending` | Tendencias |
| GET | `/home/quick-picks` | Reproducciones recientes |
| GET | `/home/for-you` | Recomendaciones personalizadas |
| GET | `/home/albums` | Álbumes sugeridos |

### Canciones y reproducción

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stream-url/{videoId}` | URL de streaming |
| GET | `/stream/{videoId}` | Stream de archivo local |
| GET | `/stream/prefetch/{videoId}` | Precargar en caché |
| GET | `/song/details/{videoId}` | Detalles de canción |
| GET | `/song/album/{videoId}` | Álbum de canción |
| GET | `/album/{browseId}` | Detalles de álbum |
| GET | `/artist/{browseId}` | Detalles de artista |
| GET | `/queue/{videoId}` | Cola de reproducción |

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
| POST | `/playlists/{pid}/songs` | Agregar canciones |
| POST | `/playlists/{pid}/reorder` | Reordenar |
| GET | `/history` | Historial |
| POST | `/history` | Registrar reproducción |
| DELETE | `/history/all` | Limpiar historial |

### Letras

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/lyrics/{videoId}` | Letras automáticas |
| GET | `/lyrics/search` | Buscar letras |
| GET | `/lyrics/local/{videoId}` | Letras locales (.lrc) |

---

## 🧪 QA y calidad de código

El proyecto tiene configurado:

- **ESLint** — Reglas para React 18 + JSX + Hooks
- **Prettier** — Formateo automático
- **Ruff** — Linter y formatter para Python backend
- **Husky + lint-staged** — Pre-commit hook que ejecuta Prettier + ESLint automáticamente
- **GitHub Actions CI** — Verifica lint, formato y build en cada push/PR

---

## ⚠️ Notas legales

- `ytmusicapi` usa la API privada de YouTube Music (reverse engineering).
- Para **uso personal** funciona sin problemas.
- **No distribuir comercialmente** ni usar para servicios públicos.
- Alternativa legal: usar la [YouTube Data API v3](https://developers.google.com/youtube/v3) oficial (gratuita con límites).
