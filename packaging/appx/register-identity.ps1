<#
.SYNOPSIS
  SAC de identidad de paquete sparse de OpenWave (la invoca el MSI).

.DESCRIPTION
  Se instala en el INSTALLDIR junto a openwave-identity.msix/.cer y lo llama
  src-tauri/windows/main.wxs como:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive ^
                   -File "[INSTALLDIR]openwave-identity-ca.ps1" -Mode Register|Unregister

  Motivo de ser un fichero -File y no un comando inline -Command: la forma
  inline (try/catch pegado en el ExeCommand) fallaba CONTEXTO-EspecificAMENTE
  al correr dentro de msiexec (exit 1 sin llegar a ejecutar ni Remove ni Add;
  verificado: el mismo string ejecutado fuera daba exit 0). Con -File el
  comando es corto, con ruta entre comillas dobles de CreateProcess, y todo
  el detalle queda en openwave-identity.log (y en TEMP si el INSTALLDIR ya
  no existe, como al desinstalar).

  -Mode Register   : importa la confianza del certificado (por usuario,
                     CurrentUser\TrustedPeople; sin ella Add-AppxPackage da
                     0x800B0109) y registra el paquete con
                     Remove-Add (idempotente y actualiza la ExternalLocation;
                     con la misma version sin remover daria 0x80073CF9).
  -Mode Unregister : quita el paquete (desinstalacion normal; el MSI no lo
                     invoca en upgrades via NOT UPGRADINGPRODUCTCODE).

  Return=ignore en el MSI: si AppX fallara la instalacion NO se rompe (la app
  quedaria sin identidad y Task Manager separaria los hijos de WebView2 otra
  vez). El exit code solo es senal en el log de msiexec; el detalle esta en
  openwave-identity.log.

.NOTES
  Fichero 100% ASCII a proposito (Windows PowerShell 5.1 lo lee como ANSI si
  no hay BOM: los acentos UTF-8 romperian el parseo). Ver
  docs/PERFORMANCE.md seccion 10.
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Register', 'Unregister')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot = INSTALLDIR (en Register). En Unregister el INSTALLDIR puede
# ya no existir: Log cae a TEMP para no romper la desinstalacion.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $env:TEMP }
$log = Join-Path $scriptDir 'openwave-identity.log'

function Log([string]$msg) {
    $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' [' + $Mode + '] ' + $msg
    try { Add-Content -LiteralPath $log -Value $line } catch {
        try { Add-Content -LiteralPath (Join-Path $env:TEMP 'openwave-identity.log') -Value $line } catch { }
    }
}

try {
    Log ('start dir=' + $scriptDir)
    if ($Mode -eq 'Register') {
        $cer  = Join-Path $scriptDir 'openwave-identity.cer'
        $msix = Join-Path $scriptDir 'openwave-identity.msix'
        if (-not (Test-Path -LiteralPath $msix)) { throw ('falta el paquete: ' + $msix) }

        try {
            Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\TrustedPeople -ErrorAction SilentlyContinue | Out-Null
            Log 'cert: confianza presente en CurrentUser\TrustedPeople'
        } catch { Log ('cert: ERR ' + $_.Exception.Message) }

        try {
            Get-AppxPackage -Name OpenWave | Remove-AppxPackage -ErrorAction Stop
            Log 'remove: ok (o paquete previo inexistente)'
        } catch { Log ('remove: ' + $_.Exception.Message) }

        try {
            # ExternalLocation = esta misma carpeta (el <msix> del exe exige
            # que el payload este donde se ejecuta).
            Add-AppxPackage -Path $msix -ExternalLocation ($scriptDir + '\') -ErrorAction Stop
            Log 'add: ok'
        } catch { Log ('add: ERR ' + $_.Exception.Message); exit 1 }

        Log 'done'
        exit 0
    }

    # Unregister
    try {
        Get-AppxPackage -Name OpenWave | Remove-AppxPackage -ErrorAction Stop
        Log 'remove: ok'
    } catch { Log ('remove: ' + $_.Exception.Message) }
    Log 'done'
    exit 0
} catch {
    Log ('FATAL: ' + $_.Exception.Message)
    exit 1
}
