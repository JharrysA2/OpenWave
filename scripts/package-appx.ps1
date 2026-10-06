<#
.SYNOPSIS
  Construye el paquete sparse de identidad de OpenWave (openwave-identity.msix).

.DESCRIPTION
  El paquete da identidad de paquete a OpenWave.exe: los procesos hijos de
  WebView2 heredan la identidad por token y el Administrador de Tareas los
  agrupa en UN solo grupo «OpenWave» con el icono original, en lugar del
  grupo «Administrador de WebView2» (bug conocido: MicrosoftEdge/
  WebView2Feedback#5628, tauri#15567). Ver docs/PERFORMANCE.md §9.3.

  Pasos:
    1. Coherencia de identidad: packaging/appx/AppxManifest.xml (Identity y
       Application) vs packaging/appx/app.manifest (elemento <msix> del exe).
       Si no coinciden, el registro funciona pero en runtime NO hay identidad
       (error documentado 0x80073D54): aqui se aborta antes de construir.
    2. Staging: AppxManifest.xml con Version sincronizado con
       src-tauri/tauri.conf.json (1.0.0 -> 1.0.0.0) + Assets generados desde
       src-tauri/icons/128x128.png (50/44/150 px + el set targetsize
       16..256 en tres formas: default, unplated y lightunplated).
    3. Certificado de firma CN=OpenWave en Cert:\CurrentUser\My
       (autocreado si falta o caduca en menos de 30 dias) + export del .cer a
       la salida + confianza en Cert:\CurrentUser\TrustedPeople (sin ella,
       Add-AppxPackage falla con 0x800B0109).
    4. makeappx pack /nv (la /nv es obligatoria: en un paquete sparse el
       .exe vive FUERA, en ExternalLocation, y makeappx lo rechazaria) +
       signtool sign/verify.

  Salidas (en build\windows por defecto):
    openwave-identity.msix  -> tauri.conf.json (bundle.resources) lo mete en
                               el MSI; la SAC RegisterIdentity lo registra
                               con -ExternalLocation [INSTALLDIR].
    openwave-identity.cer   -> tambien va en el MSI (import de confianza).

.NOTES
  Se ejecuta en Windows (makeappx/signtool/System.Drawing). package-windows.ps1
  lo invoca ANTES de `npx tauri build` porque bundle.resources tiene que
  existir al empaquetar. Ejecutarlo a mano:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-appx.ps1
#>
[CmdletBinding()]
param(
    # Carpeta de salida (por defecto build\windows, igual que el MSI).
    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($env:OS -ne 'Windows_NT') {
    throw 'package-appx.ps1 solo se ejecuta en Windows.'
}

$root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $root 'build\windows' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$appxManifest = Join-Path $root 'packaging\appx\AppxManifest.xml'
$appManifest  = Join-Path $root 'packaging\appx\app.manifest'
$icon128      = Join-Path $root 'src-tauri\icons\128x128.png'
$confPath     = Join-Path $root 'src-tauri\tauri.conf.json'
foreach ($f in @($appxManifest, $appManifest, $icon128, $confPath)) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Falta el fichero de entrada: $f" }
}

Write-Host '== OpenWave: paquete sparse de identidad =='

# ── 1. Coherencia de identidad (appx vs manifiesto del exe) ─────────────────
[xml]$appx = Get-Content -Raw -LiteralPath $appxManifest
[xml]$appm = Get-Content -Raw -LiteralPath $appManifest

$name      = [string]$appx.Package.Identity.Name
$publisher = [string]$appx.Package.Identity.Publisher
$appId     = [string]$appx.Package.Applications.Application.Id
$exeName   = [string]$appx.Package.Applications.Application.Executable
$nsMgr     = New-Object System.Xml.XmlNamespaceManager($appx.NameTable)
$nsMgr.AddNamespace('p', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
$nsMgr.AddNamespace('uap10', 'http://schemas.microsoft.com/appx/manifest/uap/windows10/10')
# El elemento esta en el namespace uap10; sin el prefijo p: en Package/Properties
# el XPath no matchea (la raiz lleva xmlns por defecto del foundation).
$allowExt  = $appx.SelectSingleNode('/p:Package/p:Properties/uap10:AllowExternalContent', $nsMgr)

$msix = $appm.assembly.msix
if (-not $msix) { throw 'packaging\appx\app.manifest no contiene el elemento <msix>.' }

$problems = @()
if ($publisher -ne 'CN=OpenWave')    { $problems += "Publisher='$publisher' (se espera CN=OpenWave)" }
if ($name -ne 'OpenWave')            { $problems += "Identity Name='$name' (se espera OpenWave)" }
if ($appId -ne 'App')                { $problems += "Application Id='$appId' (se espera App)" }
if ($exeName -ne 'OpenWave.exe')     { $problems += "Executable='$exeName' (se espera OpenWave.exe)" }
if ([string]$msix.publisher -ne $publisher)     { $problems += "app.manifest msix@publisher='$( $msix.publisher )' != '$publisher'" }
if ([string]$msix.packageName -ne $name)        { $problems += "app.manifest msix@packageName='$( $msix.packageName )' != '$name'" }
if ([string]$msix.applicationId -ne $appId)     { $problems += "app.manifest msix@applicationId='$( $msix.applicationId )' != '$appId'" }
if (-not $allowExt -or $allowExt.InnerText -ne 'true') {
    $problems += 'Falta <uap10:AllowExternalContent>true</uap10:AllowExternalContent> (Add-AppxPackage fallaria con 0x80073D2E)'
}
if ($problems.Count) {
    throw ("Identidad incoherente entre paquete y exe:`n  - " + ($problems -join "`n  - "))
}
Write-Host "  identidad coherente: $name / $publisher / $appId"

# ── 2. Version sincronizada con tauri.conf.json ─────────────────────────────
$version = [string](Get-Content -Raw -LiteralPath $confPath | ConvertFrom-Json).version
$parts = @($version -split '\.' | ForEach-Object { if ($_ -match '^\d+$') { [int]$_ } else { 0 } })
while ($parts.Count -lt 4) { $parts += 0 }
$msixVersion = (@($parts[0..3]) -join '.')
Write-Host "  version: tauri.conf.json=$version -> msix=$msixVersion"

$stage = Join-Path $OutDir 'appx-staging'
if (Test-Path -LiteralPath $stage) { Remove-Item -Recurse -Force -LiteralPath $stage }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'Assets') | Out-Null

$appx.Package.Identity.Version = $msixVersion
$appx.Save((Join-Path $stage 'AppxManifest.xml'))

# ── 3. Assets desde el icono fuente (50 / 44 / 150 px) ──────────────────────
Add-Type -AssemblyName System.Drawing
function New-Asset([int]$size, [string]$name, [string]$src, [string]$dstDir) {
    $img = [System.Drawing.Image]::FromFile($src)
    try {
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($img, 0, 0, $size, $size)
        $g.Dispose()
        $bmp.Save((Join-Path $dstDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    } finally { $img.Dispose() }
}
$assetsDir = Join-Path $stage 'Assets'
New-Asset 50  'StoreLogo.png'          $icon128 $assetsDir
New-Asset 44  'Square44x44Logo.png'    $icon128 $assetsDir
New-Asset 150 'Square150x150Logo.png'  $icon128 $assetsDir
Write-Host '  assets: StoreLogo 50, Square44x44 44, Square150x150 150'

# Variantes target-based: el SET COMPLETO targetsize-N x 3 formas, no solo la
# de 44 px. El taskbar, la lista de apps de Start, el buscador, Alt+Tab y
# snap-assist piden un targetsize EXACTO (al 100 % de escala: 24 px taskbar,
# 32 px pins, 48 px Alt+Tab); si no existe la variante de ese tamano el shell
# escala la base y la compone sobre una placa opaca del BackgroundColor, y las
# esquinas del icono salen a color (primero moradas por el color dominante,
# despues negras con BackgroundColor=#0a0a0f). La doc MSIX «App icon» exige ademas
# las tres formas (default, unplated «dark», lightunplated «light») para todos
# los tamanos: sin ellas "your icon will appear on a system icon plate".
# El nombre va pegado al recurso del atributo Square44x44Logo ( asi resuelve MRT
# los calificadores targetsize/altform ). Receta oficial «Add Target-based
# unplated assets» + «Generate a Package Resource Index (PRI)» (makepri, mas
# abajo). El Task Manager no se toca: su icono viene del exe (icon.ico).
$targetSizes = @(16, 20, 24, 30, 32, 36, 40, 44, 48, 60, 64, 72, 80, 96, 256)
$assetForms  = @('', '_altform-unplated', '_altform-lightunplated')
foreach ($ts in $targetSizes) {
    foreach ($form in $assetForms) {
        New-Asset $ts "Square44x44Logo.targetsize-$ts$form.png" $icon128 $assetsDir
    }
}
Write-Host ("  target-based: " + $targetSizes.Count + " tamanos x " + $assetForms.Count +
    " formas = " + ($targetSizes.Count * $assetForms.Count) + " variantes")

# ── 4. Certificado de firma (idempotente, autorenovable) ────────────────────
$cert = Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq 'CN=OpenWave' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
$renewed = $false
if (-not $cert) {
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=OpenWave' `
        -FriendlyName 'OpenWave paquete identidad (sparse)' `
        -CertStoreLocation Cert:\CurrentUser\My `
        -NotAfter (Get-Date).AddYears(3)
    $renewed = $true
    Write-Host '  certificado: nuevo'
}
Write-Host "  certificado: $($cert.Thumbprint) (caduca $($cert.NotAfter.ToString('yyyy-MM-dd')))"

$cerPath = Join-Path $OutDir 'openwave-identity.cer'
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
$trusted = Get-ChildItem Cert:\CurrentUser\TrustedPeople -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
if (-not $trusted) {
    Import-Certificate -FilePath $cerPath -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null
    Write-Host '  confianza: cer importado a CurrentUser\TrustedPeople'
} else {
    Write-Host '  confianza: cer ya presente en TrustedPeople'
}

# ── 5. makeappx pack (/nv) + signtool ───────────────────────────────────────
$kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
$makeappx = $null
if (Test-Path -LiteralPath $kits) {
    $makeappx = Get-ChildItem -Path (Join-Path $kits '*\x64\makeappx.exe') -ErrorAction SilentlyContinue |
        Sort-Object { [version]($_.Directory.Parent.Name) } -Descending | Select-Object -First 1
}
if (-not $makeappx) {
    throw 'No se encuentra makeappx.exe en "Windows Kits\10\bin\<ver>\x64" (instala el Windows 10/11 SDK).'
}
$signtool = Join-Path $makeappx.Directory.FullName 'signtool.exe'
if (-not (Test-Path -LiteralPath $signtool)) { throw "No se encuentra signtool.exe junto a makeappx: $signtool" }

# resources.pri (makepri): obligatorio para que el shell resuelva la variante
# targetsize-44_altform-unplated (los target-based assets exigen PRI; doc MSIX
# «Generate a Package Resource Index (PRI) file using MakePri»). /dq tiene que
# coincidir con <Resource Language> del manifiesto (en-us). El priconfig vive
# FUERA de la carpeta indexada para no entrar en el propio PRI.
$makepri = Get-ChildItem -Path (Join-Path $kits '*\x64\makepri.exe') -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Directory.Parent.Name) } -Descending | Select-Object -First 1
if (-not $makepri) {
    throw 'No se encuentra makepri.exe en "Windows Kits\10\bin\<ver>\x64" (instala el Windows 10/11 SDK).'
}
$priconfig = Join-Path $OutDir 'priconfig.xml'
$priPath   = Join-Path $stage 'resources.pri'
& $makepri.FullName createconfig /cf $priconfig /dq en-US /o
if ($LASTEXITCODE -ne 0) { throw "makepri createconfig ha fallado (codigo $LASTEXITCODE)." }
& $makepri.FullName new /pr $stage /cf $priconfig /of $priPath /o
if ($LASTEXITCODE -ne 0) { throw "makepri new ha fallado (codigo $LASTEXITCODE)." }
if (-not (Test-Path -LiteralPath $priPath)) { throw 'makepri no ha generado resources.pri.' }
Remove-Item -LiteralPath $priconfig -Force   # priconfig.xml no viaja en el paquete
Write-Host '  resources.pri generado (assets unplated resolubles)'

$msixPath = Join-Path $OutDir 'openwave-identity.msix'
& $makeappx.FullName pack /d $stage /p $msixPath /o /nv
if ($LASTEXITCODE -ne 0) { throw "makeappx pack ha fallado (codigo $LASTEXITCODE)." }
& $signtool sign /fd SHA256 /sha1 $cert.Thumbprint /q $msixPath
if ($LASTEXITCODE -ne 0) { throw "signtool sign ha fallado (codigo $LASTEXITCODE)." }
& $signtool verify /pa /q $msixPath
if ($LASTEXITCODE -ne 0) { throw "signtool verify ha fallado (codigo $LASTEXITCODE)." }

$size = (Get-Item -LiteralPath $msixPath).Length
Write-Host ''
Write-Host '== Paquete de identidad generado =='
Write-Host "  $msixPath ($size bytes)"
Write-Host "  $cerPath"
if ($renewed) {
    Write-Host '  NOTA: certificado renovado: si habia un paquete registrado con el'
    Write-Host '  anterior, re-registralo (el MSI lo hace con Remove-Add en instalar).'
}
