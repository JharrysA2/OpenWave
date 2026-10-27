# OpenWave — instrucciones del proyecto para el agente

App de escritorio de música (YouTube Music) para Windows: **Tauri 2 + React**
(frontend) y **FastAPI + yt-dlp/ytmusicapi** (backend). Este directorio es el
repo de trabajo (WSL/Linux); la copia Windows solo se usa para compilar.

## Idioma y estilo

- Comentarios, commits, `CHANGELOG`, docs y textos de UI: **en español**.
- Nada de texto meta ni menciones de IA en los mensajes.
- Sigue las convenciones y el estilo de los ficheros que toques.

## Comandos de verificación (gates)

Frontend (raíz del repo):

- `npx vitest run` — suite completa
- `npx eslint src` y `npx prettier --check "src/**/*.{js,jsx}"`
- `npm run build`

Backend (`backend/`):

- `../backend/venv/bin/python -m pytest -q`
- `../backend/venv/bin/python -m ruff check .` y `ruff format --check .`

Deja **todos** los gates en verde antes de dar un cambio por terminado.

## Rutina obligatoria al acabar un cambio

1. Verifica (tests + lint + format + build).
2. Documenta en `CHANGELOG.md` **qué** cambió y **por qué**:
   - cambios de la **app** → `## [Unreleased]`;
   - cambios de **CI/herramientas/empaquetado** → `## Interno` (no salen en las
     notas de versión de la app).
3. Commit en español (estilo conventional commits) y `git push origin master`.
4. Publica versión **solo si el cambio toca la app** (o cuando se pida). Las
   herramientas y el CI **no** suben versión (ver «Flujo de release»).

## Política de versionado (SemVer)

- **MINOR** `1.0.1 → 1.1.0`: mejoras o arreglos **grandes**, funciones nuevas.
- **PATCH** `1.0.1 → 1.0.2`: arreglos o mejoras **pequeñas**.
- **MAJOR** `1.x → 2.0.0`: cambios incompatibles o migraciones.
- **En la duda, PATCH.**
- La versión refleja la **app**. Los cambios de **CI, scripts de empaquetado o
  documentación** **no** suben versión: van a `## Interno` del `CHANGELOG` y se
  publican cuando toque un cambio real de la app.
- La versión está en `package.json`, `package-lock.json` (x2),
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
  `src-tauri/Cargo.lock` y `packaging/arch/PKGBUILD`.
  Súbela **siempre** con `scripts/bump-version.py` (nunca a mano).

## Flujo de release

La receta completa está en `docs/release.md` y en la skill `openwave-release`.
Resumen:

### Automático (recomendado)

```bash
# 1. Trabajo commiteado y pusheado, con los cambios de app en
#    CHANGELOG [Unreleased] (los de CI/herramientas van en `## Interno`).
# 2. Lanza el workflow (elige la subida según la política):
gh workflow run release.yml -f bump=patch     # o minor/major, o -f version=1.2.3
#    Hace: sube versión -> commit chore(release) -> tag -> compila el MSI en
#    Windows -> publica la release con el MSI y las notas del CHANGELOG.
# 3. Trae el commit de versión que hizo el workflow:
git pull --ff-only
# 4. Paquetes de Linux (el workflow NO los sube; van a mano):
scripts/package-linux.sh                      # .deb + .AppImage + .pkg.tar.zst
gh release upload vX.Y.Z \
  src-tauri/target/release/bundle/deb/OpenWave_X.Y.Z_amd64.deb \
  src-tauri/target/release/bundle/appimage/OpenWave_X.Y.Z_amd64.AppImage \
  packaging/arch/openwave-X.Y.Z-1-x86_64.pkg.tar.zst
# 5. Instala el MSI publicado y verifica:
powershell.exe -File scripts/install-msi.ps1 -Version X.Y.Z -Launch
```

### Local (fallback / cuando no se quiera usar Actions)

```bash
scripts/bump-version.py patch          # o minor
git add -A && git commit -m "chore(release): vX.Y.Z"
git push origin master
git tag -a vX.Y.Z -m "OpenWave vX.Y.Z" && git push origin vX.Y.Z   # dispara la release
```

Construir el MSI en la copia Windows (solo cuando haga falta):

```bash
scripts/sync-windows                   # alinea C:\Users\jharrys\Desktop\OpenWave con master
# cerrar la app (deja libre el puerto 8765) y:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File \
  'C:\Users\jharrys\Desktop\OpenWave\scripts\package-windows.ps1' -NoOpen
```

- **No uses `-SkipRuntime`** si cambió el backend: hay que reempaquetar el staging.
- `package-windows.ps1` ya corre `verify-msi.ps1` (debe dar **78/78**).
- El instalador sale en `build\windows\OpenWave-<version>-x64-es-ES.msi`.

## Rutas y avisos

- Copia Windows (SOLO build, nunca editar): `C:\Users\jharrys\Desktop\OpenWave`
  → desde WSL `/mnt/c/Users/jharrys/Desktop/OpenWave`.
- Datos reales de la app: `C:\ProgramData\OpenWave\openwave.db` (solo lectura).
- Puerto del backend local: **8765**.
- Scripts de release: `scripts/bump-version.py`, `scripts/install-msi.ps1`,
  `scripts/package-windows.ps1`, `scripts/verify-msi.ps1`, `scripts/sync-windows`.
- Paquetes de Linux: `.deb` con `npx tauri build --bundles deb` (staging con
  `scripts/prepare-runtime.sh`) y `.pkg.tar.zst` de Arch con
  `scripts/package-arch.sh` (`packaging/arch/PKGBUILD`). El mando `openwave` y
  la entrada de escritorio salen de `packaging/linux/`.
- Workflows: `.github/workflows/ci.yml` (PR/push), `release.yml` (versión),
  `build-msi.yml` (solo compila el MSI, reutilizable).
- Al escribir PowerShell desde WSL: usa un `.ps1` en
  `/mnt/c/Users/jharrys/AppData/Local/Temp/` y ejecútalo con
  `powershell.exe -File` (evita comillas y acentos rotos).

## Convenciones de código

- Frontend en `src/` (componentes `.jsx`, tests `.test.jsx` junto al fichero).
- Backend en `backend/` (rutas en `backend/routes/`, tests `test_*.py`).
- No introduzcas dependencias nuevas sin necesidad.
