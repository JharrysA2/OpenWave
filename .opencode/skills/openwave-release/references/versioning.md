# Política de versionado de OpenWave

Versionado semántico (`MAJOR.MINOR.PATCH`), adaptado al ritmo del proyecto.

| Tipo de cambio | Subida | Antes → Después |
| --- | --- | --- |
| Función nueva, mejora o arreglo **grande** | MINOR | `1.0.1 → 1.1.0` |
| Arreglo o mejora **pequeña** | PATCH | `1.0.1 → 1.0.2` |
| Cambio **incompatible** o migración de datos | MAJOR | `1.1.0 → 2.0.0` |

## Cómo decidir

- ¿Añade algo que el usuario percibe como nuevo, o arregla un fallo de fondo?
  → **MINOR**.
- ¿Es un retoque, un texto, un caso borde, un ajuste menor? → **PATCH**.
- ¿Rompe compatibilidad (rutas de datos, formato de BD, identificador)?
  → **MAJOR** (y planifica migración).
- **En la duda, PATCH.**

## Reglas

- La versión se sube **solo** con `scripts/bump-version.py patch|minor|major`
  (o `... X.Y.Z`). Nunca a mano.
- El script actualiza: `package.json`, `package-lock.json` (x2),
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
  `packaging/arch/PKGBUILD` y
  `CHANGELOG.md` (mueve `[Unreleased]` a `[X.Y.Z] - fecha` y ajusta enlaces).
- El commit del corte es `chore(release): vX.Y.Z`.
- El tag es `vX.Y.Z` (anotado). Un tag solo se re-corta si la versión **nunca**
  llegó a publicarse.
- El identificador Tauri (`com.soundwave.app`) **no** se toca: cambiarlo mueve
  las rutas de datos (WebView2 y perfil) y resetearía instalaciones existentes.

## Ejemplo

```
1.0.1  "Para ti" como Mix real de YouTube Music      (MINOR -> 1.1.0)
1.0.2  Arreglo de un texto o de un caso borde        (PATCH -> 1.0.2)
2.0.0  Migración de la base de datos                 (MAJOR -> 2.0.0)
```
