---
name: OpenWave Release
description: Publicar una versión de OpenWave — verificación previa, subida de versión (SemVer), commit/push, compilar el MSI y crear la release en GitHub. Úsala cuando haya que sacar una versión nueva, construir/instalar el MSI, subir la versión o publicar en GitHub.
---

# Publicar una versión de OpenWave

Procedimiento para cortar, construir y publicar una versión. La fuente de
verdad del flujo es `docs/release.md`; aquí está el atajo operativo. La
memoria del proyecto vive en `AGENTS.md` (política de versionado incluida).

## Regla de oro

**Antes de nada, decide la subida de versión** según `references/versioning.md`:

| Cambio | Subida | Ejemplo |
| --- | --- | --- |
| Mejora/arreglo grande o función nueva | MINOR | `1.0.1 → 1.1.0` |
| Arreglo/mejora pequeña | PATCH | `1.0.1 → 1.0.2` |
| Cambio incompatible / migración | MAJOR | `1.1.0 → 2.0.0` |

En la duda, **PATCH**. No subas la versión a mano: usa `scripts/bump-version.py`.

## Pasos

1. **Gates en verde** (si algo falla, se arregla antes de seguir):
   ```bash
   npx vitest run && npx eslint src && npx prettier --check "src/**/*.{js,jsx}" && npm run build
   cd backend && ../backend/venv/bin/python -m pytest -q && \
     ../backend/venv/bin/python -m ruff check . && ../backend/venv/bin/python -m ruff format --check .
   ```
2. **CHANGELOG**: asegúrate de que `CHANGELOG.md` tiene el contenido pendiente
   bajo `## [Unreleased]` (qué cambió y por qué).
3. **Commit + push** del trabajo: `git push origin master`.
4. **Publica la versión**. Elige una vía:

   **A) GitHub Actions (recomendado)** — el MSI se construye en Windows y se
   publica la release automáticamente:
   ```bash
   gh workflow run release.yml -f bump=minor      # o patch / major
   # o versión exacta:
   gh workflow run release.yml -f version=1.2.3
   gh run watch                                    # seguir el build
   git pull --ff-only                              # traer el commit chore(release)
   ```
   Luego instala el MSI publicado y verifica:
   ```bash
   powershell.exe -File scripts/install-msi.ps1 -Version X.Y.Z -Launch
   ```

   **B) Local (fallback)**:
   ```bash
   scripts/bump-version.py patch
   git add -A && git commit -m "chore(release): vX.Y.Z"
   git push origin master
   git tag -a vX.Y.Z -m "OpenWave vX.Y.Z" && git push origin vX.Y.Z
   ```
   (el `push` del tag dispara el workflow de release).
   Para construir el MSI en local: `scripts/sync-windows` y después
   `package-windows.ps1 -NoOpen` en la copia Windows (ver más abajo).

5. **Verifica**: release con el MSI adjunto, tag en el remoto, `/health` → 200
   y `/home/for-you` respondiendo tras instalar.

## Compilar el MSI en local (copia Windows)

Solo si no se usa Actions para el MSI:

```bash
scripts/sync-windows     # C:\Users\jharrys\Desktop\OpenWave alineado con master
```

Cierra la app (libera el puerto **8765**) y compila:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  'C:\Users\jharrys\Desktop\OpenWave\scripts\package-windows.ps1' -NoOpen
```

- **No uses `-SkipRuntime`** si cambió el backend (hay que reempaquetar).
- `package-windows.ps1` ejecuta `verify-msi.ps1` al final: debe dar **75/75**.
- El MSI queda en `build\windows\OpenWave-<version>-x64-es-ES.msi`.

Subida manual de la release (si hiciera falta):

```bash
gh release create vX.Y.Z "build/windows/OpenWave-X.Y.Z-x64-es-ES.msi" \
  --title "OpenWave vX.Y.Z" --notes-file <notas>
```

## Errores frecuentes

- **MSI viejo tras el build**: faltó reconstruir el staging; no uses
  `-SkipRuntime` cuando cambie `backend/`.
- **`prepare-runtime` aborta**: el puerto **8765** está ocupado; cierra la app
  (`OpenWave.exe` y su `python.exe`) antes de compilar.
- **Version desincronizada**: no edites versiones a mano; usa
  `scripts/bump-version.py` (toca los 6 ficheros + CHANGELOG).
- **Nunca edites** `C:\Users\jharrys\Desktop\OpenWave`: es solo build; los
  cambios van a este repo y se sincronizan con `scripts/sync-windows`.

## Referencias

- `references/versioning.md` — política de versionado con ejemplos.
- `docs/release.md` — checklist original completa.
- `AGENTS.md` — memoria del proyecto y comandos.
