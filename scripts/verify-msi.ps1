<#
.SYNOPSIS
    Verificacion estatica del MSI de OpenWave sin instalarlo (incluye los
    checks del paquete sparse de identidad, plan C).

.DESCRIPTION
    Lee las tablas del .msi con el objeto COM WindowsInstaller.Installer y
    comprueba el flujo del asistente (incluido el modo mantenimiento), los
    valores por defecto de las casillas, la licencia embebida, los textos de
    progreso (ActionText), la tipografia (TextStyle), los graficos de marca
    (banner/dialogo, via dark.exe) y la limpieza de la carpeta de instalacion.
    Sale con codigo 0 si todo pasa y 1 si algo falla.

    Notas de implementacion (probadas):
      - Solo consultas SELECT *: MSI SQL rechaza en OpenView varias listas de
        columnas (casi todas con guion bajo final: Control_, Dialog_...).
      - StringData campo a campo con try/catch: Binary.Data (binario) y
        Component.KeyPath (nulo) lanzan COMException.
      - Execute devuelve $null y como sentencia desnuda emitiria una fila nula
        al pipeline: hay que descartarlo con [void].
      - El elemento WiX <RemoveFolder> NO crea una tabla RemoveFolder (esa
        tabla no existe en MSI): se compila a RemoveFile con FileName vacio.
      - dark.exe decompila mal la UI de este MSI (avisos DARK1059 falsos y
        solo 1 dialogo / 13 controles); las tablas reales estan completas.

.PARAMETER MsiPath
    Ruta del .msi a comprobar. Por defecto, el mas reciente de
    build\windows\OpenWave-*.msi.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\verify-msi.ps1
#>
param([string]$MsiPath = '')
$ErrorActionPreference = 'Stop'

if (-not $MsiPath) {
    $dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\windows'
    $found = @(Get-ChildItem -Path $dir -Filter 'OpenWave-*.msi' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending)
    if ($found.Count -eq 0) { throw "No hay ningun OpenWave-*.msi en $dir; compila antes con scripts\package-windows.ps1" }
    $MsiPath = $found[0].FullName
}
if (-not (Test-Path -LiteralPath $MsiPath)) { throw "No existe $MsiPath" }
Write-Host "MSI: $MsiPath"

$installer = New-Object -ComObject WindowsInstaller.Installer
$db = $installer.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $installer, @($MsiPath, 0))

function Invoke-MsiQuery([object]$db, [string]$sql) {
    $rows = New-Object System.Collections.ArrayList
    try {
        $view = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @($sql))
        [void]$view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null)
        while ($true) {
            $rec = $view.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $view, $null)
            if ($null -eq $rec) { break }
            $n = $rec.GetType().InvokeMember('FieldCount', 'GetProperty', $null, $rec, $null)
            $row = @()
            for ($i = 1; $i -le $n; $i++) {
                $v = ''
                try {
                    $v = $rec.GetType().InvokeMember('StringData', 'GetProperty', $null, $rec, @($i))
                } catch { $v = '<no-texto>' }
                $row += $v
            }
            [void]$rows.Add($row)
        }
    } catch {
        Write-Host "SQL FALLA: $sql"
        Write-Host "  -> $($_.Exception.Message)"
    }
    $rows
}

function Show([string]$title, [array]$rows, [int]$max = 40, [int[]]$cols = @()) {
    Write-Host ''
    Write-Host "-- $title ($($rows.Count)) --"
    $rows | Select-Object -First $max | ForEach-Object {
        if ($cols.Count) {
            $parts = @()
            foreach ($c in $cols) { $parts += [string]$_[$c] }
            Write-Host ('  ' + ($parts -join ' | '))
        } else {
            Write-Host ('  ' + ($_ -join ' | '))
        }
    }
    if ($rows.Count -gt $max) { Write-Host "  ... $($rows.Count - $max) mas" }
}

# Indices de columnas segun la referencia de Windows Installer
$dialogs  = @(Invoke-MsiQuery $db 'SELECT * FROM Dialog')
$controls = @(Invoke-MsiQuery $db 'SELECT * FROM Control')      # 0 Dialog_ 1 Control_ 2 Type 8 Property 9 Text
$events   = @(Invoke-MsiQuery $db 'SELECT * FROM ControlEvent') # 0 Dialog_ 1 Control_ 2 Event 3 Argument 4 Condition 5 Ordering
$features = @(Invoke-MsiQuery $db 'SELECT * FROM Feature')      # 0 Feature 1 FeatureParent 2 Title 4 Display 5 Level
$props    = @(Invoke-MsiQuery $db 'SELECT * FROM Property')     # 0 Property 1 Value
$cas      = @(Invoke-MsiQuery $db 'SELECT Action, Type, Source, Target FROM CustomAction') # 0 Action 1 Type 2 Source 3 Target
$iseq     = @(Invoke-MsiQuery $db 'SELECT Action, Condition FROM InstallExecuteSequence')   # 0 Action 1 Condition
$iseqSeq  = @(Invoke-MsiQuery $db 'SELECT Action, Sequence FROM InstallExecuteSequence')    # 0 Action 1 Sequence (numero)
$featComps= @(Invoke-MsiQuery $db 'SELECT Feature_, Component_ FROM FeatureComponents')     # 0 Feature_ 1 Component_
$reg      = @(Invoke-MsiQuery $db 'SELECT * FROM Registry')     # 0 Registry 1 Root 2 Key 3 Name_ 4 Value 5 Component_
$rfile    = @(Invoke-MsiQuery $db 'SELECT * FROM RemoveFile')   # 0 RemoveFile 1 Component_ 2 FileName 3 DirProperty 4 InstallMode
$files    = @(Invoke-MsiQuery $db 'SELECT * FROM File')
$comps    = @(Invoke-MsiQuery $db 'SELECT * FROM Component')  # 0 Component 1 ComponentId 2 Directory_
$dirs     = @(Invoke-MsiQuery $db 'SELECT * FROM Directory')  # 0 Directory 1 Directory_Parent 2 DefaultDir
# Tipografia del wizard (WixUI_Font_*): 0 Nombre 1 Fuente 2 Tamano 4 StyleBits
$textsty  = @(Invoke-MsiQuery $db 'SELECT * FROM TextStyle')
# Textos de estado del ProgressDlg: 0 Action 1 Description 2 Template
$actext   = @(Invoke-MsiQuery $db 'SELECT * FROM ActionText')

# Rutas instaladas: File -> Component -> Directory (para poder exigir que el
# backend, el Python embebido y ffmpeg vayan DENTRO del MSI y no solo en el
# repo; fue el fallo que dejo el primer MSI sin servidor que arrancar).
$dirParent = @{}
$dirName   = @{}
foreach ($d in $dirs) {
    $dirParent[$d[0]] = $d[1]
    $n = [string]$d[2]
    if ($n -match '\|') { $n = ($n -split '\|')[1] }   # corto|largo
    $dirName[$d[0]] = $n
}
function InstallPath([string]$dirId) {
    $parts = @()
    $cur = $dirId
    while ($cur -and $dirParent.ContainsKey($cur)) {
        if ($dirName[$cur]) { $parts = , $dirName[$cur] + $parts }
        $cur = $dirParent[$cur]
        if ($parts.Count -gt 40) { break }
    }
    ($parts -join '\')
}
$compDir = @{}
foreach ($c in $comps) { $compDir[$c[0]] = $c[2] }

# Ruta instalada -> FileSize (File: 0 File 1 Component_ 2 FileName 3 FileSize)
$fileSizes = @{}
foreach ($f in $files) {
    $name = [string]$f[2]
    if ($name -match '\|') { $name = ($name -split '\|')[1] }
    $dir = $compDir[$f[1]]
    if ($dir) { $fileSizes[(InstallPath $dir) + '\' + $name] = [int]$f[3] }
}
$payBackend     = @($fileSizes.Keys | Where-Object { $_ -like '*\backend\main.py' -and $_ -notlike '*site-packages*' })
$payPython      = @($fileSizes.Keys | Where-Object { $_ -like '*\runtime\python.exe' })
$payFfmpeg      = @($fileSizes.Keys | Where-Object { $_ -like '*\ffmpeg\ffmpeg.exe' })
# El backend del MSI debe ser el del staging: si solo cambio el codigo y el
# staging no se refresco, este check se cae antes de repartir un MSI viejo.
$payBackendFresh = $true
$stagingMain = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\staging\backend\main.py'
if (Test-Path -LiteralPath $stagingMain) {
    if ($payBackend.Count -eq 1) {
        $payBackendFresh = ($fileSizes[$payBackend[0]] -eq (Get-Item -LiteralPath $stagingMain).Length)
    } else {
        $payBackendFresh = $false
    }
}

$dialogNames = @($dialogs | ForEach-Object { $_[0] })
$optControls = @($controls | Where-Object { $_[0] -eq 'OptionsDlg' })
$flow = @($events | Where-Object { $_[0] -in @('InstallDirDlg', 'VerifyReadyDlg', 'OptionsDlg', 'WelcomeDlg', 'LicenseAgreementDlg', 'MaintenanceWelcomeDlg', 'MaintenanceTypeDlg') })

# Texto RTF de la licencia: light inyecta el contenido de LICENSE.rtf (generado
# por Tauri a partir de build/windows/licencia.txt) en el control LicenseText.
$licRow = @($controls | Where-Object { $_[0] -eq 'LicenseAgreementDlg' -and $_[1] -eq 'LicenseText' })
$licText = ''
if ($licRow.Count -gt 0) { $licText = [string]$licRow[0][9] }

# Graficos de marca: se extraen los bitmaps embebidos con dark.exe y se
# comparan, fichero a fichero, con los que genera generate-installer-art.ps1.
$repoRoot = Split-Path -Parent $PSScriptRoot
$artBannerOk = $false
$artDialogOk = $false
$dark = Join-Path $env:LOCALAPPDATA 'tauri\WixTools314\dark.exe'
$refBanner = Join-Path $repoRoot 'build\windows\banner.bmp'
$refDialog = Join-Path $repoRoot 'build\windows\dialog.bmp'
if ((Test-Path -LiteralPath $dark) -and (Test-Path -LiteralPath $refBanner) -and (Test-Path -LiteralPath $refDialog)) {
    $tmp = Join-Path $env:TEMP ('swverify-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'   # dark.exe avisa (DARK1059) por stderr
    try {
        & $dark $MsiPath -x $tmp | Out-Null
        $ErrorActionPreference = $prevEap
        $embBanner = Join-Path $tmp 'Binary\WixUI_Bmp_Banner'
        $embDialog = Join-Path $tmp 'Binary\WixUI_Bmp_Dialog'
        if (Test-Path -LiteralPath $embBanner) {
            $artBannerOk = ((Get-FileHash -LiteralPath $embBanner).Hash -eq (Get-FileHash -LiteralPath $refBanner).Hash)
        }
        if (Test-Path -LiteralPath $embDialog) {
            $artDialogOk = ((Get-FileHash -LiteralPath $embDialog).Hash -eq (Get-FileHash -LiteralPath $refDialog).Hash)
        }
    } finally {
        $ErrorActionPreference = $prevEap
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
}

Show 'Dialog' $dialogNames 30
Show 'ControlEvent del flujo' $flow 50 @(0, 1, 2, 3, 4, 5)
Show 'Control de OptionsDlg' $optControls 20 @(0, 1, 2, 8, 9)
Show 'TextStyle (tipografia)' $textsty 8 @(0, 1, 2, 4)
Show 'ActionText (progreso)' $actext 6 @(0, 1, 2)
Show 'Feature' $features 10 @(0, 2, 5)
Show 'Registry' $reg 8 @(0, 1, 2, 3, 4)
Show 'RemoveFile' $rfile 8
Write-Host ''
Write-Host "-- File: $($files.Count) ficheros --"

# Comprobaciones
function Ev([string]$dlg, [string]$ctl, [string]$evt) {
    @($flow | Where-Object { $_[0] -eq $dlg -and $_[1] -eq $ctl -and $_[2] -eq $evt })
}
$propOf = @{}
foreach ($p in $props) { $propOf[[string]$p[0]] = [string]$p[1] }

# Derivados de las nuevas tablas (si una tabla no existe, la consulta devuelve
# vacio y las comprobaciones correspondientes fallan).
$titleStyle      = @($textsty | Where-Object { $_[0] -eq 'WixUI_Font_Title' })
$bigStyle        = @($textsty | Where-Object { $_[0] -eq 'WixUI_Font_Bigger' })
$installFilesTxt = @($actext  | Where-Object { $_[0] -eq 'InstallFiles' })
$maintControls   = @($controls | Where-Object { $_[0] -eq 'MaintenanceTypeDlg' })

# Contenido del msix (icono del taskbar): variante unplated + resources.pri.
# El msix se empaqueta junto al MSI (build\windows\openwave-identity.msix).
$msixPath = Join-Path (Split-Path -Parent $MsiPath) 'openwave-identity.msix'
if (-not (Test-Path -LiteralPath $msixPath)) {
    $msixPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\windows\openwave-identity.msix'
}
$msixNames = @()
$msixManifestText = ''
if (Test-Path -LiteralPath $msixPath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $msixZip = [System.IO.Compression.ZipFile]::OpenRead($msixPath)
    try {
        $msixNames = @($msixZip.Entries | ForEach-Object { $_.FullName })
        $entry = $msixZip.GetEntry('AppxManifest.xml')
        if ($entry) {
            $reader = New-Object System.IO.StreamReader($entry.Open())
            try { $msixManifestText = $reader.ReadToEnd() } finally { $reader.Dispose() }
        }
    } finally { $msixZip.Dispose() }
}

# Raiz de INSTALLDIR (= ExternalLocation del paquete sparse) y el PRI que el
# MSI instala ahi: es la pieza que lee MRT para resolver variantes calificadas
# (quinta causa, docs/PERFORMANCE.md §10). Se comprueba presencia, identidad
# con el de staging (mismo tamano, sin desfase de build) y sus qualifiers.
$instRoot   = InstallPath 'INSTALLDIR'
$priStaging = Join-Path $repoRoot 'build\windows\appx-staging\resources.pri'
$priStagingFresh = $false
if (Test-Path -LiteralPath $priStaging) {
    $msiPriSize = $fileSizes[($instRoot + '\resources.pri')]
    if ($msiPriSize -gt 0) {
        $priStagingFresh = ($msiPriSize -eq (Get-Item -LiteralPath $priStaging).Length)
    }
}
$priQualsOk = $false
$kitsBin = 'C:\Program Files (x86)\Windows Kits\10\bin'
$makepriExe = Get-ChildItem -Path (Join-Path $kitsBin '*\x64\makepri.exe') -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
if ($makepriExe -and (Test-Path -LiteralPath $priStaging)) {
    $dump = Join-Path $env:TEMP ('swverify-pri-' + [Guid]::NewGuid().ToString('N') + '.xml')
    try {
        & $makepriExe.FullName dump /if $priStaging /of $dump /o | Out-Null
        if (($LASTEXITCODE -eq 0) -and (Test-Path -LiteralPath $dump)) {
            $xml = Get-Content -LiteralPath $dump -Raw
            $mq = [regex]::Match($xml, '<Qualifiers[^>]*>.*?</Qualifiers>',
                [System.Text.RegularExpressions.RegexOptions]::Singleline)
            if ($mq.Success) {
                $block = $mq.Value
                $priQualsOk = $block.Contains('AlternateForm') -and $block.Contains('Contrast') -and
                    $block.Contains('Scale') -and $block.Contains('TargetSize')
            }
        }
    } finally { Remove-Item -LiteralPath $dump -ErrorAction SilentlyContinue }
}

$checks = [ordered]@{
    'Dialogos WixUI (Welcome, License, InstallDir, VerifyReady, Exit)' =
        ('WelcomeDlg' -in $dialogNames) -and ('LicenseAgreementDlg' -in $dialogNames) -and
        ('InstallDirDlg' -in $dialogNames) -and ('VerifyReadyDlg' -in $dialogNames) -and
        ('ExitDialog' -in $dialogNames)
    'OptionsDlg presente' = 'OptionsDlg' -in $dialogNames
    'WixUI_Mode=InstallDir (paso de licencia incluido)' = ($propOf['WixUI_Mode'] -eq 'InstallDir')
    'Producto es-ES (ProductLanguage 3082)' = ($propOf['ProductLanguage'] -eq '3082')
    'Alcance todos los usuarios (ALLUSERS=1)' = ($propOf['ALLUSERS'] -eq '1')
    'InstallDirDlg.Next -> OptionsDlg Order 5 (gana al 4)' =
        [bool](Ev 'InstallDirDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'OptionsDlg' -and $_[5] -eq '5' })
    'InstallDirDlg.Next -> VerifyReadyDlg Order 4 (WixUI, pisado)' =
        [bool](Ev 'InstallDirDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'VerifyReadyDlg' -and $_[5] -eq '4' })
    'VerifyReadyDlg.Back -> OptionsDlg Order 3 (gana)' =
        [bool](Ev 'VerifyReadyDlg' 'Back' 'NewDialog' | Where-Object { $_[3] -eq 'OptionsDlg' -and $_[5] -eq '3' })
    'OptionsDlg.Next: AddLocal DesktopShortcut (1)' =
        [bool](Ev 'OptionsDlg' 'Next' 'AddLocal' | Where-Object { $_[3] -eq 'DesktopShortcut' -and $_[5] -eq '1' })
    'OptionsDlg.Next: Remove DesktopShortcut (2)' =
        [bool](Ev 'OptionsDlg' 'Next' 'Remove' | Where-Object { $_[3] -eq 'DesktopShortcut' -and $_[5] -eq '2' })
    'OptionsDlg.Next: AddLocal StartupShortcut (3)' =
        [bool](Ev 'OptionsDlg' 'Next' 'AddLocal' | Where-Object { $_[3] -eq 'StartupShortcut' -and $_[5] -eq '3' })
    'OptionsDlg.Next: Remove StartupShortcut (4)' =
        [bool](Ev 'OptionsDlg' 'Next' 'Remove' | Where-Object { $_[3] -eq 'StartupShortcut' -and $_[5] -eq '4' })
    'OptionsDlg.Next: sin eventos de StartMenuShortcut (feature eliminada)' =
        (@(Ev 'OptionsDlg' 'Next' 'AddLocal' | Where-Object { $_[3] -eq 'StartMenuShortcut' }).Count -eq 0) -and
        (@(Ev 'OptionsDlg' 'Next' 'Remove'  | Where-Object { $_[3] -eq 'StartMenuShortcut' }).Count -eq 0)
    'OptionsDlg.Next: NewDialog VerifyReadyDlg (10, el mayor)' =
        [bool](Ev 'OptionsDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'VerifyReadyDlg' -and $_[5] -eq '10' })
    'OptionsDlg: exactamente 2 checkboxes' =
        (@($optControls | Where-Object { $_[2] -eq 'CheckBox' }).Count -eq 2)
    'Checkbox sobre INSTALL_DESKTOP / INSTALL_STARTUP' =
        [bool]($optControls | Where-Object { $_[2] -eq 'CheckBox' -and $_[8] -eq 'INSTALL_DESKTOP' }) -and
        [bool]($optControls | Where-Object { $_[2] -eq 'CheckBox' -and $_[8] -eq 'INSTALL_STARTUP' })
    'Textos de casillas en espanol' =
        [bool]($optControls | Where-Object { $_[9] -like 'Crear un acceso*' }) -and
        [bool]($optControls | Where-Object { $_[9] -eq 'Iniciar OpenWave con Windows' })
    'Sin feature StartMenuShortcut (la entrada en Inicio la da el paquete)' =
        -not [bool]($features | Where-Object { $_[0] -eq 'StartMenuShortcut' })
    'Feature DesktopShortcut Level 1' =
        [bool]($features | Where-Object { $_[0] -eq 'DesktopShortcut' -and $_[5] -eq '1' })
    'Feature StartupShortcut Level 101 (desmarcada)' =
        [bool]($features | Where-Object { $_[0] -eq 'StartupShortcut' -and $_[5] -eq '101' })
    'INSTALL_STARTUP sin declarar (default off)' = -not $propOf.ContainsKey('INSTALL_STARTUP')
    'INSTALL_DESKTOP=1 (activa) y sin INSTALL_STARTMENU (feature eliminada)' =
        ($propOf['INSTALL_DESKTOP'] -eq '1') -and (-not $propOf.ContainsKey('INSTALL_STARTMENU'))
    'Licencia: flujo Welcome -> License -> InstallDir' =
        [bool](Ev 'WelcomeDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'LicenseAgreementDlg' }) -and
        [bool](Ev 'LicenseAgreementDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'InstallDirDlg' })
    'Licencia: control LicenseText con RTF inline (un solo {\rtf1)' = [bool]($licText) -and
        ([regex]::Matches($licText, '\{\\rtf1').Count -eq 1) -and $licText.StartsWith('{\rtf1')
    'Licencia: terminos + GPL-3.0 completos en el texto' =
        $licText.Contains('GNU GENERAL PUBLIC LICENSE') -and
        $licText.Contains('OpenWave') -and
        $licText.Contains('END OF TERMS AND CONDITIONS')
    'Licencia: llaves RTF balanceadas' =
        ([regex]::Matches($licText, '\{').Count -eq [regex]::Matches($licText, '\}').Count)
    'Licencia: aceptacion obligatoria (casilla LicenseAccepted)' =
        [bool]($controls | Where-Object { $_[0] -eq 'LicenseAgreementDlg' -and $_[8] -eq 'LicenseAccepted' })
    'Clave HKCU Run para iniciar con Windows' =
        [bool]($reg | Where-Object { $_[2] -eq 'Software\Microsoft\Windows\CurrentVersion\Run' })
    'Registro AppUserModelId (DisplayName OpenWave, agrupacion en TV)' =
        [bool]($reg | Where-Object { $_[2] -eq 'Software\Classes\AppUserModelId\com.soundwave.app' -and $_[3] -eq 'DisplayName' -and $_[4] -eq 'OpenWave' })
    'Limpieza de INSTALLDIR (RemoveFile RemoveInstallDir, Path, uninstall)' =
        [bool]($rfile | Where-Object { $_[0] -eq 'RemoveInstallDir' -and $_[1] -eq 'Path' -and $_[3] -eq 'INSTALLDIR' -and $_[4] -eq '2' })
    'Escritorio con su RemoveFile + limpieza del .lnk heredado de Inicio' =
        [bool]($rfile | Where-Object { $_[1] -eq 'ApplicationShortcutDesktop' -and $_[3] -eq 'DesktopFolder' }) -and
        (-not [bool]($rfile | Where-Object { $_[1] -eq 'ApplicationShortcut' })) -and
        [bool]($rfile | Where-Object { $_[0] -eq 'A_RemoveLegacyStartLnk' -and $_[1] -eq 'CMP_LegacyStartCleanup' -and $_[2] -eq '*.lnk' -and $_[3] -eq 'ApplicationProgramsFolder' -and $_[4] -eq '1' }) -and
        [bool]($rfile | Where-Object { $_[0] -eq 'Z_RemoveLegacyStartFolder' -and $_[1] -eq 'CMP_LegacyStartCleanup' -and $_[2] -eq '' -and $_[3] -eq 'ApplicationProgramsFolder' -and $_[4] -eq '1' }) -and
        [bool]($featComps | Where-Object { $_[0] -eq 'MainProgram' -and $_[1] -eq 'CMP_LegacyStartCleanup' }) -and
        ((@($rfile | ForEach-Object { $_[0] })).IndexOf('A_RemoveLegacyStartLnk') -lt (@($rfile | ForEach-Object { $_[0] })).IndexOf('Z_RemoveLegacyStartFolder'))
    'CMP_UninstallShortcut (Desinstalar) movido a MainProgram' =
        [bool]($featComps | Where-Object { $_[0] -eq 'MainProgram' -and $_[1] -eq 'CMP_UninstallShortcut' })
    'Payload con mas de 5000 ficheros' = ($files.Count -gt 5000)
    'Binario OpenWave.exe en la tabla File' =
        [bool]($files | Where-Object { ([string]$_[2]) -like '*OpenWave.exe*' })
    'Carpeta de instalacion OpenWave (Directory INSTALLDIR)' =
        [bool]($dirs | Where-Object { $_[0] -eq 'INSTALLDIR' -and ([string]$_[2]) -like '*OpenWave*' })
    'Payload: backend empaquetado (backend\main.py)' = ($payBackend.Count -eq 1)
    'Payload: main.py del MSI identico al staging (sin backend viejo)' = $payBackendFresh
    'Payload: Python embebido (runtime\python.exe)' = ($payPython.Count -eq 1)
    'Payload: ffmpeg (ffmpeg\ffmpeg.exe)' = ($payFfmpeg.Count -eq 1)
    'Mantenimiento: bienvenida y seleccion (MaintenanceWelcome/TypeDlg)' =
        ('MaintenanceWelcomeDlg' -in $dialogNames) -and ('MaintenanceTypeDlg' -in $dialogNames)
    'Mantenimiento: tres botones Cambiar / Reparar / Quitar' =
        (@($maintControls | Where-Object { $_[1] -eq 'ChangeButton' }).Count -eq 1) -and
        (@($maintControls | Where-Object { $_[1] -eq 'RepairButton' }).Count -eq 1) -and
        (@($maintControls | Where-Object { $_[1] -eq 'RemoveButton' }).Count -eq 1)
    'Mantenimiento: ChangeButton navega a OptionsDlg (Order 2)' =
        [bool](Ev 'MaintenanceTypeDlg' 'ChangeButton' 'NewDialog' | Where-Object { $_[3] -eq 'OptionsDlg' -and $_[5] -eq '2' })
    'Progreso: tabla ActionText con textos de estado (>= 60 filas)' =
        ($actext.Count -ge 60)
    'Progreso: InstallFiles con descripcion y plantilla con [1]/[9]/[6]' =
        [bool]($installFilesTxt | Where-Object {
            $_[1] -and ([string]$_[1]).Length -gt 5 -and ([string]$_[2]) -like '*[[]1[]]*'
        })
    'Progreso: textos de estado en espanol' =
        [bool]($installFilesTxt | Where-Object { ([string]$_[1]) -like '*opiand*' })
    'Tipografia: WixUI_Font_Title sin negrita (StyleBits vacio)' =
        [bool]($titleStyle | Where-Object { [string]$_[4] -eq '' })
    'Tipografia: WixUI_Font_Bigger a 11 pt' =
        [bool]($bigStyle | Where-Object { $_[2] -eq '11' })
    'Licencia: texto a 9 pt y compacto (\fs18, cierres de parrafo \sa160)' =
        $licText.Contains('\fs18') -and $licText.Contains('\sa160')
    'Grafico banner 493x58 de marca (hash == build\windows\banner.bmp)' = $artBannerOk
    'Grafico dialogo 493x312 de marca (hash == build\windows\dialog.bmp)' = $artDialogOk
    'Datos: Directory CommonAppDataFolder -> OPENWAVEDATADIR OpenWave' =
        [bool]($dirs | Where-Object { $_[0] -eq 'OPENWAVEDATADIR' -and ([string]$_[1]) -eq 'CommonAppDataFolder' -and ([string]$_[2]) -like '*OpenWave*' })
    'Datos: CMP_DataDir con Guid explicito (no «*») y en la feature MainProgram' =
        [bool]($comps | Where-Object { $_[0] -eq 'CMP_DataDir' -and ([string]$_[1]) -match '^\{[0-9A-Fa-f-]{36}\}$' }) -and
        [bool]($featComps | Where-Object { $_[0] -eq 'MainProgram' -and $_[1] -eq 'CMP_DataDir' })
    'Datos: SAC FixAcl = icacls con SID *S-1-5-32-545 + /T (locale-proof)' =
        [bool]($cas | Where-Object { $_[0] -eq 'FixAcl' -and ([string]$_[3]) -like '*icacls*' -and ([string]$_[3]) -like '*S-1-5-32-545*' -and ([string]$_[3]) -like '*/T*' -and ([string]$_[3]) -like '*CustomActionData*' })
    'Datos: FixAcl diferida+sobre sistema, alimentada por SetFixAclData y salvo REMOVE' =
        [bool]($cas | Where-Object { $_[0] -eq 'FixAcl' -and (([int]$_[1]) -band 3072) -eq 3072 }) -and
        [bool]($cas | Where-Object { $_[0] -eq 'SetFixAclData' -and (([string]$_[2]) -eq 'CustomActionData' -or ([string]$_[3]) -eq 'CustomActionData') }) -and
        [bool]($iseq | Where-Object { $_[0] -eq 'FixAcl' -and ([string]$_[1]) -like '*NOT REMOVE*' }) -and
        [bool]($iseq | Where-Object { $_[0] -eq 'SetFixAclData' })

    # ── Identidad de paquete sparse (plan C: un solo grupo «OpenWave») ──
    # El msix/.cer/script llegan como resources al INSTALLDIR; RegisterIdentity
    # llama al script -Mode Register (importa confianza + Remove-Add del
    # paquete, con log en openwave-identity.log) y UnregisterIdentity a
    # -Mode Unregister. La forma inline -Command se retiro: fallaba solo
    # dentro de msiexec (exit 1). Ver scripts\package-appx.ps1 y
    # docs/PERFORMANCE.md §10.
    'Identidad: openwave-identity.msix en el payload (INSTALLDIR)' =
        [bool]($files | Where-Object { ([string]$_[2]) -like '*openwave-identity.msix*' })
    'Identidad: openwave-identity.cer en el payload (confianza)' =
        [bool]($files | Where-Object { ([string]$_[2]) -like '*openwave-identity.cer*' })
    'Identidad: script openwave-identity-ca.ps1 en el payload' =
        [bool]($files | Where-Object { ([string]$_[2]) -like '*openwave-identity-ca.ps1*' })
    'Identidad: SAC RegisterIdentity = powershell -File del script -Mode Register' =
        [bool]($cas | Where-Object {
            $_[0] -eq 'RegisterIdentity' -and
            ([string]$_[3]) -like '*powershell.exe*' -and
            ([string]$_[3]) -like '*-File*' -and
            ([string]$_[3]) -like '*openwave-identity-ca.ps1*' -and
            ([string]$_[3]) -like '*-Mode Register*'
        })
    'Identidad: RegisterIdentity corre con NOT REMOVE y tras InstallFinalize' =
        [bool]($iseq | Where-Object { $_[0] -eq 'RegisterIdentity' -and ([string]$_[1]) -like '*NOT REMOVE*' }) -and
        [bool]($iseqSeq | Where-Object {
            $_[0] -eq 'RegisterIdentity' -and
            $_[1] -match '^\d+$' -and [int]$_[1] -gt
            ([int](@($iseqSeq | Where-Object { $_[0] -eq 'InstallFinalize' })[0][1]))
        })
    'Identidad: SAC UnregisterIdentity al desinstalar (REMOVE=ALL, sin en upgrade)' =
        [bool]($cas | Where-Object {
            $_[0] -eq 'UnregisterIdentity' -and
            ([string]$_[3]) -like '*openwave-identity-ca.ps1*' -and
            ([string]$_[3]) -like '*-Mode Unregister*'
        }) -and
        [bool]($iseq | Where-Object { $_[0] -eq 'UnregisterIdentity' -and ([string]$_[1]) -like '*REMOVE*ALL*' -and ([string]$_[1]) -like '*UPGRADINGPRODUCTCODE*' })
    'Identidad: autolanzado tras RegisterIdentity (arranca ya con identidad)' =
        [bool]($iseqSeq | Where-Object {
            $_[0] -eq 'LaunchApplication' -and $_[1] -match '^\d+$' -and
            [int]$_[1] -gt ([int](@($iseqSeq | Where-Object { $_[0] -eq 'RegisterIdentity' })[0][1]))
        })

    # ── Icono del taskbar (esquinas transparentes): set completo + PRI externo ──
    # Quinta causa (2026-10-07, docs/PERFORMANCE.md §10): en un paquete SPARSE
    # (AllowExternalContent + -ExternalLocation) el taskbar solo resuelve
    # variantes calificadas si resources.pri (y sus satellites) estan en la
    # RAIZ de ExternalLocation: MRT lee el indice desde el contenido externo y,
    # si el PRI solo va dentro del msix, el indice queda vacio: sin candidatos
    # targetsize/altform el shell escala la base del manifiesto y la compone
    # sobre la placa del BackgroundColor (#0a0a0f -> esquinas negras;
    # «transparent» -> placa del accent color del usuario, WindowsAppSDK#5984;
    # el esquema solo admite #RRGGBB o colores con nombre: el alfa se rechaza
    # con C00CE169). Con el PRI externo y el set completo, el taskbar pide el
    # targetsize exacto (24 px al 100 %) y usa altform-unplated -> esquinas
    # iguales al color real de la barra. contrast-*/scale-* completan la
    # paridad con paquetes sanos de referencia (Windows Terminal MSIX, cuyo
    # PRI declara Contrast y Scale; el nuestro no los declaraba). Task Manager
    # no depende de esto (su icono viene del exe). Ver tambien
    # scripts/package-appx.ps1.
    'Icono taskbar: msix con el set targetsize completo (105 = 7 formas x 15 tamanos)' =
        @($msixNames | Where-Object { $_ -like '*Square44x44Logo.targetsize-*.png' }).Count -eq 105
    'Icono taskbar: msix con la variante exacta del taskbar (targetsize-24 unplated)' =
        [bool]($msixNames | Where-Object { $_ -like '*Square44x44Logo.targetsize-24_altform-unplated.png' })
    'Icono taskbar: msix con Square44x44Logo.targetsize-44_altform-unplated.png' =
        [bool]($msixNames | Where-Object { $_ -like '*Square44x44Logo.targetsize-44_altform-unplated.png' })
    'Icono taskbar: msix con contrast-* (>=120) y scale-* (15) — paridad Terminal' =
        (@($msixNames | Where-Object { $_ -like '*_contrast-black.png' -or $_ -like '*_contrast-white.png' }).Count -ge 120) -and
        (@($msixNames | Where-Object { $_ -like '*Square44x44Logo.scale-*.png' }).Count -eq 15)
    'Icono taskbar: msix con la familia AppList completa (105 variantes)' =
        @($msixNames | Where-Object { $_ -like '*AppList.targetsize-*.png' }).Count -eq 105
    'Icono taskbar: msix con resources.pri (resuelve assets unplated)' =
        [bool]($msixNames | Where-Object { $_ -eq 'resources.pri' })
    'Icono taskbar: manifiesto del msix con BackgroundColor transparent' =
        $msixManifestText.Contains('BackgroundColor="transparent"')
    'Icono taskbar: MSI instala Assets en ExternalLocation (base + unplated)' =
        [bool]($fileSizes.Keys | Where-Object { $_ -like '*\Assets\Square44x44Logo.png' }) -and
        [bool]($fileSizes.Keys | Where-Object { $_ -like '*\Assets\Square44x44Logo.targetsize-44_altform-unplated.png' })
    'Icono taskbar: MSI instala el set targetsize completo (105 variantes)' =
        @($fileSizes.Keys | Where-Object { $_ -like '*\Assets\Square44x44Logo.targetsize-*.png' }).Count -eq 105
    'Icono taskbar: MSI instala AppList completo en ExternalLocation (105)' =
        @($fileSizes.Keys | Where-Object { $_ -like '*\Assets\AppList.targetsize-*.png' }).Count -eq 105
    'Icono taskbar: resources.pri + 4 satellites en la RAIZ de ExternalLocation' =
        $fileSizes.ContainsKey($instRoot + '\resources.pri') -and
        @(@('125', '150', '200', '400') | Where-Object {
            -not $fileSizes.ContainsKey($instRoot + '\resources.scale-' + $_ + '.pri')
        }).Count -eq 0
    'Icono taskbar: PRI instalado identico al de staging (sin desfase de build)' =
        $priStagingFresh
    'Icono taskbar: PRI declara AlternateForm, Contrast, Scale y TargetSize' =
        $priQualsOk
}

Write-Host ''
$bad = 0
foreach ($k in $checks.Keys) {
    $ok = [bool]$checks[$k]
    if (-not $ok) { $bad++ }
    Write-Host ('[{0}] {1}' -f $(if ($ok) { 'OK   ' } else { 'FALLO' }), $k)
}
Write-Host ''
if ($bad -eq 0) {
    Write-Host "Todas las comprobaciones pasan ($($checks.Count))."
    exit 0
}
Write-Host "$bad comprobaciones fallan (de $($checks.Count))."
exit 1
