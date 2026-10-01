<#
.SYNOPSIS
  Genera los graficos del asistente MSI (banner e imagen de dialogo).

.DESCRIPTION
  Escribe dos mapas de bits 24 bits que tauri.conf.json inyecta como
  WixVariable (bundle.windows.wix.bannerPath / dialogImagePath):

  * build\windows\banner.bmp  (493 x 58 px)  -> WixUIBannerBmp: banda superior
    de todas las paginas interiores del asistente (OptionsDlg, VerifyReadyDlg,
    ProgressDlg, MaintenanceTypeDlg...). El titulo (control Title, Y=6) y la
    descripcion (Y=23) se dibujan EN NEGRO SOBRE esa banda, hasta ~x=410 px,
    asi que la banda es blanca/alicajada sin ninguna grafica (el usuario pidió
    que el instalador no llevara logo).

  * build\windows\dialog.bmp  (493 x 312 px) -> WixUIDialogBmp: imagen de la
    pagina de bienvenida, de preparacion y de finalizacion. El texto de esos
    dialogos empieza en X=135 dialog units (= 180 px a 96 dpi), de modo que se
    deja una columna izquierda con un panel de color plano (sin logo) y el
    resto en blanco puro.

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
# Banner 493 x 58: fondo claro sin grafica (el texto negro del WixUI encima).
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

# Filete inferior discreto (2 px en violeta muy claro; no estorba al texto).
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(224, 220, 250), 2)
$g.DrawLine($pen, 0, 57, 493, 57)
$pen.Dispose()
$g.Dispose()
Save-Bmp $banner $BannerFile

# ----------------------------------------------------------------------
# Dialog 493 x 312: panel de color plano a la izquierda, blanco a la derecha.
# ----------------------------------------------------------------------
$dialog = New-Object System.Drawing.Bitmap(493, 312, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($dialog)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAlias'

# Fondo blanco (zona de texto de los dialogos: Title/Description a x >= 180 px).
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillRectangle($white, 0, 0, 493, 312)
$white.Dispose()

# Panel izquierdo con degradado vertical (solo color, sin logo ni texto).
$panelRect = New-Object System.Drawing.Rectangle(0, 0, 172, 312)
$pgrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $panelRect, $dark1, $dark2, 90)
$g.FillRectangle($pgrad, $panelRect)
$pgrad.Dispose()

# Filete violeta que separa panel y zona de texto.
$brushE = New-Object System.Drawing.SolidBrush($neon)
$g.FillRectangle($brushE, 172, 0, 3, 312)
$brushE.Dispose()

$g.Dispose()
Save-Bmp $dialog $DialogFile

$b = Get-Item -LiteralPath $BannerFile
$d = Get-Item -LiteralPath $DialogFile
Write-Host "Banner 493x58 : $BannerFile ($($b.Length) bytes)"
Write-Host "Dialogo 493x312: $DialogFile ($($d.Length) bytes)"
