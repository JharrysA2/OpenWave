# 📦 Instalador MSI de SoundWave

Instalador de Windows en español (es-ES) con flujo **«siguiente, siguiente,
siguiente»**: aceptación de licencia, selector de carpeta con `Browse`,
accesos directos configurables e inicio con Windows.

El instalador lleva **todo dentro**: la app Tauri, el backend Python con todas
sus dependencias (Python embebido, sin instalar nada en el sistema) y
`ffmpeg.exe` (necesario para descargar MP3 y para la reproducción en calidad
«Baja»).

---

## 🔨 Cómo se construye

Solo en Windows (el Python embebido es de amd64). Una sola vez, en la raíz
del repositorio:

```powershell
npm install
```

Y para cada build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-windows.ps1
```

Sale en `build\windows\SoundWave-<versión>-x64-es-ES.msi` (y el MSI «crudo»
de Tauri sigue quedando en `src-tauri\target\release\bundle\msi\`).

Desde WSL se puede disparar todo sin cambiar de terminal (la copia de trabajo
de Windows es un clone cuyo remoto `local` apunta a este repo):

```bash
scripts/sync-windows                    # lleva HEAD de aquí a Windows
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File 'C:\Users\jharrys\Desktop\OpenWave\scripts\package-windows.ps1'
```

### Pasos sueltos (si no se quiere el script completo)

| Paso | Script | Qué hace |
|------|--------|----------|
| 1 | `scripts/generate-license.ps1` | `build/windows/licencia.txt` + `licencia.rtf` |
| 2 | `scripts/prepare-runtime.ps1` | `build/staging/{backend,runtime,ffmpeg}` |
| 3 | `npx tauri build --bundles msi` | Compila y enlaza el MSI |

`prepare-runtime.ps1` es idempotente: deja `build/staging/.ready` y solo se
vuelve a ejecutar si cambia `backend/requirements-runtime.txt` o con `-Force`.

> **Obligatorio**: `tauri build` falla si `build/staging` no existe, porque
> `bundle.resources` en `tauri.conf.json` apunta ahí. Por eso el paso 2 no se
> puede saltar en un repo nuevo. Lo mismo vale para `cargo check` y
> `tauri dev` (el `build.rs` de Tauri valida esos paths): en desarrollo basta
> con crear los directorios vacíos
> (`mkdir -p build/staging/{backend,runtime,ffmpeg}` en Linux/WSL,
> `New-Item -ItemType Directory -Force build\staging\{backend,runtime,ffmpeg}`
> en Windows); el contenido solo lo necesita el empaquetado.

### Descargas con hash

`prepare-runtime.ps1` baja todo a `build/cache` y verifica SHA-256 contra los
pines del propio script:

| Recurso | Versión | Pinned por |
|---------|---------|-----------|
| Python embeddable | 3.14.7 | `d297e5ff…` |
| ffmpeg (gyan.dev) | 9.0.2 | `60f46726…` |
| `requirements-runtime.txt` | cierre transitivo completo | pines exactos |
| `get-pip.py` | — | única descarga sin hash (solo arranca pip y se desinstala; se registra su hash en el marcador) |

Si un proveedor publica una versión nueva, el script **falla a propósito**
con el hash esperado y el obtenido para que se actualice el pin.

---

## 🗂️ Qué toca cada fichero

| Fichero | Papel |
|---------|-------|
| `src-tauri/tauri.conf.json` | `targets: ["msi"]`, `wix.template`, `wix.language`, `licenseFile` |
| `src-tauri/windows/main.wxs` | Plantilla WiX: diálogo **OptionsDlg**, accesos directos, clave de inicio, limpieza de INSTALLDIR |
| `src-tauri/windows/es-ES.wxl` | Strings propios en español (Tauri + OptionsDlg); el resto lo aporta WixUIExtension |
| `docs/instalador/TERMINOS.txt` | Términos en español (se muestran antes de la GPL) |
| `LICENSE` | GPL-3.0-or-later |
| `scripts/generate-license.ps1` | Compone ambos textos en `build/windows/licencia.txt` |
| `scripts/prepare-runtime.ps1` | Python embebido + deps + ffmpeg → `build/staging/` |
| `scripts/package-windows.ps1` | Orquesta todo y renombra el MSI |

### Estructura instalada

```
C:\Program Files\SoundWave\
├── SoundWave.exe
├── LICENSE
├── backend\            ← solo código .py (sin tests ni cachés)
├── runtime\            ← python.exe + Lib\site-packages (sin pip)
└── ffmpeg\ffmpeg.exe
```

Los datos **nunca** van en `Program Files`, sino en
`%LOCALAPPDATA%\SoundWave` (descargas, cubiertos, letras, caché de stream,
base de datos y log), así la app funciona sin privilegios y sobrevive a
desinstalar/reinstalar.

---

## ⚙️ Decisiones que no son evidentes

- **`licencia.txt`, no `licencia.rtf`.** Tauri convierte el fichero de
  `bundle.licenseFile` a RTF con un envoltorio propio (`\par` por cada salto
  de línea). Su atajo «usar el .rtf tal cual» usa `Path::ends_with(".rtf")`,
  que compara **componentes de ruta** y no extensiones: nunca coincide con un
  fichero llamado `licencia.rtf`, y meter un RTF completo dentro del envoltorio
  dejaría dos cabeceras `{\rtf1…` anidadas con resultado impredecible. Por eso
  el generador emite un **fragmento escapado en ASCII puro** (`á` → `\u225?`)
  que Tauri envuelve correctamente y que se ve bien en cualquier configuración
  regional. `licencia.rtf` solo se genera para revisión humana (doble clic).

- **Las casillas del OptionsDlg escriben `ADDLOCAL`/`REMOVE`.** Las condiciones
  sobre `<Feature>` se evalúan en `CostFinalize`, **antes** de que se muestre
  ningún diálogo, así que sirven para el valor por defecto pero no para decidir
  desde la UI. El patrón correcto es publicar los eventos `AddLocal`/`Remove`
  en `OptionsDlg.Next` con `Order` 1-6 y el `NewDialog` con `Order` 10 (de
  varios `NewDialog` del mismo control solo se publica el de mayor orden).

- **El flujo se salta `VerifyReadyDlg` como destino de InstallDirDlg** con un
  `NewDialog Order="5"` que pisa al `Order="4"` de WixUI_InstallDir, manteniendo
  la misma condición de validación de ruta.

- **Inicio con Windows = clave HKCU `...\Run`** (`CMP_StartupRun`), no un atajo
  en la carpeta de Inicio: en un paquete `perMachine` esa carpeta es de todos
  los usuarios y daría problemas de ICE.

- **`RemoveFolder` de INSTALLDIR vive en el componente `Path`** (el `.exe`, que
  se instala siempre), no en el de accesos directos, para que la carpeta se
  limpie aunque el usuario desmarque el Menú Inicio.

- **`INSTALL_STARTUP` empieza vacío** (desmarcado por defecto);
  `INSTALL_STARTMENU` y `INSTALL_DESKTOP` vienen con `1`.

---

## ✅ Checklist de aceptación

Compilar, **cerrar la app si está abierta** y ejecutar el MSI.

### Asistente

1. Doble clic en el MSI → diálogo de Control de cuentas de usuario (Sí).
2. **Bienvenida** en español.
3. **Términos y licencia**: aparece `TERMINOS.txt` y después la GPL en español;
   el botón «Siguiente» está **deshabilitado** hasta marcar «Acepto los
   términos».
4. **Carpeta de destino**: `C:\Program Files\SoundWave`, con botón
   `Examinar...` que abre el diálogo de selección de carpeta.
5. **Opciones de instalación**: tres casillas
   - [x] Crear un acceso directo en el menú inicio
   - [x] Crear un acceso directo en el escritorio
   - [ ] Iniciar SoundWave con Windows  ← **desmarcado por defecto**
6. **Listo para instalar** → «Instalar» (barra de progreso).
7. **Finalizar**: casilla «Iniciar SoundWave al terminar la instalación»
   marcada por defecto.

### Post-instalación

8. La app arranca y la ventana carga sin errores de backend.
9. Accesos directos creados en el escritorio y en
   `Inicio ▸ SoundWave`, ambos apuntando al `.exe` instalado.
10. Con la tercera casilla marcada: aparece
    `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\SoundWave` y la app
    arranca tras reiniciar. Sin marcar: la clave no existe.
11. **Descarga MP3** y **calidad «Baja»** funcionan (usa `ffmpeg\ffmpeg.exe`).
12. Los datos aparecen en `%LOCALAPPDATA%\SoundWave` y **no** en
    `Program Files\SoundWave` (ni `soundwave.db`, ni `downloads\`).
13. Desinstalar desde «Aplicaciones» de Windows:
    - desaparecen los accesos directos,
    - se borra `C:\Program Files\SoundWave` (INCLUIDA la carpeta),
    - se borra la clave de inicio con Windows si se creó,
    - **queda** `%LOCALAPPDATA%\SoundWave` (los datos no se pierden).
14. Reinstalar por encima (misma versión) funciona; instalar una versión
    **inferior** sobre una superior debe mostrar el mensaje de error de
    actualización en español.

### Regresión rápida tras cada cambio

- `ruff check backend/ && python -m pytest` en `backend/` (337 tests).
- `npm test` (frontend).

---

## 📌 Pendientes conocidos

- **Firma de código** (Authenticode): sin ella, SmartScreen avisará en la
  primera ejecución. Requiere certificado.
- **Banner de 493×64** en el diálogo de bienvenida (ahora usa el de WixUI).
- **NSIS** deshabilitado (`targets: ["msi"]`); si se re-habilita hay que
  revisar `bundle.licenseFile`, que NSIS usa de otra manera.
- **Compresión del cabinet** y CI en Windows: aún no.
- La app tiene favicon y icono de ventana distintos (inconsistencia de marca).
