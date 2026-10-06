# 📦 Instalador MSI de OpenWave

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

Sale en `build\windows\OpenWave-<versión>-x64-es-ES.msi` (y el MSI «crudo»
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
| 1b | `scripts/generate-installer-art.ps1` | `build/windows/banner.bmp` (493×58) + `dialog.bmp` (493×312) |
| 2 | `scripts/prepare-runtime.ps1` | `build/staging/{backend,runtime,ffmpeg}` |
| 3 | `npx tauri build --bundles msi` | Compila y enlaza el MSI |
| 3b | `scripts/msi-postprocess.ps1` | Tipografía del MSI enlazado: títulos sin negrita, `WixUI_Font_Bigger` a 11 pt |
| 4 | `scripts/verify-msi.ps1` | Comprueba las tablas del MSI resultante (54 checks) |

`prepare-runtime.ps1` es idempotente: deja `build/staging/.ready` y solo se
vuelve a ejecutar si cambia `backend/requirements-runtime.txt`, si cambia el
código de `backend/*.py` (hash guardado en el marcador) o con `-Force`.

> **Ojo con `-SkipRuntime`**: salta `prepare-runtime.ps1` por completo y NO
> refresca `build/staging/backend`. Si el builda con `-SkipRuntime` y ha
> cambiado código del backend, **el MSI empaqueta el backend viejo** (pasó en
> la práctica: el seek seguía reiniciando la canción en la app «instalada»
> con el fix ya commiteado). Con cambios en `backend/`, builda **sin**
> `-SkipRuntime`.

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
| `src-tauri/tauri.conf.json` | `targets: ["msi"]`, `wix.template`, `wix.language`, `wix.bannerPath`/`dialogImagePath`, `licenseFile` |
| `src-tauri/windows/main.wxs` | Plantilla WiX: diálogo **OptionsDlg**, accesos directos, clave de inicio, limpieza de INSTALLDIR, textos de progreso (`WixUI_ErrorProgressText`) y navegación de «Cambiar» |
| `src-tauri/windows/es-ES.wxl` | Strings propios en español (Tauri + OptionsDlg); el resto lo aporta WixUIExtension |
| `docs/instalador/TERMINOS.txt` | Términos en español (se muestran antes de la GPL) |
| `LICENSE` | GPL-3.0-or-later |
| `scripts/generate-license.ps1` | Compone ambos textos en `build/windows/licencia.txt` (9 pt, interlineado compacto) |
| `scripts/generate-installer-art.ps1` | Gráficos de marca del asistente: `banner.bmp` + `dialog.bmp` |
| `scripts/prepare-runtime.ps1` | Python embebido + deps + ffmpeg → `build/staging/` |
| `scripts/msi-postprocess.ps1` | UPDATE de `TextStyle` en el MSI ya enlazado (sin negrita en títulos) |
| `scripts/package-windows.ps1` | Orquesta todo, post-procesa y renombra el MSI |
| `scripts/verify-msi.ps1` | Lee las tablas del MSI por COM y ejecuta las 67 comprobaciones |

### Estructura instalada

```
C:\Program Files\OpenWave\
├── OpenWave.exe
├── LICENSE
├── backend\            ← solo código .py (sin tests ni cachés)
├── runtime\            ← python.exe + Lib\site-packages (sin pip)
└── ffmpeg\ffmpeg.exe
```

Los datos **nunca** van en `Program Files`, sino en `C:\ProgramData\OpenWave`
(descargas, cubiertos, letras, caché de stream, base de datos, copias de
seguridad y log — «Datos de Programas»), así la app funciona sin privilegios
y sobrevive a desinstalar/reinstalar. En la primera ejecución se crea esa
carpeta (un usuario sin privilegios puede crearla: verificado) y se migran
automáticamente los datos de la ubicación anterior
(`%LOCALAPPDATA%\OpenWave` o `%LOCALAPPDATA%\SoundWave` de versiones previas).
Las preferencias y listas viven además en el perfil WebView2 del usuario
(`localStorage`).

### Ciclo de vida del backend

El servidor Python **va dentro del MSI** (todo `backend\`, `runtime\` y
`ffmpeg\` son filas de la tabla `File`, y `verify-msi.ps1` lo exige con tres
checks de payload), y no hay nada que arrancar a mano: lo gestiona el propio
`OpenWave.exe` (`src-tauri/src/lib.rs`).

1. **Al abrir la app** (`setup`), si `127.0.0.1:8765` no responde ya, lanza
   en segundo plano `runtime\python.exe backend\main.py` (con consola
   oculta), `OPENWAVE_DATA_DIR=C:\ProgramData\OpenWave` y `runtime\` y
   `ffmpeg\` delante en `PATH`. La espera de `GET /health` (hasta 15 s)
   corre en un **hilo aparte**: `setup()` no bloquea y la ventana pinta
   desde el primer frame (antes el bucle de eventos no arrancaba hasta
   15 s, con la ventana congelada).
2. **Si el puerto ya responde** (otra instancia abierta, o un backend que
   sobrevivió a un cierre brusco), no lanza otro: reutiliza ese.
3. **Al cerrar la ventana** (`CloseRequested`) hace `child.kill()` sobre
   *su* proceso hijo: muere `python.exe` y con él uvicorn. Si la app muere
   sin pasar por ese cierre («Finalizar tarea»), el backend se queda vivo y
   el paso 2 lo reutiliza en el siguiente arranque.

**El backend en frío tarda ~15-20 s en servir** (imports de Python +
escaneo de Defender del runtime recién instalado), así que la pantalla de
inicio no decide con un solo chequeo: `utils/backendHealth.js` abre una
**ventana de gracia de 30 s** (`BOOT_GRACE_MS`) reintentando cada 1,5 s
(`BOOT_RETRY_INTERVAL_MS`) mientras muestra «Iniciando…»; si el backend
responde, la pantalla se desvanece; si la gracia se agota, aparece el
estado de error con su código (p. ej. `E-CNX-01`) y, más tarde, el overlay
se desvanece solo si el backend acaba de subir.

El stderr del backend (arranques, tracebacks, warmup) cae en
`C:\ProgramData\OpenWave\backend.err.log`.

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
  limpie también si se desmarcan los accesos directos.

- **`INSTALL_STARTUP` empieza vacío** (desmarcado por defecto) y
  `INSTALL_DESKTOP` viene con `1`. No existe `INSTALL_STARTMENU`: la feature
  `StartMenuShortcut` se eliminó, porque la entrada en Inicio la aporta el
  paquete sparse (identidad) y el shortcut del MSI la duplicaba. La carpeta de
  menú solo se declara para `CMP_LegacyStartCleanup`, que en cada instalación
  borra el `.lnk` heredado que dejaría un upgrade desde una versión antigua
  (`RemoveExistingProducts` ejecuta la secuencia del producto viejo, donde
  `RemoveShortcuts` se salta con `UPGRADINGPRODUCTCODE`).

- **La página de progreso necesita `<UIRef Id="WixUI_ErrorProgressText" />`.**
  Ese fragmento de la librería WixUI aporta la tabla `ActionText` («Copiando
  archivos nuevos», «Archivo: [1], directorio: [9], tamaño: [6]», …). Sin la
  tabla, el `EventMapping` del `ProgressDlg` no encuentra texto y la línea
  «Estado:» se queda muda toda la instalación. Las cadenas existen en español
  dentro de `WixUIExtension.dll` (sección `Culture="es-es"`); `verify-msi.ps1`
  exige que salgan en español, así que si alguna vez resolvieran en inglés hay
  que añadir las `String Id="ProgressText*"` a `src-tauri/windows/es-ES.wxl`
  (son `Overridable="yes"` y nuestro `-loc` gana).

- **«Cambiar» del modo mantenimiento venía muerto en WixUI_InstallDir.**
  `MaintenanceTypeDlg.ChangeButton` solo publicaba la propiedad
  `[WixUI_InstallMode]=Change` (Order 1) y **no** navegaba: los sabores Mondo y
  FeatureTree sí publican `NewDialog CustomizeDlg`, pero InstallDir no publica
  ningún `NewDialog`. El fix es un `<Publish>` con `Event="NewDialog"
  Value="OptionsDlg" Order="2">` en `main.wxs`; OptionsDlg ya publica las
  casillas con `AddLocal`/`Remove`, que el ejecutor procesa en modo Change
  (condición `ALLUSERS AND (ADDLOCAL OR REMOVE)` del propio WixUI).

- **La tipografía se corrige con UPDATE, no con WiX.** `<TextStyle>` solo
  acepta `FaceName/Size/Bold/Italic/Color` y **no se puede redefinir** una
  `TextStyle` que ya trae WixUI (clave duplicada en `light`). En cambio la
  tabla `TextStyle` del MSI resultante sí admite `UPDATE` por COM:
  `scripts/msi-postprocess.ps1` pone `WixUI_Font_Title.StyleBits = NULL`
  (el bit 1 = negrita; los títulos de página dejaban de verse en bold) y
  `WixUI_Font_Bigger.Size = 11` (bienvenida/salida, antes 12). Atención: la
  base hay que abrirla en **modo lectura/escritura (1)**; el 0 es de solo
  lectura y todo `UPDATE` falla en `Execute`.

- **Los gráficos del asistente son nuestros, pero sin logo** (`wix.bannerPath`
  / `wix.dialogImagePath` → `build/windows/{banner,dialog}.bmp`, que genera
  `scripts/generate-installer-art.ps1` en el paso 1b): banda clara con un
  filete para que el título negro de WixUI se lea, y panel violeta liso —sin
  logotipo ni texto, por petición del usuario— en la columna izquierda de la
  imagen de diálogo (los controles de texto arrancan en `x = 180 px`),
  dejando libre la zona blanca de la derecha.

- **`upgradeCode` fijado a mano en `tauri.conf.json`** (`25B18CFC-...`).
  Si no se fija, Tauri lo deriva de `productName` (uuid v5 sobre
  `<productName>.exe.app.x64`): al renombrar la app de SoundWave a OpenWave
  el MSI habría cambiado de identidad y Windows habría visto dos programas
  distintos (instalación duplicada, sin actualización). Con el GUID fijado,
  el build nuevo hace MajorUpgrade sobre la SoundWave instalada.

- **El `identifier` `com.soundwave.app` NO se renombra.** De él derivan el
  perfil de WebView2 (`%LOCALAPPDATA%\com.soundwave.app`, donde vive el
  `localStorage`: listas, ajustes, biblioteca), el `manufacturer` de WiX
  (`HKCU\Software\soundwave\...`) y el AppUserModelID
  (`Software\Classes\AppUserModelId\com.soundwave.app`, con `DisplayName`
  «OpenWave»: crea el instalador y la app fija el AUMID del proceso al
  arrancar para que los procesos de WebView2 aparezcan como «OpenWave» en el
  Administrador de Tareas); cambiarlo supondría perder los datos del usuario.
  La marca visible (nombre, `.exe`, ventanas, documentos) sí es OpenWave.

- **Los datos viven en «Datos de Programas» (`C:\ProgramData\OpenWave`).**
  `config._datos_dir()` y `lib.rs::resolver_data_dir()` añaden esa rama con
  un gate que crea la carpeta y comprueba que se puede escribir, con fallback
  a `%LOCALAPPDATA%\OpenWave`. El instalador NO crea la carpeta: una creada
  por el MSI elevado quedaría en manos de Administradores y los usuarios
  normales no podrían escribir en ella; en cambio un usuario sin privilegios
  SÍ puede crear subcarpetas en `C:\ProgramData` (verificado) y queda como
  propietario con control total. En el primer arranque se migran los datos
  antiguos (`%LOCALAPPDATA%\OpenWave` y la carpeta `SoundWave` de versiones
  previas, con `soundwave.db` → `openwave.db`) sin borrar el origen y con
  marcador `.migrated.json`.
  **La instalación se detecta por el LAYOUT, no por la escritura**
  (`lib.rs::es_instalado` / `config._es_instalado`: ruta bajo `Program
  Files` o hermano `runtime\` junto a `backend\`): en la primera prueba
  real la app se lanzó elevada desde la última página del instalador, el
  código resultó escribible y los datos acabaron OTRA VEZ en Archivos de
  Programas. Con la regla de layout, instalado → siempre ProgramData,
  escriba o no el código.
- **La carpeta `C:\ProgramData\OpenWave` la crea EL INSTALADOR y una SAC le
  pone la ACL con `icacls` (SID, locale-proof).** `main.wxs` declara
  `CommonAppDataFolder\OpenWave` (el Id estándar es `CommonAppDataFolder`;
  `ProgramDataFolder` no existe y MSI lo resolvía como `C:\CommonAppData` —
  comprobado con el log de instalación) con componente `CreateFolder` (Guid
  explícito: un keypath de directorio no admite `«*»`, LGHT0230) y la SAC
  diferida `FixAcl`:
  `icacls "…\OpenWave" /grant:r *S-1-5-32-545:(OI)(CI)M /T /C /Q`.
  El **SID** en vez de «Usuarios»/«Users»: `util:PermissionEx` solo admite
  nombres de cuenta, que están localizados, y con un SID propio da
  `failed to get sid for account` → 1603 (las dos variantes probadas a mano);
  con nombre localizado instalaría en es-ES y fallaría en en-US. `(OI)(CI)`
  hace que el permiso llegue también a los **ficheros** y `/T` sanea los ya
  existentes: sin esto, el proceso normal recibía `PermissionError` al abrir
  `openwave.log` (creado por el arranque elevado) y la base de datos quedaba
  de solo lectura. `Impersonate=no` + `Execute=deferred`, condición
  `NOT REMOVE` y `Return=ignore` (no rompe la instalación si icacls falla;
  el `post-install-check` lo verifica). Los datos **no** se borran al
  desinstalar: `CreateFolder` solo retira la carpeta si queda vacía.
- **CORS debe permitir `http://tauri.localhost`.** La app empaquetada corre
  en WebView2 con ese origen (se comprueba en el perfil: las claves de
  `Local Storage` usan `_http://tauri.localhost`). Sin él, el fetch llega al
  backend y contesta 200 pero el navegador bloquea la lectura de la
  respuesta: `api.js` ve un `TypeError`, `markOffline` lo etiqueta
  `E-CNX-01` y la UI insiste en «Sin conexión con el servidor» **con el
  backend en marcha** — exactamente lo visto en las dos primeras pruebas del
  MSI. Origen real + dev:1420 en `_ORIGENES_CORS` (`backend/main.py`), que
  usan tanto el middleware como el handler de errores internos; testeado en
  `TestCorsOrigenEmpaquetado`.

---

## ✅ Checklist de aceptación

Compilar, **cerrar la app si está abierta** y ejecutar el MSI.

### Asistente

1. Doble clic en el MSI → diálogo de Control de cuentas de usuario (Sí).
2. **Bienvenida** en español, con la imagen de marca de OpenWave (panel
   violeta con el logotipo) a la izquierda.
3. **Términos y licencia**: aparece `TERMINOS.txt` y después la GPL en español,
   a 9 pt y con interlineado compacto (sin el salto enorme de versiones
   anteriores); el botón «Siguiente» está **deshabilitado** hasta marcar
   «Acepto los términos».
4. **Carpeta de destino**: `C:\Program Files\OpenWave`, con botón
   `Examinar...` que abre el diálogo de selección de carpeta.
5. **Opciones de instalación**: dos casillas
   - [x] Crear un acceso directo en el escritorio
   - [ ] Iniciar OpenWave con Windows  ← **desmarcado por defecto**
   (La entrada en el menú Inicio no es una casilla: la pone el paquete sparse
   al registrarse — ver §10 de `PERFORMANCE.md`.)
6. **Listo para instalar** → «Instalar»: la página de progreso muestra
   **textos de estado** («Copiando archivos nuevos», «Archivo: …, directorio:
   …») sobre la barra, no solo la barra.
7. **Finalizar**: casilla «Iniciar OpenWave al terminar la instalación»
   marcada por defecto.
8. Los títulos de cada página se ven **sin negrita** y a un tamaño
   proporcionado (tipografía corregida con `msi-postprocess.ps1`).

### Post-instalación

9. La app arranca con la pantalla **«Iniciando OpenWave…»** (ventana de
   gracia de 30 s con reintentos cada 1,5 s): cuando el backend responde
   (~5-20 s en frío la primera vez), la pantalla se desvanece sola y entra
   a la app. Con el backend caído de verdad, a los 30 s aparece el error con
   su **código** (p. ej. `E-CNX-01`) y «Continuar sin conexión».
10. Acceso directo creado en el escritorio apuntando al `.exe` instalado; la
    entrada `Inicio ▸ OpenWave` la aporta el paquete de identidad, no un
    `.lnk` del MSI.
11. Con la tercera casilla marcada: aparece
    `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\OpenWave` y la app
    arranca tras reiniciar. Sin marcar: la clave no existe.
12. **Descarga MP3** y **calidad «Baja»** funcionan (usa `ffmpeg\ffmpeg.exe`).
13. Los datos aparecen en `C:\ProgramData\OpenWave` y **no** en
    `Program Files\OpenWave` (ni `openwave.db`, ni `downloads\`). Si había
    datos en la ubicación antigua (`%LOCALAPPDATA%\OpenWave` o
    `%LOCALAPPDATA%\SoundWave`), se migran automáticamente al primer arranque.
14. Desinstalar desde «Aplicaciones» de Windows:
    - desaparecen los accesos directos,
    - se borra `C:\Program Files\OpenWave` (INCLUIDA la carpeta),
    - se borra la clave de inicio con Windows si se creó,
    - **queda** `C:\ProgramData\OpenWave` (los datos no se pierden).
15. Reinstalar por encima (misma versión) funciona; instalar una versión
    **inferior** sobre una superior debe mostrar el mensaje de error de
    actualización en español.

### Modo mantenimiento (re-ejecutar el mismo MSI)

16. Re-ejecutar el MSI ya instalado **no reinstala**: aparece la bienvenida de
    mantenimiento y la página con **tres opciones**: «Cambiar», «Reparar» y
    «Quitar».
    ✅ *Verificado 2026-10-01*: con el producto instalado, `msiexec /i <msi>`
    muestra «Cambiar, reparar o quitar la instalación» con los tres botones y
    **ninguna transacción se inicia hasta que el usuario pulsa**.
17. **Cambiar** abre «Opciones de instalación» (las dos casillas); «Siguiente»
    lleva a «Listo para instalar» y los cambios se
    aplican. En WixUI_InstallDir ese botón venía **sin cablear** (solo publicaba
    `WixUI_InstallMode=Change` y no navegaba): el `NewDialog` a `OptionsDlg`
    está publicado en `main.wxs`.
    ✅ *Estructural*: `verify-msi` comprueba el `NewDialog`
    `ChangeButton → OptionsDlg`. ⏳ *Clic manual pendiente*: automatizar la UI
    no fue posible (UIPI no deja enviar input/simular ratón a una ventana
    elevada desde un proceso no elevado, y UI Automation se colgaba al
    inspeccionar el diálogo); probar a mano: Cambiar → casillas → Siguiente.
18. **Reparar** y **Quitar** van a «Listo para instalar» con el modo elegido.
    Cancelar en esas pantallas no toca la instalación.
    ✅ *Quitar verificado end-to-end 2026-10-01 por la propia UI*: eventos
    `MsiInstaller` 18:25:00–18:25:32 con la ventana de mantenimiento como
    cliente (transacción completada con resultado 0); después: exe, clave ARP
    y accesos directos borrados, solo quedaron los `.pyc` de runtime (que el
    MSI no posee) y `C:\ProgramData\OpenWave` intacto. ⏳ *Reparar* y el clic
    de *Cambiar* (17) quedan como prueba manual pendiente.

### Regresión rápida tras cada cambio

- `ruff check backend/ && python -m pytest` en `backend/` (355 tests).
- `npm test` (frontend, 806 tests).
- Tras recompilar: `powershell -ExecutionPolicy Bypass -File scripts\verify-msi.ps1`
  → 67 comprobaciones sobre las tablas del MSI (flujo del asistente, incluido
  el modo mantenimiento, valores por defecto de las casillas, licencia embebida,
  textos de progreso de `ActionText`, tipografía de `TextStyle`, gráficos de
  marca, limpieza de INSTALLDIR y del acceso directo de Inicio heredado
  (`CMP_LegacyStartCleanup`), registro AppUserModelId de agrupación en el
  Administrador de Tareas, payload: backend + Python embebido + ffmpeg y
  `main.py` al día, e icono del taskbar: `Assets\` (base + set targetsize de
  45 variantes) en el payload y el mismo set + `resources.pri` dentro del
  msix), sin instalar nada.

---

## 🩹 Solución de problemas

**`failed to run ...candle.exe` sin más detalle.** Tauri propaga solo ese
mensaje y se queda con la salida de `candle`, así que el error real hay que
verlo a mano. `main.wxs` que hay que pasarle es el que Tauri ya renderizó en
`target` (con las plantillas `{{ }}` resueltas):

```powershell
$wix = "$env:LOCALAPPDATA\tauri\WixTools314"
& "$wix\candle.exe" -nologo -arch x64 `
    -ext "$wix\WixUIExtension.dll" -ext "$wix\WixUtilExtension.dll" `
    src-tauri\target\release\wix\x64\main.wxs -out "$env:TEMP\main.wixobj"
```

Errores ya vistos y resueltos en la plantilla (no deberían volver a salir):

| Error | Causa |
|-------|-------|
| `CNDL0005: The Dialog element contains an unexpected child element 'TabOrder'` | WiX 3 no admite `<TabOrder>`: el orden de tabulación sale del orden de los `<Control>`. |
| `CNDL1006: Property 'X' does not contain a Value ... is being ignored` | Un `<Property>` sin `Value` no genera nada. Para un checkbox desmarcado por defecto se deja **sin declarar** la propiedad (y `Value=""` no sirve: `CNDL0006`). |

**`resource path ... build/staging ... doesn't exist`.** El `build.rs` de
Tauri valida `bundle.resources` en cualquier build: ejecuta
`scripts/prepare-runtime.ps1`, o en desarrollo crea los directorios vacíos
(«Obligatorio», más arriba).

**`pip`/avisos de herramientas abortando un script PowerShell.** Los scripts
usan `Invoke-Native`, que baja `$ErrorActionPreference` durante la llamada:
`2>&1` + `Stop` convertiría cualquier stderr en excepción. Si añades llamadas
nuevas a comandos nativos, pásalas por ahí (o por `Invoke-Checked`).

**`ModuleNotFoundError: No module named 'cache'` al arrancar la app instalada
(el backend no levanta).** El Python embebido lleva un `python314._pth`, que
**sustituye** la inicialización normal de `sys.path`: solo quedan
`python314.zip`, la propia carpeta del runtime y `Lib\site-packages`; ni la
carpeta del script (`sys.path[0]`) ni el cwd entran. Como el backend usa
imports planos (`from cache import ...`), el backend del primer MSI murió con
ese error. Resuelto con el bootstrap de `sys.path` de `backend/main.py` (va
justo después de los imports de la stdlib y mete la carpeta del propio
fichero). El smoke test de `prepare-runtime.ps1` ahora **arranca el entry
point de verdad** (con la ruta `\\?\` que lanza Tauri y una cwd ajena); antes
hacía `sys.path.insert(0, os.getcwd())` con cwd = `backend\`, que reproducía
un entorno que la app instalada nunca tiene — por eso no cazó el fallo.

**`package-windows.ps1` falla con «El puerto 8765 ya esta en uso».** El smoke
test necesita arrancar el backend: cierra OpenWave y vuelve a ejecutar.

**`dark.exe` dice que faltan filas (DARK1059) y solo ve 1 diálogo.** El
descompilador de WiX decompila mal la UI de este MSI: emite solo `OptionsDlg`
(13 controles) y se inventa avisos sobre claves ajenas que sí existen. Las
tablas reales están completas (24 diálogos, 228 controles). Para inspeccionar
el MSI de verdad usa `scripts\verify-msi.ps1`, que las lee con el COM
`WindowsInstaller.Installer` y las imprime. Tres peculiaridades que ya están
resueltas dentro del script:

- MSI SQL solo admite `SELECT *` aquí: las listas de columnas con guion bajo
  final (`Control_`, `Dialog_`…) las rechaza `OpenView` (`OpenView,Sql`).
- `Binary.Data` (binario) y las columnas nulas (`Component.KeyPath`) lanzan
  excepción en `StringData`: hay que leer campo a campo con `try/catch`.
- `View.Execute` devuelve `$null` y, como sentencia desnuda, se cuela en el
  pipeline como primera fila de cada consulta (hay que ignorarlo con `[void]`).

También conviene saberlo al leer la plantilla: **no existe la tabla
`RemoveFolder` en MSI**; el `<RemoveFolder>` de WiX se compila a la tabla
`RemoveFile` con `FileName` vacío (y `Product` tampoco es tabla: la autoría
`<Product>` acaba en las propiedades `ProductName`/`ProductLanguage`/…).

---

## 📌 Pendientes conocidos

- **Firma de código** (Authenticode): sin ella, SmartScreen avisará en la
  primera ejecución. Requiere certificado.
- Los gráficos de marca son **493×58** (banner) y **493×312** (imagen de
  diálogo); con DPI alto `msiexec` escala los diálogos y los bitmap se
  estiran (los tamaños de letra más pequeños mitigan el efecto).
- **NSIS** deshabilitado (`targets: ["msi"]`); si se re-habilita hay que
  revisar `bundle.licenseFile`, que NSIS usa de otra manera.
- **Compresión del cabinet** y CI en Windows: aún no.
- **`ytmusicapi.get_charts()` roto** en `ytmusicapi==1.7.3`: con `GT` da
  `IndexError: list index out of range` (dentro de
  `ytmusicapi/mixins/explore.py`) y con `US`/`MX`, `StopIteration` — YouTube
  Music cambió la estructura de la respuesta. El warmup de `main.py` lo
  captura y la app sigue, pero la sección «trending» queda sin datos. No es
  problema del instalador (falla igual en desarrollo): hay que subir
  `ytmusicapi` o parchear el parsing.
- La app tiene favicon y icono de ventana distintos (inconsistencia de marca).
