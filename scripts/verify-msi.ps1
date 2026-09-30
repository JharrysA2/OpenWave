<#
.SYNOPSIS
    Verificacion estatica del MSI de SoundWave sin instalarlo (36 comprobaciones).

.DESCRIPTION
    Lee las tablas del .msi con el objeto COM WindowsInstaller.Installer y
    comprueba el flujo del asistente, los valores por defecto de las casillas,
    la licencia embebida y la limpieza de la carpeta de instalacion. Sale con
    codigo 0 si todo pasa y 1 si algo falla.

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
    build\windows\SoundWave-*.msi.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\verify-msi.ps1
#>
param([string]$MsiPath = '')
$ErrorActionPreference = 'Stop'

if (-not $MsiPath) {
    $dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'build\windows'
    $found = @(Get-ChildItem -Path $dir -Filter 'SoundWave-*.msi' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending)
    if ($found.Count -eq 0) { throw "No hay ningun SoundWave-*.msi en $dir; compila antes con scripts\package-windows.ps1" }
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
$reg      = @(Invoke-MsiQuery $db 'SELECT * FROM Registry')     # 0 Registry 1 Root 2 Key 3 Name_ 4 Value 5 Component_
$rfile    = @(Invoke-MsiQuery $db 'SELECT * FROM RemoveFile')   # 0 RemoveFile 1 Component_ 2 FileName 3 DirProperty 4 InstallMode
$files    = @(Invoke-MsiQuery $db 'SELECT * FROM File')
$comps    = @(Invoke-MsiQuery $db 'SELECT * FROM Component')  # 0 Component 1 ComponentId 2 Directory_
$dirs     = @(Invoke-MsiQuery $db 'SELECT * FROM Directory')  # 0 Directory 1 Directory_Parent 2 DefaultDir

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
$flow = @($events | Where-Object { $_[0] -in @('InstallDirDlg', 'VerifyReadyDlg', 'OptionsDlg', 'WelcomeDlg', 'LicenseAgreementDlg') })

# Texto RTF de la licencia: light inyecta el contenido de LICENSE.rtf (generado
# por Tauri a partir de build/windows/licencia.txt) en el control LicenseText.
$licRow = @($controls | Where-Object { $_[0] -eq 'LicenseAgreementDlg' -and $_[1] -eq 'LicenseText' })
$licText = ''
if ($licRow.Count -gt 0) { $licText = [string]$licRow[0][9] }

Show 'Dialog' $dialogNames 30
Show 'ControlEvent del flujo' $flow 40 @(0, 1, 2, 3, 4, 5)
Show 'Control de OptionsDlg' $optControls 20 @(0, 1, 2, 8, 9)
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
    'OptionsDlg.Next: AddLocal StartMenuShortcut (1)' =
        [bool](Ev 'OptionsDlg' 'Next' 'AddLocal' | Where-Object { $_[3] -eq 'StartMenuShortcut' -and $_[5] -eq '1' })
    'OptionsDlg.Next: Remove StartMenuShortcut (2)' =
        [bool](Ev 'OptionsDlg' 'Next' 'Remove' | Where-Object { $_[3] -eq 'StartMenuShortcut' -and $_[5] -eq '2' })
    'OptionsDlg.Next: AddLocal DesktopShortcut (3)' =
        [bool](Ev 'OptionsDlg' 'Next' 'AddLocal' | Where-Object { $_[3] -eq 'DesktopShortcut' -and $_[5] -eq '3' })
    'OptionsDlg.Next: Remove DesktopShortcut (4)' =
        [bool](Ev 'OptionsDlg' 'Next' 'Remove' | Where-Object { $_[3] -eq 'DesktopShortcut' -and $_[5] -eq '4' })
    'OptionsDlg.Next: AddLocal StartupShortcut (5)' =
        [bool](Ev 'OptionsDlg' 'Next' 'AddLocal' | Where-Object { $_[3] -eq 'StartupShortcut' -and $_[5] -eq '5' })
    'OptionsDlg.Next: Remove StartupShortcut (6)' =
        [bool](Ev 'OptionsDlg' 'Next' 'Remove' | Where-Object { $_[3] -eq 'StartupShortcut' -and $_[5] -eq '6' })
    'OptionsDlg.Next: NewDialog VerifyReadyDlg (10, el mayor)' =
        [bool](Ev 'OptionsDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'VerifyReadyDlg' -and $_[5] -eq '10' })
    'OptionsDlg: exactamente 3 checkboxes' =
        (@($optControls | Where-Object { $_[2] -eq 'CheckBox' }).Count -eq 3)
    'Checkbox sobre INSTALL_STARTMENU / INSTALL_DESKTOP / INSTALL_STARTUP' =
        [bool]($optControls | Where-Object { $_[2] -eq 'CheckBox' -and $_[8] -eq 'INSTALL_STARTMENU' }) -and
        [bool]($optControls | Where-Object { $_[2] -eq 'CheckBox' -and $_[8] -eq 'INSTALL_DESKTOP' }) -and
        [bool]($optControls | Where-Object { $_[2] -eq 'CheckBox' -and $_[8] -eq 'INSTALL_STARTUP' })
    'Textos de casillas en espanol' =
        [bool]($optControls | Where-Object { $_[9] -like 'Crear un acceso*' }) -and
        [bool]($optControls | Where-Object { $_[9] -eq 'Iniciar SoundWave con Windows' })
    'Feature StartMenuShortcut Level 1' =
        [bool]($features | Where-Object { $_[0] -eq 'StartMenuShortcut' -and $_[5] -eq '1' })
    'Feature DesktopShortcut Level 1' =
        [bool]($features | Where-Object { $_[0] -eq 'DesktopShortcut' -and $_[5] -eq '1' })
    'Feature StartupShortcut Level 101 (desmarcada)' =
        [bool]($features | Where-Object { $_[0] -eq 'StartupShortcut' -and $_[5] -eq '101' })
    'INSTALL_STARTUP sin declarar (default off)' = -not $propOf.ContainsKey('INSTALL_STARTUP')
    'INSTALL_STARTMENU=1 y INSTALL_DESKTOP=1 (por defecto activas)' =
        ($propOf['INSTALL_STARTMENU'] -eq '1') -and ($propOf['INSTALL_DESKTOP'] -eq '1')
    'Licencia: flujo Welcome -> License -> InstallDir' =
        [bool](Ev 'WelcomeDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'LicenseAgreementDlg' }) -and
        [bool](Ev 'LicenseAgreementDlg' 'Next' 'NewDialog' | Where-Object { $_[3] -eq 'InstallDirDlg' })
    'Licencia: control LicenseText con RTF inline (un solo {\rtf1)' = [bool]($licText) -and
        ([regex]::Matches($licText, '\{\\rtf1').Count -eq 1) -and $licText.StartsWith('{\rtf1')
    'Licencia: terminos + GPL-3.0 completos en el texto' =
        $licText.Contains('GNU GENERAL PUBLIC LICENSE') -and
        $licText.Contains('SoundWave') -and
        $licText.Contains('END OF TERMS AND CONDITIONS')
    'Licencia: llaves RTF balanceadas' =
        ([regex]::Matches($licText, '\{').Count -eq [regex]::Matches($licText, '\}').Count)
    'Licencia: aceptacion obligatoria (casilla LicenseAccepted)' =
        [bool]($controls | Where-Object { $_[0] -eq 'LicenseAgreementDlg' -and $_[8] -eq 'LicenseAccepted' })
    'Clave HKCU Run para iniciar con Windows' =
        [bool]($reg | Where-Object { $_[2] -eq 'Software\Microsoft\Windows\CurrentVersion\Run' })
    'Limpieza de INSTALLDIR (RemoveFile RemoveInstallDir, Path, uninstall)' =
        [bool]($rfile | Where-Object { $_[0] -eq 'RemoveInstallDir' -and $_[1] -eq 'Path' -and $_[3] -eq 'INSTALLDIR' -and $_[4] -eq '2' })
    'Accesos directos con su RemoveFile (menu inicio y escritorio)' =
        [bool]($rfile | Where-Object { $_[1] -eq 'ApplicationShortcutDesktop' -and $_[3] -eq 'DesktopFolder' }) -and
        [bool]($rfile | Where-Object { $_[1] -eq 'ApplicationShortcut' -and $_[3] -eq 'ApplicationProgramsFolder' })
    'Payload con mas de 5000 ficheros' = ($files.Count -gt 5000)
    'Payload: backend empaquetado (backend\main.py)' = ($payBackend.Count -eq 1)
    'Payload: main.py del MSI identico al staging (sin backend viejo)' = $payBackendFresh
    'Payload: Python embebido (runtime\python.exe)' = ($payPython.Count -eq 1)
    'Payload: ffmpeg (ffmpeg\ffmpeg.exe)' = ($payFfmpeg.Count -eq 1)
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
