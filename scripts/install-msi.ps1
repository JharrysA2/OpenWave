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
Write-Host 'Instalando (msiexec /i /qb /norestart)...'
$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $MsiPath, '/qb', '/norestart') -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "msiexec ha fallado (codigo $($p.ExitCode))." }
$installedVersion = (Get-Item -LiteralPath $exe).VersionInfo.FileVersion
Write-Host "Instalado. Version en disco: $installedVersion"

# ── 4. (Opcional) Arrancar y verificar ───────────────────────────────────────
if (-not $Launch) {
    Write-Host 'Listo. (usa -Launch para arrancar y verificar)'
    exit 0
}

Write-Host 'Arrancando OpenWave...'
Start-Process -FilePath $exe | Out-Null
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
if ($songs.Count -gt 0) { Write-Host ("#1: " + $songs[0].title + " — " + $songs[0].artist) }
Write-Host 'Verificacion de la instalacion correcta.'
