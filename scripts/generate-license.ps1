<#
.SYNOPSIS
  Genera el texto de licencia que muestra el instalador MSI de SoundWave.

.DESCRIPTION
  Concatena docs/instalador/TERMINOS.txt (español) + LICENSE (GPL-3.0) y
  escribe DOS ficheros en build\windows:

  * licencia.txt -> el que usa bundle.licenseFile (tauri.conf.json). Es un
    FRAGMENTO RTF (sin cabecera): Tauri lo lee como texto y lo incrusta dentro
    de un documento RTF que el propio Tauri genera con su cabecera
    ({\rtf1\ansi\ansicpg1252...} + \par por cada salto de línea), de modo que
    el resultado final es un RTF de un solo nivel y correcto.

    Importante: NO se puede apuntar licenseFile a un .rtf completo. La ruta
    rápida de Tauri («usar el .rtf tal cual») usa Path::ends_with(".rtf"),
    que compara COMPONENTES de ruta y no extensiones, así que nunca coincide
    con un fichero llamado licencia.rtf (habría que llamarlo exactamente
    ".rtf"). Todo pasa por la rama que envuelve el contenido, y meter un RTF
    completo dentro de otro RTF deja anidados dos cabeceras {\rtf1...}, con
    resultado impredecible en el diálogo.

  * licencia.rtf -> un RTF completo autónomo, SOLO para revisión humana
    (basta con doble clic en Windows para comprobolar que los acentos se ven
    bien antes de compilar). No lo referencia ningún fichero de build.

  Codificación: ambos ficheros son ASCII puro. El texto español va escrito con
  los escapes de RTF (á = \u225?, \ = \\, { = \{), que el diálogo de licencia
  interpreta; así no dependemos del codepage de la máquina que instala.

.USO
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\generate-license.ps1
#>
param(
    [string]$TxtFile = '',
    [string]$RtfFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $TxtFile) { $TxtFile = Join-Path $root 'build\windows\licencia.txt' }
if (-not $RtfFile) { $RtfFile = Join-Path $root 'build\windows\licencia.rtf' }

$termsPath = Join-Path $root 'docs\instalador\TERMINOS.txt'
$licensePath = Join-Path $root 'LICENSE'
foreach ($p in @($termsPath, $licensePath)) {
    if (-not (Test-Path $p)) {
        throw "Falta el texto fuente: $p"
    }
}

$terms = (Get-Content -Raw -Encoding UTF8 $termsPath).TrimEnd()
$license = (Get-Content -Raw -Encoding UTF8 $licensePath).TrimEnd()
$text = $terms + "`n`n" + $license

# Escapa UNA linea de texto para poder incrustarla en un documento RTF.
# Devuelve ASCII puro y SIN saltos de linea: el fragmento final es de una sola
# linea porque Tauri convierte cada LF del fichero en un \par y nosotros
# decidimos donde va cada \par y con que espaciado (ver mas abajo).
function Convert-ToRtfLine([string]$s) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $s.ToCharArray()) {
        $code = [int][char]$ch
        if ($ch -eq '\') { [void]$sb.Append('\\') }
        elseif ($ch -eq '{') { [void]$sb.Append('\{') }
        elseif ($ch -eq '}') { [void]$sb.Append('\}') }
        elseif ($code -eq 13 -or $code -eq 10) { }         # no deberian llegar
        elseif ($code -lt 128) { [void]$sb.Append($ch) }
        elseif ($code -lt 32768) { [void]$sb.Append("\u${code}?") }
        else { [void]$sb.Append("\u$($code - 65536)?") }   # UTF-16 con signo
    }
    $sb.ToString()
}

# Compone el fragmento en UNA sola linea. La cabecera que Tauri antepone usa
# \pard\sa200\sl276\slmult1\f0\fs22 (Calibri 11 pt, 10 pt de hueco tras CADA
# linea y 1.15 de interlineado): con un texto cortado a 76 caracteres eso deja
# el dialogo enorme y muy espaciado. Se anula con nuestro propio \pard\sa0
# (sin hueco entre lineas, interlineado normal) y \fs18 (9 pt); ademas el
# texto se agrupa en bloques (separados por linea en blanco en la fuente) y
# solo la ultima linea de cada bloque lleva \sa160 (8 pt) como cierre de
# parrafo, de modo que los parrafos se distinguen sin haces lineas sueltas.
$blocks = ($text -replace "`r`n", "`n") -split "`n`n"
$sbFrag = New-Object System.Text.StringBuilder
[void]$sbFrag.Append('\pard\sa0\f0\fs18\lang1034 ')
foreach ($block in $blocks) {
    $lines = @($block -split "`n")
    if (@($lines | Where-Object { $_.Trim().Length -gt 0 }).Count -eq 0) { continue }
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $sa = if ($i -eq $lines.Count - 1) { '\sa160 ' } else { '\sa0 ' }
        [void]$sbFrag.Append($sa)
        [void]$sbFrag.Append((Convert-ToRtfLine $lines[$i]))
        [void]$sbFrag.Append('\par ')
    }
}
$fragment = $sbFrag.ToString()

foreach ($check in @($TxtFile, $RtfFile)) {
    $dir = Split-Path -Parent $check
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

# 1) Fragmento para bundle.licenseFile (Tauri lo envuelve en su propio RTF).
[System.IO.File]::WriteAllText($TxtFile, $fragment, [System.Text.Encoding]::ASCII)

# 2) RTF completo para revision manual antes de compilar. Usa el mismo cuerpo
#    que incrustara Tauri (mismo \sa0/\sa160/\fs18), con su propia cabecera.
$rtf = "{\rtf1\ansi\ansicpg1252\deff0\nouicompat\deflang1034{\fonttbl{\f0\fnil\fcharset0 Calibri;}}`n" +
       "{\*\generator soundwave-generate-license}\viewkind4\uc1`n" +
       $fragment +
       "`n}"
[System.IO.File]::WriteAllText($RtfFile, $rtf, [System.Text.Encoding]::ASCII)

$txtSize = (Get-Item $TxtFile).Length
$rtfSize = (Get-Item $RtfFile).Length
Write-Host "Fragmento RTF para el instalador : $TxtFile ($txtSize bytes)"
Write-Host "RTF completo para revision humana: $RtfFile ($rtfSize bytes)"
