<#
.SYNOPSIS
  Descarga e instala el MSI de una release de OpenWave.

.DESCRIPTION
  Cierra la app si está abierta, instala el MSI en silencio y (con -Launch)
  arranca la app y comprueba /health y /home/for-you.

  Fuentes del MSI (por orden):
    - -MsiPath  fichero local (tiene prioridad)
    - -Version  descarga el asset de la release vX.Y.Z de GitHub
  Si no se indica ninguno, coge la última release publicada.

.USO
  powershell -File scripts\install-msi.ps1 -Version 1.0.1 -Launch
  powershell -File scripts\install-msi.ps1 -MsiPath build\windows\OpenWave-1.0.1-x64-es-ES.msi -Launch

.NOTES
  Requiere permisos de administrador para msiexec (UAC). Repo de releases:
  JharrysA2/OpenWave.
#>
param(
    [string]$Version = '',
    [string]$MsiPath = '',
    [switch]$Launch,
    [int]$HealthPort = 8765
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($env:OS -ne 'Windows_NT') { throw 'install-msi.ps1 solo se ejecuta en Windows.' }

$repo = 'JharrysA2/OpenWave'
$appDir = 'C:\Program Files\OpenWave'
$exe = Join-Path $appDir 'OpenWave.exe'

# ── 1. Resolver el MSI ───────────────────────────────────────────────────────
if (-not $MsiPath) {
    if (-not $Version) {
        $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'OpenWave' }
        $Version = $latest.tag_name.TrimStart('v')
        Write-Host "Ultima release: v$Version"
    }
    $msiName = "OpenWave-$Version-x64-es-ES.msi"
    $url = "https://github.com/$repo/releases/download/v$Version/$msiName"
    $MsiPath = Join-Path $env:TEMP $msiName
    Write-Host "Descargando $url ..."
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $MsiPath -TimeoutSec 600
}
$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$size = (Get-Item -LiteralPath $MsiPath).Length
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MsiPath).Hash.ToLower()
Write-Host ("MSI: {0} ({1:N1} MB, sha256 {2})" -f $MsiPath, ($size / 1MB), $hash)

# ── 2. Cerrar la app y liberar el puerto ─────────────────────────────────────
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*OpenWave*' } | ForEach-Object {
    Write-Host "Cerrando $($_.ProcessName) (PID $($_.Id))"
    Stop-Process -Id $_.Id -Force
}
$owner = (Get-NetTCPConnection -LocalPort $HealthPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($owner) {
    Write-Host "Cerrando backend (PID $owner)"
    Stop-Process -Id $owner -Force
}
Start-Sleep -Seconds 2

# ── 3. Instalar ──────────────────────────────────────────────────────────────
# /qb (barra de progreso): con UI el MSI autolanza la app al registrar la
# identidad (accion AUTOLAUNCHAPP), asi que hay que contar con esa instancia —
# el paso 4 comprueba si ya esta en marcha y NO abre otra. (/qn se probo y
# msiexec devolvia 1603: esta instalacion necesita la secuencia de UI.)
Write-Host 'Instalando (msiexec /i /qb /norestart)...'
$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $MsiPath, '/qb', '/norestart') -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "msiexec ha fallado (codigo $($p.ExitCode))." }
$installedVersion = (Get-Item -LiteralPath $exe).VersionInfo.FileVersion
Write-Host "Instalado. Version en disco: $installedVersion"

# ── 3b. Identidad: auto-reparacion ───────────────────────────────────────────
# El registro del paquete sparse lo hace la SAC del MSI (RegisterIdentity con
# Return=ignore), pero puede no llegar a producirse: la SAC corre elevada y si
# falla lo deja en su log (openwave-identity.log), que es donde se vio el caso
# del 2026-10-19 (remove ok, add con 0x800B0109: el cert de la build no estaba
# de confianza en LocalMachine\TrustedPeople, unico almacen que Add-AppxPackage
# valida de verdad). Si la app queda sin identidad funciona igual, pero Task
# Manager la separa en "Administrador de WebView2". Aqui se repara en caliente:
# importar la confianza del cert instalado y re-registrar el paquete.
$pkg = Get-AppxPackage -Name OpenWave -ErrorAction SilentlyContinue
if (-not $pkg) {
    Write-Host 'Identidad sin registrar: reparando (confianza + registro)...'
    $cer = Join-Path $appDir 'openwave-identity.cer'
    $ca  = Join-Path $appDir 'openwave-identity-ca.ps1'
    try {
        $thumb = (Get-PfxCertificate -FilePath $cer).Thumbprint
        Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\TrustedPeople -ErrorAction SilentlyContinue | Out-Null
        # LocalMachine exige elevacion: el msiexec de arriba ya paso UAC, asi
        # que se eleva una sola vez para el import; sin ella Add-AppxPackage
        # rechaza la firma (0x800B0109) y Task Manager separa la app.
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-NonInteractive', '-Command',
            "Import-Certificate -FilePath '$cer' -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null"
        ) | Out-Null
        $trusted = @(Get-ChildItem 'Cert:\LocalMachine\TrustedPeople' -ErrorAction SilentlyContinue |
            Where-Object { $_.Thumbprint -eq $thumb })
        Write-Host ("  confianza thumbprint {0}: LocalMachine {1}" -f $thumb, $(if ($trusted) { 'presente' } else { 'NO quedo' }))
    } catch {
        Write-Host ("  import de confianza no completado: " + $_.Exception.Message)
    }
    if (Test-Path -LiteralPath $ca) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive -File $ca -Mode Register
        $pkg = Get-AppxPackage -Name OpenWave -ErrorAction SilentlyContinue
    }
    if ($pkg) {
        Write-Host ("  identidad registrada: " + $pkg.PackageFamilyName)
    } else {
        Write-Host '  AVISO: la identidad sigue sin registrar; la app funciona pero Task Manager la agrupara como WebView2.'
    }
}

# ── 4. (Opcional) Arrancar y verificar ───────────────────────────────────────
if (-not $Launch) {
    Write-Host 'Listo. (usa -Launch para arrancar y verificar)'
    exit 0
}

$running = @(Get-Process OpenWave -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    Write-Host ("OpenWave ya esta en marcha (PID " + (($running | ForEach-Object { $_.Id }) -join ', ') + '): no abro otra instancia.')
} else {
    Write-Host 'Arrancando OpenWave...'
    Start-Process -FilePath $exe | Out-Null
}
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        if (Invoke-RestMethod -Uri "http://127.0.0.1:$HealthPort/health" -TimeoutSec 2) {
            $ok = $true
            Write-Host ("/health OK en " + (($i + 1) * 0.5) + " s")
            break
        }
    } catch { }
}
if (-not $ok) { throw "/health no respondio tras la instalacion." }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$mix = Invoke-RestMethod -Uri "http://127.0.0.1:$HealthPort/home/for-you" -TimeoutSec 40
$sw.Stop()
$songs = @($mix.results)
$artists = @($songs | Select-Object -ExpandProperty artist -Unique)
Write-Host ("/home/for-you: " + $songs.Count + " canciones, " + $artists.Count + " artistas, " + [math]::Round($sw.Elapsed.TotalSeconds, 2) + " s")
if ($songs.Count -gt 0) { Write-Host ("#1: " + $songs[0].title + " - " + $songs[0].artist) }
Write-Host 'Verificacion de la instalacion correcta.'
