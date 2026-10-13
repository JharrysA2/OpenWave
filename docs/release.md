# Checklist de publicación de una versión

Hay dos vías: **GitHub Actions** (recomendada, compila el MSI y publica la
release) y **local** (fallback: compila en la copia Windows). La versión se
sube **siempre** con `scripts/bump-version.py`; la política está en
`AGENTS.md` y `.opencode/skills/openwave-release/references/versioning.md`.

La versión refleja la **app**: los cambios de CI, scripts de empaquetado o
documentación **no** suben versión. Se documentan en `## Interno` del
`CHANGELOG` (fuera de las notas de versión) y se publican cuando toque un
cambio real de la app.

- Repo de trabajo (WSL): `/home/jharrys/proyectos/OpenWave`.
- Copia de build Windows: `C:\Users\jharrys\Desktop\OpenWave` (sincronizada con
  `scripts/sync-windows`; allí SOLO se compila, nunca se edita).

## Vía A — GitHub Actions (recomendada)

- [ ] Gates en verde (sección 1).
- [ ] `CHANGELOG.md` con los cambios **de la app** bajo `## [Unreleased]`
      (los de CI/herramientas van en `## Interno`).
- [ ] Commit + `git push origin master`.
- [ ] `gh workflow run release.yml -f bump=patch` (o `minor`/`major`, o
      `-f version=X.Y.Z`). El workflow sube la versión, crea el commit
      `chore(release): vX.Y.Z`, empuja el tag, **compila el MSI en Windows**
      (`build-msi.yml`) y **publica la release** con el MSI y las notas.
- [ ] `git pull --ff-only` para traer el commit de versión.
- [ ] Instalar el MSI publicado y verificar:
      `powershell.exe -File scripts/install-msi.ps1 -Version X.Y.Z -Launch`.

## Vía B — local (fallback)

Se ejecuta desde WSL; la app empaquetada vive en
`C:\Users\jharrys\Desktop\OpenWave`.

## 1. Gates — todos en verde antes de tocar nada

- [ ] `npx vitest run` — suite frontend completa
- [ ] `npx eslint src` — 0 errores
- [ ] `npx prettier --check "src/**/*.{js,jsx}"`
- [ ] `npm run build`
- [ ] `backend/venv/bin/python -m pytest -q`
- [ ] `backend/venv/bin/python -m ruff check .` y `ruff format --check .`
- [ ] `cargo check --release` (en `src-tauri/`)

## 2. CHANGELOG y README

- [ ] Rellenar `## [Unreleased]` (Keep a Changelog) con los cambios de la app.
      Los de CI/herramientas/empaquetado van en `## Interno`, que **no** entra
      en las notas de versión. El bump a `## [X.Y.Z] - AAAA-MM-DD` y los enlaces
      los hace `scripts/bump-version.py`.
- [ ] Si toca, actualizar las cifras del README (tests, comprobaciones del
      verify-msi).

## 3. Versión, commit y tag

- [ ] `scripts/bump-version.py patch|minor|major` (o `X.Y.Z`).
- [ ] Commit del corte (`chore(release): vX.Y.Z`).
- [ ] `git push origin master`
- [ ] `git tag -a vX.Y.Z -m "..."` y `git push origin refs/tags/vX.Y.Z`.
      Solo se RE-CORTA un tag si la versión nunca se publicó (borrar con
      `git tag -d vX.Y.z` antes).

## 4. MSI (solo vía local)

- [ ] `scripts/sync-windows` (Windows en el mismo commit).
- [ ] Rebuild SIN `-SkipRuntime` si cambió el backend: cerrar la app y
      relanzar `package-windows.ps1` + `verify-msi.ps1` (75/75).
- [ ] Instalar con UAC (`scripts/install-msi.ps1 -MsiPath ... -Launch`), o
      `Start-Process msiexec -Verb RunAs -Wait -PassThru`), verificar el hash
      del `songs.py`/`main.py` instalado contra el repo y `GET /health` → 200.
- [ ] Anotar el sha256 del MSI para las notas de la release.

## 5. Release en GitHub

- [ ] Vía A: la crea el workflow. Vía B: `gh release create vX.Y.Z
      "build/windows/OpenWave-*.msi" --title "..." --notes-file <notas>`.
- [ ] Comprobar que la release aparece con el MSI adjunto y que el tag está
      en el remoto (`git ls-remote --tags origin`).

## Decisiones ya tomadas (no re-abrir sin motivo)

- **Versión**: se re-cortó v1.0.0 desde HEAD — el tag anterior (68b83c1)
  nunca se publicó ni existió en el remoto.
- **Licencia**: CC BY-NC 4.0 (uso no comercial). `LICENSE`,
  `docs/instalador/TERMINOS.txt` y las «Notas legales» del README deben
  decir lo mismo siempre.
- **Identificador Tauri `com.soundwave.app`**: se deja como está —
  cambiarlo mueve las rutas de datos (WebView2 y perfil) y resetearía los
  datos de las instalaciones existentes. Candidato a v2 con migración
  explícita.
- **Updater automático**: pendiente (fase 2). Por ahora la actualización es
  reinstalar el MSI nuevo por encima; los datos se conservan.
- **Permisos Tauri** (`fs:read-files` con `path: "**"`, plugin `http` sin
  uso): pendientes de endurecer en una ronda propia con verificación en
  vivo (toque real de la app instalada).
