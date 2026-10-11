# Checklist de publicación de una versión

Proceso manual (no hay workflow automático de release). Se ejecuta desde WSL
en `/home/jharrys/proyectos/OpenWave`; la app empaquetada vive en
`C:\Users\jharrys\Desktop\OpenWave` (clone sincronizado con
`scripts/sync-windows`, allí SOLO se hace build, nunca se edita).

## 1. Gates — todos en verde antes de tocar nada

- [ ] `npx vitest run` — suite frontend completa
- [ ] `npx eslint src` — 0 errores
- [ ] `npx prettier --check "src/**/*.{js,jsx}"`
- [ ] `npm run build`
- [ ] `backend/venv/bin/python -m pytest -q`
- [ ] `backend/venv/bin/python -m ruff check .` y `ruff format --check .`
- [ ] `cargo check --release` (en `src-tauri/`)

## 2. CHANGELOG y README

- [ ] Mover el contenido de `[Unreleased]` a la sección nueva
      `## [X.Y.Z] - AAAA-MM-DD` (Keep a Changelog) y dejar `[Unreleased]`
      vacío.
- [ ] Si toca, actualizar las cifras del README (tests, comprobaciones del
      verify-msi).

## 3. Commit y tag

- [ ] Commit del corte (`chore(release): vX.Y.Z`).
- [ ] `git push origin master`
- [ ] `git tag -a vX.Y.Z -m "..."` y `git push origin refs/tags/vX.Y.Z`.
      Solo se RE-CORTA un tag si la versión nunca se publicó (borrar con
      `git tag -d vX.Y.z` antes).

## 4. MSI

- [ ] `scripts/sync-windows` (Windows en el mismo commit).
- [ ] Rebuild SIN `-SkipRuntime` si cambió el backend: cerrar la app y
      relanzar `package-windows.ps1` + `verify-msi.ps1` (75/75).
- [ ] Instalar con UAC (`Start-Process msiexec -Verb RunAs -Wait -PassThru`),
      verificar el hash del `songs.py`/`main.py` instalado contra el repo y
      `GET /health` → 200.
- [ ] Anotar el sha256 del MSI para las notas de la release.

## 5. Release en GitHub

- [ ] `gh release create vX.Y.Z "build/windows/OpenWave-*.msi" --title "..." --notes-file <notas>`
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
