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

  -Mode Register   : importa la confianza del certificado y registra el
                     paquete con Remove-Add (idempotente y actualiza la
                     ExternalLocation; con la misma version sin remover daria
                     0x80073CF9).
                     La confianza se importa en DOS almacenes:
                       - CurrentUser\TrustedPeople (no requiere elevacion).
                       - LocalMachine\TrustedPeople (con elevacion), que es el
                         que Add-AppxPackage exige de verdad para validar la
                         firma (2026-10-19: con el cert solo en CurrentUser el
                         alta fallo con 0x800B0109 y el paquete quedo fuera).
                     Cada build renueva el certificado autofirmado (CN=
                     OpenWave), asi que la confianza se comprueba POR
                     THUMBPRINT y no por presencia de un cert del mismo
                     subject: si no esta el de esta build, se importa. Si el
                     alta vuelve a fallar con 0x800B0109 se re-importa y se
                     reintenta una vez.
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

# Importa el certificado de la build en un almacen y comprueba que quedo por
# thumbprint (si ya estaba el de OTRA build con el mismo subject, Import no
# cambia nada y hay que saberlo). Devuelve $true si quedo presente.
function ImportaConfianza([string]$store, [string]$cerPath, [string]$thumb) {
    try {
        Import-Certificate -FilePath $cerPath -CertStoreLocation $store -ErrorAction Stop | Out-Null
    } catch { }
    $presente = Get-ChildItem $store -ErrorAction SilentlyContinue |
        Where-Object { $_.Thumbprint -eq $thumb }
    return [bool]$presente
}

function EsElevado {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

try {
    Log ('start dir=' + $scriptDir)
    if ($Mode -eq 'Register') {
        $cer  = Join-Path $scriptDir 'openwave-identity.cer'
        $msix = Join-Path $scriptDir 'openwave-identity.msix'
        if (-not (Test-Path -LiteralPath $msix)) { throw ('falta el paquete: ' + $msix) }

        # Thumbprint del cert de ESTA build (cada build renueva el certificado).
        $thumb = ''
        try {
            $thumb = (Get-PfxCertificate -FilePath $cer).Thumbprint
        } catch { Log ('cert: ERR leyendo thumbprint ' + $_.Exception.Message) }
        Log ('cert: thumbprint=' + $thumb)

        $okUser = ImportaConfianza 'Cert:\CurrentUser\TrustedPeople' $cer $thumb
        Log ('cert: CurrentUser\TrustedPeople ' + $(if ($okUser) { 'presente' } else { 'NO quedo' }))

        $okMachine = $false
        if (EsElevado) {
            $okMachine = ImportaConfianza 'Cert:\LocalMachine\TrustedPeople' $cer $thumb
            Log ('cert: LocalMachine\TrustedPeople ' + $(if ($okMachine) { 'presente' } else { 'NO quedo' }))
        } else {
            Log 'cert: sin elevacion: LocalMachine\TrustedPeople no se toca'
        }

        try {
            Get-AppxPackage -Name OpenWave | Remove-AppxPackage -ErrorAction Stop
            Log 'remove: ok (o paquete previo inexistente)'
        } catch { Log ('remove: ' + $_.Exception.Message) }

        for ($intento = 1; $intento -le 2; $intento++) {
            try {
                # ExternalLocation = esta misma carpeta (el <msix> del exe exige
                # que el payload este donde se ejecuta). SIN barra final: con
                # ($scriptDir + '\') el boton de la barra de tareas no pinta el
                # icono del paquete (renderiza un punto/cuadrado diminuto) aunque
                # el registro del paquete quede IDENTICO y la extraccion via
                # IShellItemImageFactory devuelva la onda morada; sin la barra si
                # pinta. Verificado en vivo con las tres parejas 2026-10-05.
                Add-AppxPackage -Path $msix -ExternalLocation $scriptDir -ErrorAction Stop
                Log 'add: ok'
                break
            } catch {
                $err = $_.Exception.Message
                Log ('add intento ' + $intento + ': ERR ' + $err)
                if ($intento -eq 1 -and $err -like '*0x800B0109*') {
                    # Confianza rechazada: re-importar (y, con elevacion, en
                    # LocalMachine, donde la validacion mira de verdad) y
                    # repetir el alta una sola vez.
                    $okUser = ImportaConfianza 'Cert:\CurrentUser\TrustedPeople' $cer $thumb
                    Log ('cert: reimport CurrentUser ' + $(if ($okUser) { 'presente' } else { 'NO quedo' }))
                    if (EsElevado) {
                        $okMachine = ImportaConfianza 'Cert:\LocalMachine\TrustedPeople' $cer $thumb
                        Log ('cert: reimport LocalMachine ' + $(if ($okMachine) { 'presente' } else { 'NO quedo' }))
                    }
                    continue
                }
                exit 1
            }
        }

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
