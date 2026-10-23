# Soporte nativo de Linux

Plan de trabajo para publicar OpenWave también para Linux (`.deb` y `.AppImage`)
desde este mismo repo, sin romper el MSI de Windows ni bifurcar el código.

Estado: **propuesta**, aprobada la fase 0 en adelante por orden.

---

## 1. Objetivo y criterio de éxito

Una sola release de GitHub con tres artefactos: `OpenWave-X.Y.Z-x64-es-ES.msi`,
`OpenWave_X.Y.Z_amd64.deb` y `OpenWave_X.Y.Z_amd64.AppImage`. Mismo código, misma
versión, mismo `CHANGELOG`.

Criterio de éxito, en este orden:

1. La app arranca en Linux desde el paquete instalado (no desde el repo).
2. El backend arranca con el intérprete empaquetado, no con el `python3` del sistema.
3. Descarga, reproducción, letras, vídeo de fondo, cola y ajustes funcionan igual.
4. Los gates corren en CI y fallan ahí, no en la máquina del usuario.
5. Windows sigue publicando su MSI sin cambios en su flujo.

---

## 2. Cómo lo resuelven otros proyectos

Revisados cinco casos reales (configuración, empaquetado y CI).

| Proyecto | Qué hace | Qué tomamos |
|:--|:--|:--|
| `tauri-apps/tauri` (docs) | `tauri.linux.conf.json` / `tauri.windows.conf.json` se mezclan con `tauri.conf.json` por JSON Merge Patch. **Los arrays se reemplazan enteros**, también anidados. | Un fichero por plataforma, y mover los arrays a los ficheros de plataforma para que no haya media herencia silenciosa. |
| `clash-verge-rev/clash-verge-rev` | Su `tauri.linux.conf.json` define `targets: ["deb","rpm"]`, `deb.depends`, `desktopTemplate`, `postInstallScript` y `externalBin` con los sidecars del núcleo. | La forma del bloque `bundle.linux.deb`, y separar el sidecar del resto de resources. |
| `Stirling-Tools/Stirling-PDF` | `resources: ["libs/*.jar", "runtime/jre/**/*"]`, `targets` con las seis plataformas, iconos por tamaño en `tauri.linux.conf.json`. | Empaquetar un **runtime completo como resource** (su JRE es nuestro CPython) e iconos por tamaño. |
| `thewh1teagle/vibe` | `bundle.linux.deb.depends: ["ffmpeg", "libxdo-dev"]`: depende del sistema en vez de empaquetar. | Lo que **no** hacemos con ffmpeg (ver §5), pero sí con librerías del sistema. |
| `zhouxiaoka/autoclip` | Ruta `python-build-standalone`: descarga pineada, `src-tauri/resources/python` + `resources/backend`, y un `scripts/lib/desktop_build_common.sh` compartido por los dos entrypoints de build. | El patrón de runtime portable y el de **una implementación compartida con entrypoints finos por SO**. |

Conclusión: nadie mantiene ramas ni ficheros de código por sistema operativo. La
separación vive en (1) configuración declarativa, (2) scripts de empaquetado, (3)
unos pocos `cfg` en Rust que ya existen.

---

## 3. Auditoría del repo: qué está listo y qué no

### Ya resuelto (no hay que tocarlo)

| Pieza | Evidencia |
|:--|:--|
| Datos en XDG fuera de Windows | `backend/config.py:92` (`XDG_DATA_HOME` o `~/.local/share/OpenWave`) |
| Identidad/AUMID solo en Windows | `backend/identity.py:58` y `:128` salen con `sys.platform != "win32"` |
| Intérprete del backend por SO | `src-tauri/src/lib.rs:525` (`venv/bin/python` fuera de Windows) y `runtime/bin/python3` en `:516` |
| Separador de `PATH` por SO | `src-tauri/src/lib.rs:549` (`;` en Windows, `:` en el resto) |
| `ffmpeg`/`yt-dlp` desde el bundle | `backend/streaming.py:111` (`bin/python3` en no-Windows) |
| Icono de ventana y manifiesto MSIX | `#[cfg(windows)]` en `main.rs`, `lib.rs:366`, `build.rs:1` |
| Tests del backend en Linux | `.github/workflows/ci.yml` ya corre en `ubuntu-latest` |
| Toolchain local | `webkit2gtk-4.1`, `gtk+-3.0`, `libsoup-3.0`, `cargo 1.99`, `ffmpeg`, `gstreamer`: presentes |

### Falta

| Pieza | Detalle |
|:--|:--|
| `bundle.targets` | `["msi"]` en `tauri.conf.json` |
| `bundle.resources` | Apunta a staging de Windows: `runtime/python.exe`, `*.msix`, `*.cer`, `Assets/*.pri` |
| Bloque `bundle.linux` | `{}` vacío |
| Runtime de Python para Linux | No hay `prepare-runtime` equivalente |
| `ffmpeg` para Linux | El script actual solo baja el `.exe` |
| Script de empaquetado | Solo existe `package-windows.ps1` |
| Job de CI | `build-msi.yml` solo `windows-latest` |
| Release | `release.yml` descarga y publica únicamente el MSI |
| Gate de payload | `verify-msi.ps1` (78/78) no tiene equivalente Linux |

### Grieta real detectada (arreglo pequeño, imprescindible)

`_es_instalado()` devuelve `False` en Linux siempre:

- `backend/config.py:39` (`if not es_windows: return False`)
- `src-tauri/src/lib.rs:204` (idéntico)

Consecuencia: en una instalación Linux el directorio del código decide si es
escribible. En `.deb` (`/usr/lib/openwave`) no lo es y cae a XDG, correcto por
accidente. Pero en un AppImage extraído, en `~/Apps/OpenWave` o en una instalación
con permisos amplios, los datos acabarían junto al código. La marca correcta ya
existe: hermano `runtime/` junto a `backend/`. Hay que aceptarla también fuera de
Windows y cubrirlo con test (`backend/test_config_paths.py` ya prueba esta rama).

---

## 4. Arquitectura propuesta: tres capas

### Capa 1: configuración declarativa por plataforma

`tauri.conf.json` se queda con lo común. Todo lo que cambia por sistema se mueve a
`src-tauri/tauri.windows.conf.json` y `src-tauri/tauri.linux.conf.json`.

Regla de oro (la que evita correcciones a posteriori): **los arrays se reemplazan,
no se fusionan**. Si `resources` o `targets` viven en el fichero base y el de
plataforma solo añade uno, se pierde el resto. Por eso los arrays se declaran
completos en cada fichero de plataforma.

```json
// src-tauri/tauri.linux.conf.json
{
  "bundle": {
    "targets": ["deb", "appimage"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.png"],
    "resources": [
      "../build/staging-linux/backend",
      "../build/staging-linux/runtime",
      "../build/staging-linux/ffmpeg",
      "../LICENSE"
    ],
    "linux": {
      "deb": {
        "depends": [
          "libwebkit2gtk-4.1-0",
          "libgtk-3-0",
          "gstreamer1.0-plugins-good",
          "gstreamer1.0-libav"
        ],
        "desktopTemplate": "../packaging/linux/openwave.desktop"
      }
    }
  }
}
```

### Capa 2: un solo contrato de staging

Lo que el binario espera en tiempo de ejecución ya está escrito en el código
(`lib.rs` y `config.py`). El plan lo convierte en contrato explícito y verificado,
idéntico en las dos plataformas:

```
<resources>/
  backend/     código Python (sin tests, sin venv, sin __pycache__)
  runtime/     intérprete
               Windows: python.exe + Lib/site-packages
               Linux:   bin/python3 + lib/python3.13/site-packages
  ffmpeg/      ffmpeg (y ffprobe si hace falta)
```

Windows ya lo cumple con `scripts/prepare-runtime.ps1`. Linux lo cumple con un
`scripts/prepare-runtime.sh`, y ambos comparten las **mismas decisiones** (versión
pineada, hash SHA-256, exclusión de tests, marcador de rebuild por hash de código).

Un test nuevo (`backend/test_staging_layout.py`) verifica el contrato sobre un
staging real cuando existe, para que un cambio de layout falle en CI y no en el
usuario.

### Capa 3: arranque

Cero condicionales nuevos. Solo el arreglo de `_es_instalado` de §3 en los dos
sitios (Python y Rust), con su test.

---

## 5. Rutas descartadas (y por qué)

| Opción | Por qué no |
|:--|:--|
| Depender del `python3` del sistema | Rompe en distros con 3.9, en entornos con venv activo y dentro de AppImage; la app ya asume una versión y unas ruedas concretas. |
| `PyInstaller` / `Nuitka` | Cambia el modelo de arranque: `lib.rs` lanza `python main.py` y `backend` se descubre por layout. Habría que reescribir detección, logs y migración de datos. Mucho riesgo para cero ganancia. |
| Depender del `ffmpeg` del sistema | Variabilidad de códecs entre distros (H.264/opus) y versiones. Ya hay binario pineado y verificado. |
| Rama o fork por sistema | Duplica mantenimiento y desincroniza features. |
| Scripts de build duplicados | Divergen con el tiempo (ver `autoclip`: comparten implementación en `scripts/lib/`). |
| `if plataforma` repartido por el código | Solo donde ya existen; el resto se resuelve en configuración o en empaquetado. |

---

## 6. Estructura objetivo de ficheros

```
src-tauri/
  tauri.conf.json                 común (arrays de plataforma fuera)
  tauri.windows.conf.json         NUEVO: msi, resources, wix, msix
  tauri.linux.conf.json           NUEVO: deb, appimage, resources, linux
scripts/
  prepare-runtime.ps1             Windows (sin cambios de comportamiento)
  prepare-runtime.sh              NUEVO: mismo contrato, python-build-standalone
  package-linux.sh                NUEVO: staging + tauri build + smoke
  verify-linux.sh                 NUEVO: gate del payload (par de verify-msi.ps1)
  lib/runtime-common.sh           NUEVO: descargas pinadas, hash, limpieza
packaging/linux/
  openwave.desktop                NUEVO: plantilla de escritorio
  postinst.sh                     NUEVO (si hace falta: iconos, MIME)
.github/workflows/
  build-msi.yml                   intacto
  build-linux.yml                 NUEVO: deb + AppImage en ubuntu-22.04
  release.yml                     MOD: descarga y publica ambos
backend/
  config.py                       MOD: `_es_instalado` acepta marca `runtime/`
  test_config_paths.py            MOD: caso Linux instalado
src-tauri/src/lib.rs              MOD: mismo criterio que config.py
docs/linux.md                     este documento
```

---

## 7. Fases, con gate por fase

Cada fase deja los gates de `AGENTS.md` en verde y se commitea por separado.

### Fase 0: ensayo en caliente (1 a 2 h)

`npm run tauri dev` en Linux, sin empaquetar nada, con checklist:

1. Ventana abre con tamaño, posición y barra de título correctas.
2. Arrastrar por `data-tauri-drag-region` funciona (X11 y Wayland).
3. Minimizar, maximizar, cerrar.
4. Cristal (`backdrop-filter`) visible en player bar, sidebar y modales.
5. `color-mix()` y acento dinámico correctos (portada con color).
6. Letras: resaltado, tracking, transición de peso y glow.
7. Vídeo de fondo: reproduce, se pausa con overlay, se detiene al cerrar.
8. Descarga una canción y verifica `exists() ⇒ COMPLETO`.
9. Cola, crossfade y radio.
10. Ajustes: tema, acento, espacio de trabajo.
11. Sin errores en consola del webview ni en `backend.err.log`.
12. Consumo de GPU con las letras abiertas (comparar con la tabla de `docs/PERFORMANCE.md`).

**Gate:** informe corto con los 12 puntos y capturas de lo que falle. Decide si
las fases 3 y 4 son arreglos menores o trabajo de días.

### Fase 1: configuración y bundle vacío (0,5 a 1 día)

Crear `tauri.windows.conf.json` (moviendo arrays desde el base sin cambiar
contenido), `tauri.linux.conf.json`, plantilla `.desktop` e iconos.
Compilar `tauri build --bundles deb,appimage` con staging vacío.

**Gate:** el `.deb` y el `.AppImage` se generan, instalan y la ventana abre (el
backend fallará todavía, es lo esperado en esta fase).

### Fase 2: runtime y backend (1 a 2 días)

`scripts/prepare-runtime.sh`: descarga pineada de `python-build-standalone`
(x86_64-unknown-linux-gnu, glibc 2.28+), `pip install -r backend/requirements.txt`
en ese intérprete, `ffmpeg` estático, copia de `backend/` sin tests.
Arreglo de `_es_instalado` en `config.py` y `lib.rs` + tests.
Primer arranque real desde el paquete instalado.

**Gate:** desde el `.deb` instalado, `/health` responde, `/search` devuelve datos,
la app lista los `trending` y una descarga produce un MP3 completo. Sin usar el
Python del sistema (verificado con `ps` y con `sys.executable`).

### Fase 3: paridad visual y rendimiento (1 a 2 días)

Resolver lo que salga de la fase 0: dosis de blur, `will-change`, vídeo si
GStreamer no reproduce H.264, fuentes, scrollbars, foco y atajos. Re-medir el
presupuesto de GPU con la metodología de `PERFORMANCE.md` y anotar los números de
Linux junto a los de Windows.

**Gate:** el checklist de la fase 0 pasa completo, sin regresión en Windows
(build y tests siguen verdes).

### Fase 4: CI y release (0,5 a 1 día)

`build-linux.yml` reutilizable con `ubuntu-22.04` (glibc vieja, compatibilidad
hacia adelante), cache de Rust y npm, y `verify-linux.sh` como gate: instala el
`.deb` en un contenedor limpio, lanza con `xvfb`, comprueba `/health` y hace
`ldd` sobre el binario para detectar librerías que falten.
`release.yml`: job `build-linux` en paralelo a `build`, descarga los artefactos y
publica ambos con las notas divididas por plataforma.

**Gate:** workflow `dry_run` produce los tres artefactos; una release de prueba
`vX.Y.Z-rc1` (tag en borrador) los adjunta y el `.deb` instala en contenedor
limpio.

### Fase 5: cierre (2 h)

`README` (requisitos y descarga por plataforma), `docs/release.md` (nuevo flujo),
`AGENTS.md` (comandos Linux), `CHANGELOG` con la entrada de versión MINOR, y
release real.

**Gate:** `gh release view` lista los tres artefactos; el `.deb` instala en una
máquina limpia y la app funciona.

---

## 8. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|:--|:--|:--|:--|
| WebKitGTK no rinde con tantos `backdrop-filter` (iGPU) | Media | Alto | Fase 0 mide antes de empaquetar; presupuesto de GPU ya documentado; dosis por CSS, sin tocar lógica. |
| H.264 del vídeo de fondo requiere GStreamer extra | Alta | Medio | Declarar `gstreamer1.0-libav` y `plugins-good` en `deb.depends`; en AppImage, verificar y documentar. Si no hay códec, degradar a portada con aviso (ya existe la píldora de error). |
| `python-build-standalone` incompatible con alguna distro (glibc) | Baja | Alto | Pinear `x86_64-unknown-linux-gnu` con glibc ≤ 2.28, compilar en 22.04, `ldd` en el gate. |
| AppImage y FUSE en el usuario final | Media | Bajo | `.deb` como vía principal; AppImage como alternativa documentada (`--appimage-extract-and-run`). |
| Wayland: arrastre, snap y posición de ventana | Media | Bajo | Probar en X11 y Wayland en fase 0; fallback documentado. |
| `MediaSession`/SMTC no existe en WebKitGTK | Alta | Bajo | Ya se degrada por feature detection; MPRIS queda como mejora futura, fuera de alcance. |
| Regresión en el MSI por mover arrays de config | Media | Alto | Fase 1 es un movimiento mecánico con `verify-msi` como gate y un build seco de Windows antes de mergear. |
| Divergencia de los dos `prepare-runtime` | Media | Medio | Mismo contrato en §4, test de layout, y mismas versiones pineadas; unificarlos es opcional después. |

---

## 9. Decisiones que evitan el "corregir a cada rato"

1. **Nada de herencia parcial de arrays**: si un array es de plataforma, se declara
   completo en el fichero de plataforma.
2. **Un contrato de staging, verificado por test**, no por memoria.
3. **Windows se toca lo mínimo**: fases 1 a 3 son aditivas y `verify-msi` es el
   gate de no regresión.
4. **El gate de Linux vive en CI**, en contenedor limpio, no en la máquina del dev.
5. **Versiones y hashes pineados** igual que hoy en Windows; nada de `latest`.
6. **Sin `if` nuevos por sistema**: si aparece uno, es señal de que algo va en la
   capa equivocada.
7. **Commits pequeños por fase** con su gate, para poder revertir una fase sin
   arrastrar las demás.

---

## 10. Fuera de alcance

- `rpm`, Flatpak y Snap (se pueden añadir después con el mismo staging).
- ARM64 / aarch64 (requiere otro binario de runtime y otro `ffmpeg`).
- MPRIS (integración con el reproductor del escritorio).
- Auto-update en Linux (hoy no existe en ninguna plataforma).
- Firmado criptográfico del `.deb`/AppImage.

---

## 11. Estimación

| Fase | Estimación |
|:--|:--|
| 0. Ensayo en dev | 1 a 2 h |
| 1. Config y bundle | 0,5 a 1 día |
| 2. Runtime y backend | 1 a 2 días |
| 3. Paridad visual | 1 a 2 días |
| 4. CI y release | 0,5 a 1 día |
| 5. Cierre | 2 h |
| **Total** | **3 a 6 días** |

El rango lo decide la fase 0: si el cristal y el vídeo se comportan, es un
empaquetado; si no, hay trabajo de render.
