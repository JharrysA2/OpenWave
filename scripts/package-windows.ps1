<#
.SNOPSIS
  Compila el instalador MSI de SoundWave en Windows (siguiente-siguiente-siguiente).

.DESCRIPTION
  1. scripts\generate-license.ps1 -> build\windows\licencia.txt (texto del
     diálogo de licencia) + licencia.rtf (para revisión).
  2. scripts\prepare-runtime.ps1  -> build\staging con Python embebido,
     dependencias y ffmpeg (se salta si el marcador .ready está vigente).
  3. npx tauri build --bundles msi.
  4. Copia el MSI a build\windows con un nombre limpio y muestra hash/tamaño.

.USO
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-windows.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-windows.ps1 -SkipRuntime
#>
param(
    [switch]$SkipLicense,   # no regenerar la licencia (ya generada)
    [switch]$SkipRuntime,   # no tocar build\staging (ya preparado con -Force)
    [switch]$NoOpen         # no abrir la carpeta de salida al terminar
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($env:OS -ne 'Windows_NT') {
    throw 'package-windows.ps1 solo se ejecuta en Windows.'
}

$root = Split-Path -Parent $PSScriptRoot
$confPath = Join-Path $root 'src-tauri\tauri.conf.json'

Push-Location $root
try {
    Write-Host '== SoundWave: empaquetado del instalador MSI =='

    # ── 0. Prerrequisitos ────────────────────────────────────────────────────
    foreach ($tool in @('node', 'npm', 'cargo')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "No se encuentra '$tool' en el PATH."
        }
    }
    $tauriCli = Join-Path $root 'node_modules\.bin\tauri.cmd'
    if (-not (Test-Path -LiteralPath $tauriCli)) {
        throw 'Falta @tauri-apps/cli: ejecuta "npm install" en la raiz del repositorio.'
    }
    if (-not (Test-Path -LiteralPath $confPath)) { throw "No existe $confPath" }

    # ── 1. Licencia ──────────────────────────────────────────────────────────
    if (-not $SkipLicense) {
        Write-Host ''
        Write-Host '--- Licencia ---'
        # Un `throw` dentro del hijo se propaga y, con EAP=Stop, aborta este
        # script; no se comprueba $LASTEXITCODE porque el hijo puede dejar un
        # codigo no cero deliberado (la comprobacion de pip sale 1 al no
        # existir). Las postcondiciones de abajo validan el resultado.
        & (Join-Path $root 'scripts\generate-license.ps1')
    }
    $licenseTxt = Join-Path $root 'build\windows\licencia.txt'
    if (-not (Test-Path -LiteralPath $licenseTxt)) {
        throw "No existe ${licenseTxt}: ejecuta scripts\\generate-license.ps1 (o quita -SkipLicense)."
    }

    # ── 2. Runtime embebido ──────────────────────────────────────────────────
    if (-not $SkipRuntime) {
        Write-Host ''
        Write-Host '--- Runtime embebido ---'
        & (Join-Path $root 'scripts\prepare-runtime.ps1')
    }
    $marker = Join-Path $root 'build\staging\.ready'
    if (-not (Test-Path -LiteralPath $marker)) {
        throw 'build\staging no esta preparado: ejecuta scripts\prepare-runtime.ps1 sin -SkipRuntime.'
    }

    # ── 3. Build del MSI ─────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '--- npx tauri build --bundles msi ---'
    $version = (Get-Content -Raw -LiteralPath $confPath | ConvertFrom-Json).version
    & $tauriCli build --bundles msi
    if ($LASTEXITCODE -ne 0) { throw "tauri build ha fallado (codigo $LASTEXITCODE)." }

    # ── 4. Resultado ─────────────────────────────────────────────────────────
    $msiDir = Join-Path $root "src-tauri\target\release\bundle\msi"
    $expected = Join-Path $msiDir "SoundWave_${version}_x64_es-ES.msi"
    if (Test-Path -LiteralPath $expected) {
        $msi = Get-Item -LiteralPath $expected
    } else {
        $msi = Get-ChildItem -Path $msiDir -Filter '*.msi' -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $msi) { throw "No se ha generado ningun MSI en $msiDir" }
    }

    $outDir = Join-Path $root 'build\windows'
    if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
    $clean = Join-Path $outDir "SoundWave-$version-x64-es-ES.msi"
    Copy-Item -LiteralPath $msi.FullName -Destination $clean -Force

    $size = (Get-Item -LiteralPath $clean).Length
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $clean).Hash.ToLower()

    Write-Host ''
    Write-Host '== Instalador generado =='
    Write-Host "  $clean"
    Write-Host ("  tamano : {0:N1} MB" -f ($size / 1MB))
    Write-Host "  sha256 : $hash"
    Write-Host ''
    Write-Host 'Siguiente paso: checklist de aceptacion en docs\instalador\README.md'
    Write-Host "(el MSI original tambien sigue en $msiDir)"

    if (-not $NoOpen) {
        Start-Process explorer.exe -ArgumentList "/select,`"$clean`"" -ErrorAction SilentlyContinue
    }
} finally {
    Pop-Location
}
