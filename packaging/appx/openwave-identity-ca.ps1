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
  el detalle queda en %PROGRAMDATA%\OpenWave\openwave-identity.log (y en
  INSTALLDIR/TEMP si aun no se puede escribir ahi, como al desinstalar).

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
# ya no existir; por eso el log intenta primero ProgramData y luego TEMP.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $env:TEMP }
# El log va a %PROGRAMDATA%\OpenWave (la misma carpeta que openwave.log) para
# que sobreviva a una instalacion fallida y sea facil de localizar. Si aun no
# se puede crear/escribir ahi, cae al INSTALLDIR y luego a TEMP.
$dataDir = if ($env:ProgramData) { Join-Path $env:ProgramData 'OpenWave' } else { '' }
$log = $null
if ($dataDir) {
    try {
        New-Item -ItemType Directory -Force -Path $dataDir -ErrorAction Stop | Out-Null
        $prueba = Join-Path $dataDir ('.identity-write-test-' + $PID)
        Set-Content -LiteralPath $prueba -Value '' -ErrorAction Stop
        Remove-Item -LiteralPath $prueba -Force -ErrorAction SilentlyContinue
        $log = Join-Path $dataDir 'openwave-identity.log'
    } catch { $log = $null }
}
if (-not $log) { $log = Join-Path $scriptDir 'openwave-identity.log' }

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

function ConfianzaPresente([string]$store, [string]$thumb) {
    if (-not $thumb) { return $false }
    $presente = Get-ChildItem $store -ErrorAction SilentlyContinue |
        Where-Object { $_.Thumbprint -eq $thumb }
    return [bool]$presente
}

# La confianza que Add-AppxPackage valida de verdad es LocalMachine. El MSI
# la importa con un CA diferido y elevado antes de llamar a este script; si
# por lo que sea no llego (reparacion antigua, politica del equipo), aqui se
# pide elevacion SOLO para el certificado. El alta del paquete sigue en el
# usuario que instala: Add-AppxPackage registra por usuario.
function AseguraConfianzaMaquina([string]$cerPath, [string]$thumb) {
    if (ConfianzaPresente 'Cert:\LocalMachine\TrustedPeople' $thumb) {
        Log 'cert: LocalMachine\TrustedPeople presente'
        return $true
    }
    if (EsElevado) {
        $ok = ImportaConfianza 'Cert:\LocalMachine\TrustedPeople' $cerPath $thumb
        Log ('cert: LocalMachine\TrustedPeople ' + $(if ($ok) { 'presente' } else { 'NO quedo' }))
        return $ok
    }
    Log 'cert: LocalMachine ausente; importando con elevacion'
    try {
        $arg = "Import-Certificate -FilePath '" + $cerPath +
            "' -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null"
        $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -PassThru -Wait `
            -WindowStyle Hidden -ArgumentList @(
                '-NoProfile', '-NonInteractive', '-Command', $arg)
        $ok = ($p.ExitCode -eq 0) -and
            (ConfianzaPresente 'Cert:\LocalMachine\TrustedPeople' $thumb)
        Log ('cert: LocalMachine\TrustedPeople ' + $(if ($ok) { 'presente' } else { 'NO quedo' }))
        return $ok
    } catch {
        Log ('cert: elevacion fallo: ' + $_.Exception.Message)
        return $false
    }
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

        $okMachine = AseguraConfianzaMaquina $cer $thumb

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
                    $okMachine = AseguraConfianzaMaquina $cer $thumb
                    continue
                }
                exit 1
            }
        }

        Log 'done'
        # Comprobar el resultado real: Add-AppxPackage puede devolver ok y el
        # paquete no quedar visible para el usuario. El MSI corre esta SAC con
        # Return=ignore, asi que el exit code solo queda en su log; el detalle
        # util esta en openwave-identity.log.
        $final = $null
        for ($i = 0; $i -lt 3 -and -not $final; $i++) {
            Start-Sleep -Milliseconds 300
            $final = Get-AppxPackage -Name OpenWave -ErrorAction SilentlyContinue |
                Select-Object -First 1
        }
        if ($final) {
            Log ('verify: ok ' + $final.PackageFamilyName)
        } else {
            Log 'verify: NO registrado'
            exit 1
        }
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
