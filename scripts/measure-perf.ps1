# OpenWave / SoundWave - baseline de rendimiento (CPU/GPU) en Windows.
# Muestrea contadores por proceso durante N segundos y resume avg/p95/max.
#
#   powershell -ExecutionPolicy Bypass -File scripts\measure-perf.ps1 `
#       -Seconds 60 -Label "visible-inicio"
#
# Escenarios recomendados (60 s cada uno, con musica sonando):
#   - hidden-playing   : app minimizada/oculta, reproduciendo
#   - visible-home     : app visible en Inicio
#   - visible-lyrics   : app visible en Letras
#
# Notas de medicion:
#   - CPU por proceso: clases WMI Win32_PerfFormattedData (nombres de
#     propiedades independientes del idioma del sistema).
#   - PercentProcessorTime del proceso se agrega por nucleo (una carga de
#     1 nucleo = 100) -> se divide entre los nucleos para % de la maquina.
#   - GPU: contador "GPU Engine\Utilization Percentage" (queda en ingles en
#     sistemas en espanol) filtrado por pid al inicio del nombre de instancia.
#   - WebView2: solo procesos descendientes de soundwave.exe (excluye
#     huérfanos de otras apps de Windows).
param(
  [int]$Seconds = 60,
  [string]$Label = "scenario"
)

$ErrorActionPreference = "SilentlyContinue"

$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
if (-not $cores) { $cores = [Environment]::ProcessorCount }

$series = @{
  pythonCpu  = New-Object System.Collections.Generic.List[double]
  tauriCpu   = New-Object System.Collections.Generic.List[double]
  webviewCpu = New-Object System.Collections.Generic.List[double]
  nodeCpu    = New-Object System.Collections.Generic.List[double]
  sysCpu     = New-Object System.Collections.Generic.List[double]
  appGpu     = New-Object System.Collections.Generic.List[double]
}

# Descendientes msedgewebview2 de soundwave.exe (la app Tauri es la raiz)
function Get-AppWebviewPids([int[]]$roots) {
  if (-not $roots -or $roots.Count -eq 0) { return @() }
  $procs = Get-CimInstance Win32_Process
  $parentOf = @{}
  foreach ($p in $procs) { $parentOf[[int]$p.ProcessId] = [int]$p.ParentProcessId }
  $out = @()
  foreach ($p in $procs) {
    if ($p.Name -notlike "msedgewebview2*") { continue }
    $cur = [int]$p.ProcessId
    $hops = 0
    while ($parentOf.ContainsKey($cur) -and $hops -lt 25) {
      $cur = $parentOf[$cur]
      $hops++
      if ($roots -contains $cur) { $out += [int]$p.ProcessId; break }
    }
  }
  return $out
}

# Warm-up: la primera consulta de las clases WMI de rendimiento no esta aún
# calibrada y devolveria valores desde la activacion de la clase.
Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Out-Null
Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Out-Null
Get-Counter "\GPU Engine(*)\Utilization Percentage" | Out-Null
Start-Sleep -Seconds 2

for ($s = 0; $s -lt $Seconds; $s++) {
  # WebView2 se resuelve en CADA muestra: los renderers van y vienen y los pids
  # liberados se reutilizan enseguida (un pid cacheado contaria procesos ajenos).
  $tauriPids = @((Get-Process -Name "soundwave" -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }))
  $pyPids = @((Get-Process -Name "python" -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }))
  $wvPids = Get-AppWebviewPids $tauriPids

  $py = 0.0; $tauri = 0.0; $wv = 0.0; $nd = 0.0
  $rows = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process
  foreach ($r in $rows) {
    $v = [double]$r.PercentProcessorTime
    if ($v -le 0) { continue }
    $n = [string]$r.Name
    if ($n -like "python*") { $py += $v }
    elseif ($n -like "soundwave*") { $tauri += $v }
    elseif ($n -like "node*") { $nd += $v }
    if ($wvPids -contains [int]$r.IDProcess) { $wv += $v }
  }

  $sysRow = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq "_Total" }
  $sys = [double]$sysRow.PercentProcessorTime

  $gpu = 0.0
  $appPids = $tauriPids + $pyPids + $wvPids
  $gs = (Get-Counter "\GPU Engine(*)\Utilization Percentage").CounterSamples
  foreach ($c in $gs) {
    if ($c.CookedValue -le 0) { continue }
    if ($c.InstanceName -match "^pid_(\d+)_") {
      if ($appPids -contains [int]$Matches[1]) { $gpu += $c.CookedValue }
    }
  }

  # PercentProcessorTime de proceso viene en % por nucleo (0..cores*100):
  # % de la maquina = valor / nucleos  (1 nucleo ocupado = 100 -> 8.3 en 12)
  $series.pythonCpu.Add([math]::Round($py / $cores, 2))
  $series.tauriCpu.Add([math]::Round($tauri / $cores, 2))
  $series.webviewCpu.Add([math]::Round($wv / $cores, 2))
  $series.nodeCpu.Add([math]::Round($nd / $cores, 2))
  $series.sysCpu.Add([math]::Round($sys, 2))
  $series.appGpu.Add([math]::Round($gpu, 2))

  Start-Sleep -Milliseconds 1050
}

function Stats([System.Collections.Generic.List[double]]$l) {
  if ($l.Count -eq 0) { return "n/a" }
  $avg = [math]::Round(($l | Measure-Object -Average).Average, 2)
  $max = ($l | Measure-Object -Maximum).Maximum
  $sorted = @($l | Sort-Object)
  $idx = [int][math]::Ceiling($sorted.Count * 0.95) - 1
  if ($idx -lt 0) { $idx = 0 }
  $p95 = $sorted[$idx]
  return "avg=$avg  p95=$p95  max=$max"
}

$found = @()
foreach ($n in @("python", "soundwave", "node", "msedgewebview2")) {
  $c = (Get-Process -Name $n -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($c -gt 0) { $found += "$n x$c" }
}

Write-Output "=== [$Label] ${Seconds}s | cores=$cores | procesos: $($found -join ', ') ==="
Write-Output ("  python.exe   CPU : " + (Stats $series.pythonCpu))
Write-Output ("  soundwave    CPU : " + (Stats $series.tauriCpu))
Write-Output ("  webview2     CPU : " + (Stats $series.webviewCpu))
Write-Output ("  node (vite)  CPU : " + (Stats $series.nodeCpu))
Write-Output ("  sistema      CPU : " + (Stats $series.sysCpu))
Write-Output ("  app          GPU : " + (Stats $series.appGpu))
