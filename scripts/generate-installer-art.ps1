<#
.SYNOPSIS
  Genera los graficos de marca del asistente MSI (banner e imagen de dialogo).

.DESCRIPTION
  Escribe dos mapas de bits 24 bits que tauri.conf.json inyecta como
  WixVariable (bundle.windows.wix.bannerPath / dialogImagePath):

  * build\windows\banner.bmp  (493 x 58 px)  -> WixUIBannerBmp: banda superior
    de todas las paginas interiores del asistente (OptionsDlg, VerifyReadyDlg,
    ProgressDlg, MaintenanceTypeDlg...). El titulo (control Title, Y=6) y la
    descripcion (Y=23) se dibujan EN NEGRO SOBRE esa banda, hasta ~x=410 px,
    asi que la banda se mantiene blanca/alicajada y la grafica de marca va en
    el borde derecho (x>=412).

  * build\windows\dialog.bmp  (493 x 312 px) -> WixUIDialogBmp: imagen de la
    pagina de bienvenida, de preparacion y de finalizacion. El texto de esos
    dialogos empieza en X=135 dialog units (= 180 px a 96 dpi), de modo que la
    grafica se coloca en la columna izquierda (0..171 px) y el resto se deja
    blanco puro.

  Colores de marca de la aplicacion: violeta #a78bfa (variable --neon) sobre
  fondo oscuro #1b1a33.

.USO
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\generate-installer-art.ps1
#>
param(
    [string]$BannerFile = '',
    [string]$DialogFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $BannerFile) { $BannerFile = Join-Path $root 'build\windows\banner.bmp' }
if (-not $DialogFile) { $DialogFile = Join-Path $root 'build\windows\dialog.bmp' }

Add-Type -AssemblyName System.Drawing

$neon   = [System.Drawing.Color]::FromArgb(167, 139, 250)   # #a78bfa
$violet = [System.Drawing.Color]::FromArgb(109,  90, 224)   # violeta medio
$dark1  = [System.Drawing.Color]::FromArgb( 27,  26,  51)   # #1b1a33
$dark2  = [System.Drawing.Color]::FromArgb( 52,  46, 106)   # degradado inferior

function Save-Bmp([System.Drawing.Bitmap]$bmp, [string]$path) {
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp.Dispose()
}

# ----------------------------------------------------------------------
# Banner 493 x 58: fondo claro (texto negro encima) + barras a la derecha.
# ----------------------------------------------------------------------
$banner = New-Object System.Drawing.Bitmap(493, 58, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($banner)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAlias'

$rect = New-Object System.Drawing.Rectangle(0, 0, 493, 58)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect, [System.Drawing.Color]::White, [System.Drawing.Color]::FromArgb(236, 234, 251), 0)
$g.FillRectangle($grad, $rect)
$grad.Dispose()

# Barras de ecualizador en el borde derecho (x 412..490), centradas en alto.
$heigths = @(22, 34, 14, 40, 26, 36, 18, 30, 24)
$x = 412
for ($i = 0; $i -lt $heigths.Count; $i++) {
    $h = $heigths[$i]
    $y = [int]((58 - $h) / 2)
    $color = if ($i % 2 -eq 0) { $neon } else { $violet }
    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillRectangle($brush, $x, $y, 5, $h)
    $brush.Dispose()
    $x += 8
}
# Filete inferior de marca (zona sin texto: la descripcion termina en y=57
# pero solo si el texto es muy largo; 2 px en violeta muy claro no estorban).
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(224, 220, 250), 2)
$g.DrawLine($pen, 0, 57, 493, 57)
$pen.Dispose()
$g.Dispose()
Save-Bmp $banner $BannerFile

# ----------------------------------------------------------------------
# Dialog 493 x 312: panel de marca a la izquierda, blanco a la derecha.
# ----------------------------------------------------------------------
$dialog = New-Object System.Drawing.Bitmap(493, 312, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($dialog)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAlias'

# Fondo blanco (zona de texto de los dialogos: Title/Description a x >= 180 px).
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillRectangle($white, 0, 0, 493, 312)
$white.Dispose()

# Panel izquierdo con degradado vertical oscuro.
$panelRect = New-Object System.Drawing.Rectangle(0, 0, 172, 312)
$pgrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $panelRect, $dark1, $dark2, 90)
$g.FillRectangle($pgrad, $panelRect)
$pgrad.Dispose()

# Ecualizador violeta centrado en el panel.
$bars = @(46, 78, 110, 64, 96, 54, 82)
$bx = 32
foreach ($h in $bars) {
    $y = [int](132 - $h / 2)
    $brush = New-Object System.Drawing.SolidBrush($neon)
    $g.FillRectangle($brush, $bx, $y, 12, $h)
    $brush.Dispose()
    $bx += 18
}

# Nombre del producto y sumillo bajo el ecualizador.
$font1 = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$font2 = New-Object System.Drawing.Font('Segoe UI', 7.5, [System.Drawing.FontStyle]::Regular)
$brushW = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$brushG = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(196, 192, 224))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$g.DrawString('SoundWave', $font1, $brushW, (New-Object System.Drawing.RectangleF(0, 214, 172, 30)), $fmt)
$g.DrawString('Reproductor de musica', $font2, $brushG, (New-Object System.Drawing.RectangleF(0, 246, 172, 20)), $fmt)

# Filete violeta que separa panel y zona de texto.
$brushE = New-Object System.Drawing.SolidBrush($neon)
$g.FillRectangle($brushE, 172, 0, 3, 312)
$brushE.Dispose()

$font1.Dispose(); $font2.Dispose()
$brushW.Dispose(); $brushG.Dispose(); $fmt.Dispose()
$g.Dispose()
Save-Bmp $dialog $DialogFile

$b = Get-Item -LiteralPath $BannerFile
$d = Get-Item -LiteralPath $DialogFile
Write-Host "Banner 493x58 : $BannerFile ($($b.Length) bytes)"
Write-Host "Dialogo 493x312: $DialogFile ($($d.Length) bytes)"
