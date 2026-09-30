<#
.SNOPSIS
  Prepara build\staging (Python embebido + dependencias + ffmpeg) para que
  `tauri build` pueda empaquetarlo en el MSI.

.DESCRIPTION
  build\staging\backend   -> copia de backend/ solo con código (.py, sin
                             tests ni cachés) que bundle.resources instala en
                             INSTALLDIR\backend.
  build\staging\runtime   -> Python 3.14 embeddable + Lib\site-packages con
                             requirements-runtime.txt (pip se desinstala al
                             final; solo queda el código instalado).
  build\staging\ffmpeg    -> ffmpeg.exe (descargas MP3 y calidad «Baja»).

  También copia ffmpeg.exe a la raíz del repo, para desarrollo en Windows.

  Todo se descarga a build\cache y se verifica por SHA-256 contra los pines de
  este script (la única descarga sin hash es get-pip.py, que solo arranca pip
  y luego se va: HTTPS + se guarda su hash en el marcador para trazabilidad).

  Idempotente: si existe build\staging\.ready y no han cambiado
  backend\requirements-runtime.txt ni el codigo del backend (*.py de
  produccion), no hace nada. Usa -Force para reconstruir a mano.

.NOTES
  Se ejecuta en Windows:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-runtime.ps1
  Desde WSL:             powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\...\OpenWave\scripts\prepare-runtime.ps1'
#>
param(
    [switch]$Force,     # reconstruir aunque el marcador .ready esté vigente
    [switch]$KeepPip    # dejar pip instalado en el runtime (solo para depurar)
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # sin barra de progreso: descargas mucho más rápidas

if ($env:OS -ne 'Windows_NT') {
    throw 'prepare-runtime.ps1 solo se ejecuta en Windows (necesita el Python embeddable de amd64).'
}

$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $root 'build\cache'
$stage = Join-Path $root 'build\staging'
$marker = Join-Path $stage '.ready'
$requirements = Join-Path $root 'backend\requirements-runtime.txt'
$backendSrc = Join-Path $root 'backend'
$runtime = Join-Path $stage 'runtime'
$backendDst = Join-Path $stage 'backend'

# ── Pines (URL + SHA-256) ────────────────────────────────────────────────────
$PyVersion = '3.14.7'
$PyUrl = "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip"
$PySha256 = 'd297e5ff019966817ad8502465176139f2d3d840fa4ed84b13bed399a6ab1f15'

$FfmpegVersion = '9.0.2'
$FfmpegUrl = "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-$FfmpegVersion-essentials_build.zip"
$FfmpegSha256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'

$GetPipUrl = 'https://bootstrap.pypa.io/get-pip.py'

# ── Utilidades ───────────────────────────────────────────────────────────────
function Get-Sha256([string]$path) {
    (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower()
}

# Hash del codigo que se empaqueta (*.py de produccion, sin tests ni venv).
# Va en el marcador: si solo cambia el codigo (no requirements), el staging se
# reconstruye igual, para que el MSI no se quede con un backend viejo.
function Get-BackendCodeHash {
    $files = @(Get-ChildItem -Path $backendSrc -Recurse -File -Filter '*.py' | Where-Object {
        $_.FullName -notmatch '\\(venv|\.venv|__pycache__|\.pytest_cache|\.ruff_cache)\\' -and
        $_.Name -notlike 'test_*' -and
        $_.Name -ne 'conftest.py'
    } | Sort-Object FullName)
    $parts = foreach ($f in $files) {
        $rel = $f.FullName.Substring($backendSrc.Length).TrimStart('\')
        '{0} {1}' -f $rel.ToLowerInvariant(), (Get-Sha256 $f.FullName)
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
    ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLower()
}

function Get-PinnedFile([string]$url, [string]$dest, [string]$expectedSha, [string]$what) {
    if (-not (Test-Path -LiteralPath $dest)) {
        $dir = Split-Path -Parent $dest
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Write-Host "  descargando $what ..."
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest -TimeoutSec 600
        } catch {
            if (Test-Path -LiteralPath $dest) { Remove-Item -Force -LiteralPath $dest }
            throw "No se pudo descargar $what ($url): $($_.Exception.Message)"
        }
    }
    if ($expectedSha) {
        $actual = Get-Sha256 $dest
        if ($actual -ne $expectedSha.ToLower()) {
            throw ("Hash distinto en $what.`n  esperado: $expectedSha`n  obtenido: $actual`n" +
                   "Si el proveedor publicó una versión nueva, actualiza el pin en scripts\\prepare-runtime.ps1.")
        }
    }
    $dest
}

# Ejecuta un comando nativo y devuelve salida + codigo de salida.
#
# El stderr de un comando nativo llega a PowerShell como ErrorRecord: con
# $ErrorActionPreference = 'Stop' y `2>&1` (como aqui) basta un simple
# WARNING de pip para que el script aborte. Por eso se baja la preferencia
# solo durante la llamada.
function Invoke-Native([string]$exe, [string[]]$argumentList) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = (& $exe @argumentList 2>&1 | Out-String)
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    [pscustomobject]@{ Output = $out; ExitCode = $code }
}

function Invoke-Checked([string]$exe, [string[]]$argumentList, [string]$what) {
    $r = Invoke-Native $exe $argumentList
    if ($r.ExitCode -ne 0) {
        throw "$what ha fallado (codigo $($r.ExitCode)):`n$($r.Output)"
    }
    $r.Output
}

function Test-RequiresRebuild {
    if ($Force) { return $true }
    if (-not (Test-Path -LiteralPath $marker)) { return $true }
    try {
        $prev = Get-Content -Raw -LiteralPath $marker | ConvertFrom-Json
    } catch {
        return $true
    }
    if ($prev.requirementsHash -ne $script:reqHash) {
        Write-Host '  requirements-runtime.txt ha cambiado: se reconstruye el runtime.'
        return $true
    }
    if ($prev.backendHash -ne $script:backendHash) {
        Write-Host '  backend/*.py ha cambiado: se vuelve a empaquetar el codigo.'
        return $true
    }
    foreach ($p in @($runtime, $backendDst, (Join-Path $stage 'ffmpeg'))) {
        if (-not (Test-Path -LiteralPath $p)) { return $true }
    }
    return $false
}

if (-not (Test-Path -LiteralPath $requirements)) { throw "No existe $requirements" }
if (-not (Test-Path -LiteralPath $backendSrc)) { throw "No existe $backendSrc" }
$script:reqHash = Get-Sha256 $requirements
$script:backendHash = Get-BackendCodeHash

if (-not (Test-RequiresRebuild)) {
    Write-Host "Runtime ya preparado (build\staging\.ready). Usa -Force para reconstruir."
    return
}

Write-Host '== SoundWave: preparacion del runtime embebido =='

# ── 1. Descargas con hash ────────────────────────────────────────────────────
Write-Host '[1/7] Descargas (build\cache)'
$pyZip = Get-PinnedFile $PyUrl (Join-Path $cache "python-$PyVersion-embed-amd64.zip") $PySha256 "Python $PyVersion embeddable"
$ffmpegZip = Get-PinnedFile $FfmpegUrl (Join-Path $cache "ffmpeg-$FfmpegVersion-essentials_build.zip") $FfmpegSha256 "ffmpeg $FfmpegVersion"
$getPip = Get-PinnedFile $GetPipUrl (Join-Path $cache 'get-pip.py') $null 'get-pip.py'
$getPipHash = Get-Sha256 $getPip
Write-Host "  get-pip.py (sha256 $getPipHash)"

# ── 2. Staging limpio ────────────────────────────────────────────────────────
Write-Host '[2/7] Staging limpio'
if (Test-Path -LiteralPath $stage) { Remove-Item -Recurse -Force -LiteralPath $stage }
New-Item -ItemType Directory -Force -Path $runtime, $backendDst | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem

# ── 3. Python embebido + ._pth ───────────────────────────────────────────────
Write-Host "[3/7] Python $PyVersion embebido -> build\staging\runtime"
[System.IO.Compression.ZipFile]::ExtractToDirectory($pyZip, $runtime)

$pthFile = Join-Path $runtime 'python314._pth'
if (-not (Test-Path -LiteralPath $pthFile)) {
    throw "El zip de Python no trae python314._pth (¿cambio la versión?). Revisa el pin."
}
# Sin `import site` a proposito: solo se expone Lib\site-packages, para que el
# path de importacion sea exactamente lo que nosotros instalamos.
$pthContent = @"
python314.zip
.
Lib\site-packages

# Uncomment to run site.main() automatically
#import site
"@
[System.IO.File]::WriteAllText($pthFile, $pthContent + "`r`n", (New-Object System.Text.UTF8Encoding($false)))

# ── 4. ffmpeg ────────────────────────────────────────────────────────────────
Write-Host "[4/7] ffmpeg $FfmpegVersion -> build\staging\ffmpeg"
$ffmpegTmp = Join-Path $env:TEMP ("soundwave-ffmpeg-" + [guid]::NewGuid().ToString('N'))
[System.IO.Compression.ZipFile]::ExtractToDirectory($ffmpegZip, $ffmpegTmp)
try {
    $ff = Get-ChildItem -Path $ffmpegTmp -Recurse -File -Filter 'ffmpeg.exe' | Select-Object -First 1
    if (-not $ff) { throw 'No se encontro ffmpeg.exe dentro del zip de ffmpeg.' }
    $ffStage = Join-Path $stage 'ffmpeg'
    New-Item -ItemType Directory -Force -Path $ffStage | Out-Null
    Copy-Item -LiteralPath $ff.FullName -Destination (Join-Path $ffStage 'ffmpeg.exe') -Force
    # Tambien a la raiz del repo: así el backend de desarrollo en Windows usa
    # el mismo binario que el instalado.
    Copy-Item -LiteralPath $ff.FullName -Destination (Join-Path $root 'ffmpeg.exe') -Force
} finally {
    Remove-Item -Recurse -Force -LiteralPath $ffmpegTmp -ErrorAction SilentlyContinue
}

# ── 5. Codigo del backend (solo .py, sin tests ni cachés) ────────────────────
Write-Host '[5/7] Codigo del backend -> build\staging\backend'
$pyFiles = @(Get-ChildItem -Path $backendSrc -Recurse -File -Filter '*.py' | Where-Object {
    $_.FullName -notmatch '\\(venv|\.venv|__pycache__|\.pytest_cache|\.ruff_cache)\\' -and
    $_.Name -notlike 'test_*' -and
    $_.Name -ne 'conftest.py'
})
if ($pyFiles.Count -lt 20) {
    throw "Solo se han encontrado $($pyFiles.Count) ficheros .py en backend\: algo va mal."
}
foreach ($f in $pyFiles) {
    $rel = $f.FullName.Substring($backendSrc.Length).TrimStart('\')
    $target = Join-Path $backendDst $rel
    $targetDir = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
    Copy-Item -LiteralPath $f.FullName -Destination $target -Force
}
Write-Host "  $($pyFiles.Count) ficheros .py copiados"

# ── 6. Dependencias de Python ────────────────────────────────────────────────
Write-Host '[6/7] Dependencias (requirements-runtime.txt)'
$py = Join-Path $runtime 'python.exe'
if (-not (Test-Path -LiteralPath $py)) { throw "No existe $py" }

Write-Host '  arrancando pip con get-pip.py'
$out = Invoke-Checked $py @($getPip, '--no-warn-script-location', '--disable-pip-version-check') 'get-pip.py'

Write-Host '  instalando dependencias (solo wheels, sin cache)'
$out = Invoke-Checked $py @(
    '-m', 'pip', 'install',
    '--no-warn-script-location', '--disable-pip-version-check',
    '--no-cache-dir', '--only-binary=:all:',
    '-r', $requirements
) 'pip install'
Write-Host (($out -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 3) -join "`n")

if (-not $KeepPip) {
    Write-Host '  desinstalando pip/setuptools/wheel del runtime'
    # get-pip ya no instala setuptools desde Python 3.12 y pip avisa por
    # stderr de que no esta: eso no debe abortar el script.
    $null = (Invoke-Native $py @('-m', 'pip', 'uninstall', '-y', 'setuptools', 'wheel')).Output
    $r = Invoke-Native $py @('-m', 'pip', 'uninstall', '-y', 'pip')
    if ($r.ExitCode -ne 0) {
        throw "pip uninstall ha fallado (codigo $($r.ExitCode)):`n$($r.Output)"
    }
    # `import pip` sale 0 si aun esta instalado y 1 si ya no.
    $check = Invoke-Native $py @('-c', 'import pip')
    if ($check.ExitCode -eq 0) { throw 'pip sigue instalado en el runtime embebido.' }
    # Los lanzadores de console (Scripts\) apuntan a rutas de esta maquina y
    # no los usa nadie: el backend arranca con `python -m ...`.
    $scriptsDir = Join-Path $runtime 'Scripts'
    if (Test-Path -LiteralPath $scriptsDir) { Remove-Item -Recurse -Force -LiteralPath $scriptsDir }
}

# ── 7. Smoke test contra el staging ──────────────────────────────────────────
Write-Host '[7/7] Smoke test (arranca el backend igual que la app instalada)'
$smokeId = [guid]::NewGuid().ToString('N')
$smokeDir = Join-Path $env:TEMP "soundwave-smoke-$smokeId"
$smokeErr = Join-Path $env:TEMP "soundwave-smoke-$smokeId.err.log"
$smokeOut = Join-Path $env:TEMP "soundwave-smoke-$smokeId.out.log"
New-Item -ItemType Directory -Force -Path $smokeDir | Out-Null

# La app instalada arranca el backend exactamente asi:
#     runtime\python.exe  \\?\...\backend\main.py   (cwd = la de la app)
# sin tocar sys.path. El ._pth del Python embebido NO anade ni la carpeta del
# script ni el cwd, asi que si main.py no se abre el camino a sus propios
# modulos el backend muere con ModuleNotFoundError. Por eso aqui se lanza el
# entry point de verdad (con la ruta \?\ que usa Tauri) en vez de un import
# simulado: la version anterior hacia sys.path.insert(0, cwd) con cwd=backend,
# que enmascara exactamente ese fallo.
# Con comillas alrededor: Start-Process no comilla los argumentos y una ruta
# de destino con espacios (C:\Program Files\...) se partiria en dos.
$smokeMain = '"\\?\' + (Join-Path $backendDst 'main.py') + '"'
$env:SOUNDWAVE_DATA_DIR = $smokeDir
$smokeProc = $null
try {
    if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) {
        throw 'El puerto 8765 ya esta en uso: cierra SoundWave antes de empaquetar (el smoke test arranca el backend).'
    }
    $smokeProc = Start-Process -FilePath $py -ArgumentList $smokeMain -WorkingDirectory $env:TEMP -RedirectStandardError $smokeErr -RedirectStandardOutput $smokeOut -PassThru -WindowStyle Hidden
    $up = $false
    for ($i = 0; $i -lt 120 -and -not $up; $i++) {
        Start-Sleep -Milliseconds 500
        if ($smokeProc.HasExited) { break }
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/health' -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200 -and $r.Content -match 'SoundWave') { $up = $true }
        } catch { }
    }
    if (-not $up) {
        $err = if (Test-Path -LiteralPath $smokeErr) { Get-Content -Raw -LiteralPath $smokeErr } else { '(sin stderr)' }
        throw "El backend no ha arrancado con el runtime embebido.`n--- stderr ---`n$err"
    }
    Write-Host '  backend arrancado y GET /health -> 200 (con la sys.path real de la app)'
} finally {
    if ($smokeProc -and -not $smokeProc.HasExited) {
        Stop-Process -Id $smokeProc.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
    }
    Remove-Item -LiteralPath 'Env:\SOUNDWAVE_DATA_DIR' -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force -LiteralPath $smokeDir -ErrorAction SilentlyContinue
    Remove-Item -Force -LiteralPath $smokeErr, $smokeOut -ErrorAction SilentlyContinue
}

# Los .pyc del backend apuntarian a las rutas de esta maquina y solo retrasan
# el arranque: fuera. Los de site-packages se dejan (arranque mas rapido).
Get-ChildItem -Path $backendDst -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object { Remove-Item -Recurse -Force -LiteralPath $_.FullName -ErrorAction SilentlyContinue }

# Nada de datos de desarrollo en el paquete.
Get-ChildItem -Path $backendDst -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'url_cache.json' -or $_.Name -like '*.log' -or $_.Name -like 'soundwave.db*' -or $_.Name -like '.coverage' } |
    ForEach-Object { Remove-Item -Force -LiteralPath $_.FullName }

# ── Marcador ─────────────────────────────────────────────────────────────────
$markerData = @{
    python          = $PyVersion
    ffmpeg          = $FfmpegVersion
    requirementsHash = $script:reqHash
    backendHash     = $script:backendHash
    getPipHash      = $getPipHash
    createdAt       = (Get-Date).ToString('o')
} | ConvertTo-Json
[System.IO.File]::WriteAllText($marker, $markerData, (New-Object System.Text.UTF8Encoding($false)))

$sizeRuntime = (Get-ChildItem -Path $runtime -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$sizeBackend = (Get-ChildItem -Path $backendDst -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
Write-Host ''
Write-Host ("Runtime  : {0:N1} MB" -f ($sizeRuntime / 1MB))
Write-Host ("Backend  : {0:N1} MB" -f ($sizeBackend / 1MB))
Write-Host ("FFmpeg   : {0:N1} MB" -f ((Get-Item (Join-Path $stage 'ffmpeg\ffmpeg.exe')).Length / 1MB))
Write-Host "Listo: build\staging preparado para `tauri build`."
