<#
.SYNOPSIS
  Post-proceso del MSI enlazado: ajustes de tipografia que WiX no deja autorar.

.DESCRIPTION
  El elemento <TextStyle> solo acepta FaceName/Size/Bold/Italic/Color y no se
  puede REDEFINIR una TextStyle que ya trae la libreria WixUI (duplicaria la
  clave primaria en light). La tabla TextStyle del MSI resultante si admite
  UPDATE via COM de WindowsInstaller.Installer, asi que package-windows.ps1
  invoca este script justo despues de `npx tauri build`:

    - WixUI_Font_Title  (Tahoma 9 de los titulos de cada pagina):
      StyleBits 1 = negrita (verificado con candle: Bold=1, Italic=2). Se
      pone a NULL: los titulos dejan de verse en negrita.
    - WixUI_Font_Bigger (Tahoma 12 de los titulos grandes: bienvenida,
      preparacion, salida): 12 -> 11 pt, algo mas proporcionados.

  No toca WixUI_Font_Normal (Tahoma 8 del texto corriente).

.PARAMETER MsiPath
  Ruta del .msi ya enlazado (bundle\msi\*.msi).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\msi-postprocess.ps1 `
    -MsiPath build\...\SoundWave_1.0.0_x64_en-US.msi
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$MsiPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $MsiPath)) {
    throw "No existe el MSI: $MsiPath"
}

$installer = New-Object -ComObject WindowsInstaller.Installer
# Modo 1 = lectura/escritura (MSIOPENDATABASEMODE_READWRITE); el 0 es de solo
# lectura y cualquier UPDATE falla en Execute con COMException.
$db = $installer.GetType().InvokeMember(
    'OpenDatabase', 'InvokeMethod', $null, $installer, @($MsiPath, 1))

function Invoke-MsiSql([string]$sql) {
    $view = $db.GetType().InvokeMember(
        'OpenView', 'InvokeMethod', $null, $db, @($sql))
    [void]$view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null)
    return $view
}

function Get-MsiScalar([string]$sql) {
    $view = Invoke-MsiSql $sql
    $rec = $view.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $view, $null)
    if ($null -eq $rec) { return $null }
    return $rec.GetType().InvokeMember('StringData', 'GetProperty', $null, $rec, @(1))
}

Write-Host '--- Post-proceso MSI: tipografia ---'

# Estado previo (si falla la tabla, no hay nada que hacer).
$titleBefore = Get-MsiScalar "SELECT StyleBits FROM TextStyle WHERE TextStyle = 'WixUI_Font_Title'"
$bigBefore   = Get-MsiScalar "SELECT Size FROM TextStyle WHERE TextStyle = 'WixUI_Font_Bigger'"
Write-Host "  WixUI_Font_Title.StyleBits: '$titleBefore' -> NULL (quita negrita)"
Write-Host "  WixUI_Font_Bigger.Size     : '$bigBefore' -> 11 pt"

[void](Invoke-MsiSql "UPDATE TextStyle SET StyleBits = NULL WHERE TextStyle = 'WixUI_Font_Title'")
[void](Invoke-MsiSql "UPDATE TextStyle SET Size = 11 WHERE TextStyle = 'WixUI_Font_Bigger'")
$db.GetType().InvokeMember('Commit', 'InvokeMethod', $null, $db, $null)

# Verificacion inmediata sobre el propio fichero.
$titleAfter = Get-MsiScalar "SELECT StyleBits FROM TextStyle WHERE TextStyle = 'WixUI_Font_Title'"
$bigAfter   = Get-MsiScalar "SELECT Size FROM TextStyle WHERE TextStyle = 'WixUI_Font_Bigger'"
if ($null -ne $titleAfter -and $titleAfter -ne '') {
    throw "WixUI_Font_Title sigue con StyleBits='$titleAfter' tras el UPDATE."
}
if ($bigAfter -ne '11') {
    throw "WixUI_Font_Bigger.Size='$bigAfter' (se esperaba 11)."
}
Write-Host '  OK: estilos actualizados y verificados.'
