# Soporte nativo de Linux

Plan de trabajo para publicar OpenWave también para Linux (`.deb` y `.AppImage`)
desde este mismo repo, sin romper el MSI de Windows ni bifurcar el código.

Estado: **fases 1 y 2 ejecutadas**. El `.deb` se compila en Linux y arranca con
su propio intérprete (`runtime/bin/python3`), con backend, descarga y ffmpeg
propios; el `.AppImage` también se genera en local (§12) y los tres artefactos
Linux + el MSI conviven en la misma release. Pendiente: paridad visual medida,
CI de Linux y recorte de tamaño (ver §12).

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
  openwave                NUEVO: mando `openwave` (arranque + cierre de terminal)
  openwave.desktop        NUEVO: plantilla de escritorio (Handlebars)
packaging/arch/
  PKGBUILD                NUEVO: paquete nativo de Arch (.pkg.tar.zst)
  openwave.install        NUEVO: actualiza la caché de iconos de hicolor
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
8. **`resources` con mapa explícito**, nunca lista. Con una lista, Tauri aplanó
   `../build/staging-linux/backend` en `_up_/build/staging-linux/backend` y el
   arranque no encontraba `backend/`. La forma `{"origen": "destino"}` fija el
   layout, que es justo el contrato de §4.

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

---

## 12. Estado de ejecución

Hecho y verificado en Linux (x86_64, sin tocar el flujo de Windows):

- [x] `tauri.conf.json` sin arrays de plataforma; `tauri.windows.conf.json` con
      `targets`, `licenseFile`, `resources` y `windows` (config resuelta de
      Windows idéntica a la anterior, comparada con el merge de RFC 7396).
- [x] `tauri.linux.conf.json` con `deb`/`appimage`, mapa de `resources` y
      `depends` de GStreamer.
- [x] `scripts/prepare-runtime.sh`: CPython 3.14.9 portable (hash pineado),
      `requirements-runtime.txt`, ffmpeg 8.1 estático pineado, staging
      idempotente con marcador. El recorte incluye `tkinter`, `_tkinter.so` y
      las extensiones Tcl (`tcl9*`, `tk9.0`, `itcl*`, `thread3*`): la app no
      usa Tk y `linuxdeploy` persigue esas dependencias al hacer el AppImage
      (`Could not find dependency: libtcl9tk9.0.so`, porque el portátil no
      trae `libtcl9*.so`).
- [x] `_es_instalado` acepta la marca `runtime/` fuera de Windows
      (`config.py`, `lib.rs`) con tres tests nuevos (682 pasan).
- [x] `.deb` de 218 MB compilado, con `usr/lib/OpenWave/{backend,runtime,ffmpeg}`.
- [x] `.AppImage` de 241 MB compilado en local (mismo AppDir que el `.deb`).
  Dos particularidades al construirlo en Arch/CachyOS:
  - **`NO_STRIP=1`**: `linuxdeploy` usa el `strip` de su propio payload
    (binutils de 2024) que no entiende las secciones `.relr.dyn`
    (`SHT_RELR`) que llevan las librerías actuales del sistema
    (`libxml2.so.16`, `libzstd.so.1`…), y aborta con `Strip call failed:
    unknown type [0x13]`. La variable `NO_STRIP` (reconocida por linuxdeploy,
    ver `src/core/appdir.cpp`) desactiva ese paso; el precio es un binario
    algo más gordo.
  - **El `AppDir` no se limpia entre pasadas**: si quedó de un intento
    anterior (`target/release/bundle/appimage/`, y la copia obsoleta de
    `target/release/_up_/` que alimenta el `.deb` intermedio), sigue
    arrastrando los ficheros que ya se recortaron del staging. Borra esos
    directorios antes de reintentar.
- [x] App instalada desde ese layout: backend levantado por la app con
      `OpenWave/runtime/bin/python3`, `/health` ok, 56 rutas, warmup real.
- [x] Descarga completa con el runtime empaquetado: MP3 192 kb/s válido, portada
      y `.lrc` guardados, ffmpeg del paquete.
- [x] Entrada de escritorio: `packaging/linux/openwave.desktop` como
      `desktopTemplate` del `.deb` (categorías `Audio;AudioVideo;Music;Player;`,
      keywords y textos en español; `desktop-file-validate` limpio) y también
      dentro del paquete de Arch.
- [x] Mando `openwave` en `/usr/bin/openwave`: arranca con `setsid -f` en
      sesión propia, comprueba que el proceso existe (si no, no cierra nada y
      enseña las últimas líneas de `<datos>/app.err.log`) y entonces **cierra
      la terminal** que lo pidió, matando el shell que la mandaba si es un
      shell (nunca a un lanzador ni a systemd). Con la app ya abierta no
      abre otra ventana: la trae al frente con
      `hyprctl dispatch focuswindow class:OpenWave`. `--keep` deja la
      terminal abierta. El log de arranque sigue en `<datos>/app.err.log`
      (mismo orden de directorio de datos que `backend/config.py`:
      `OPENWAVE_DATA_DIR`, `XDG_DATA_HOME`, `~/.local/share`). Verificado con
      el payload del `.pkg.tar.zst` desempaquetado: arranque + cierre, enfoque
      de la ventana abierta, fallo de arranque sin cerrar y `/health` ok.
- [x] Paquete nativo de Arch: `packaging/arch/PKGBUILD` +
      `scripts/package-arch.sh` → `openwave-<versión>-x86_64.pkg.tar.zst`
      (132 MB) con dependencias en nombres de Arch (`webkit2gtk-4.1`,
      `gst-plugins-good`, `gst-libav`…), `.install` que refresca la caché de
      iconos y `pkgver` enganchado a `scripts/bump-version.py`. Va con
      `options=(!strip)`: el `strip` de makepkg rompe el Python pineado
      (aviso `.dynstr` y después `symbol lookup error`), así que el payload
      es el mismo que el del `.deb`, que ya funciona.

Pendiente, en este orden:

- [ ] Fase 0 con ventana real: cristal, `color-mix`, vídeo de fondo, letras y
      arrastre en X11 y Wayland (requiere sesión gráfica).
- [ ] Prueba del `.deb` y del `.AppImage` en contenedor limpio (el AppImage ya
      se genera y extrae con su `AppRun`, su `.desktop` y el binario con el
      bundle embebido; falta verificarlo en un sistema sin nuestras
      dependencias y con `--appimage-extract-and-run` si no hay FUSE).
- [ ] `verify-linux.sh` como gate de CI y `build-linux.yml` en `ubuntu-22.04`.
- [ ] Subir los tres artefactos de Linux desde `release.yml` (hoy la release
      sale con el MSI y los de Linux se adjuntan a mano con `gh release upload`,
      probado en la v1.2.0).
- [ ] Recorte de tamaño: el runtime quedó en 269 MB (libpython sin símbolos) y
      ffmpeg en 165 MB (ya sin símbolos; es el build estático completo).
      Alternativas: build de ffmpeg con solo los códecs que usa la app, o el
      paquete `-shared` con sus `.so`.

---

## 13. Parpadeo, frames negros y «Inicio encima de Letras» (Linux)

Síntomas vistos en Linux: al abrir la pantalla de Letras o cualquier modal, el
contenido de Inicio se superpone por encima un instante (como si se recargara
todo), y en los cambios de pantalla aparecen frames negros o con basura de
memoria. Son **dos problemas distintos** con causas distintas.

### A. «Inicio encima de Letras» → regresión del compositor Skia (WebKIT 2.54)

**Causa raíz**: regresión upstream de WebKitGTK 2.52.6 → 2.54.1 en el compositor
de capas Skia: al montar un overlay con transiciones de opacidad pierde frames
y muestra el contenido de detrás (los frames glitchados muestran el valor
INICIAL de la transición, con lo que se ve la pantalla de antes de abrir el
overlay). No es el CSS de la app (el stacking está correcto: Letras `z-index:
200`, player por encima por diseño) ni Hyprland.

Fuentes: WebKit **#327524** (REGRESSION 2.52.6→2.54.1, con vídeo del diálogo
parpadeando) y **#326841**; un usuario con **el mismo paquete Arch
`webkit2gtk-4.1 2.54.1-1` + Hyprland 0.56.2 + Tauri** documentó el síntoma
«el scrim desaparece 1-2 frames justo al terminar la transición y se ve el
brillo de ANTES de abrir» y confirmó la solución; también issue Handy #2166
(matriz de configs NVIDIA 615.78.08 + webkit 2.54.1).

Evidencia propia: captura de la ventana con `grim` a ~55 fps mientras la persona
abre/cierra Letras; los frames glitchados son **mixtos** (cola de Letras a la
izquierda + contenido de Inicio a la derecha), es decir, el compositor de
WebKit monta un frame con actualizaciones parciales y antigua.

**Fix**: `WEBKIT_USE_SKIA_FOR_COMPOSITION=0` — vuelve al compositor anterior
**sin perder aceleración por hardware** (reportes: «flicker completely gone»).
Aplica a **cualquier GPU** (la regresión no es de NVIDIA); en WebKitGTK
anteriores la variable no existe y se ignora.

Alternativas documentadas si alguna vez no bastara: `WEBKIT_DISABLE_DMABUF_ATLAS=1`
y desactualizar a webkit 2.52.6. `WEBKIT_DISABLE_COMPOSITING_MODE=1` es el
último recurso: en 2.54 ya no aporta (un usuario con NVIDIA reportó «nothing
changed») y quita la ruta rápida de blur.

**Lo que NO funciona** (medido): `WEBKIT_DISABLE_DMABUF_RENDERER=1` quita el
parpadeo pero obliga a WebKit a la ruta sin aceleración y la app va lenta —
así lo reportan el propio bug #327524 y las pruebas en este equipo. Por eso en
Wayland **nunca se desactiva el renderer DMABUF**.

### B. Frames negros o con basura al cambiar de pantalla (solo NVIDIA)

**Causa**: la presentación de WebKitGTK con el driver NVIDIA. El renderer
DMABUF incumple la regla de acquire-point de los compositores Wayland
(Hyprland mata al cliente con «Error 71») y su ruta EGL/GBM con NVIDIA puede
hacer SIGSEGV; el sync explícito intermitente deja buffers sin inicializar,
que el compositor muestra tal cual (frames negros o basura). Fuentes:
`webkit2gtk-nvidia-quirk`, tauri-apps/tauri#10702 y #9304, WebKit #280210 y la
documentación de Yaak.

**Fix**: `__NV_DISABLE_EXPLICIT_SYNC=1` solo con GPU NVIDIA + Wayland — mató
los frames negros (311 → 0 en pruebas de 150–200 s) sin tocar el rendimiento.
En X11 con NVIDIA, `WEBKIT_DISABLE_DMABUF_RENDERER=1` (ventana en blanco,
orden oficial de Tauri).

### Variables aplicadas por `main.rs`

Se fijan antes de crear la ventana, para que el `WebKitWebProcess` herede el
entorno, **solo si la persona no ha fijado ya la variable** (su configuración
manda):

| Entorno | Variables aplicadas |
|:--|:--|
| Linux (cualquier GPU) | `WEBKIT_USE_SKIA_FOR_COMPOSITION=0` |
| NVIDIA + Wayland | + `__NV_DISABLE_EXPLICIT_SYNC=1` |
| NVIDIA + X11 | + `WEBKIT_DISABLE_DMABUF_RENDERER=1` |

La detección de NVIDIA lee `/sys/class/drm` (vendor `0x10de` o driver `nvidia`)
y el backend de sesión (`GDK_BACKEND` → `XDG_SESSION_TYPE` → `WAYLAND_DISPLAY` /
`DISPLAY`).

**Verificación**: capturas con `grim` a ~55 fps sobre la ventana y análisis de
frames (negros = brillo medio < 2; «Inicio encima de Letras» = frames mixtos
con la barra lateral/contenido de Inicio dentro del overlay de Letras).
