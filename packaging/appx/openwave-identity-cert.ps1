<#
.SYNOPSIS
  Importa el certificado de identidad de OpenWave en LocalMachine\TrustedPeople.

.DESCRIPTION
  Lo invoca el MSI como accion diferida y elevada (Impersonate="no") despues
  de InstallFiles. Add-AppxPackage solo valida la firma del paquete sparse
  contra LocalMachine\TrustedPeople; un CA inmediato corre impersonado y no
  puede escribir ahi. El registro del paquete lo hace despues
  openwave-identity-ca.ps1 -Mode Register en el contexto del usuario.

  Fichero 100% ASCII: Windows PowerShell 5.1 lo lee como ANSI si no hay BOM.
#>

$ErrorActionPreference = 'Stop'

$cer = Join-Path $PSScriptRoot 'openwave-identity.cer'
$log = $null
if ($env:ProgramData) {
    $dataDir = Join-Path $env:ProgramData 'OpenWave'
    try {
        New-Item -ItemType Directory -Force -Path $dataDir -ErrorAction Stop | Out-Null
        $log = Join-Path $dataDir 'openwave-identity.log'
    } catch { $log = $null }
}

function Log([string]$msg) {
    if (-not $log) { return }
    $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' [Cert] ' + $msg
    try { Add-Content -LiteralPath $log -Value $line } catch { }
}

try {
    if (-not (Test-Path -LiteralPath $cer)) {
        throw ('falta el certificado: ' + $cer)
    }
    $thumb = (Get-PfxCertificate -FilePath $cer).Thumbprint
    Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople -ErrorAction Stop | Out-Null
    $presente = Get-ChildItem 'Cert:\LocalMachine\TrustedPeople' -ErrorAction SilentlyContinue |
        Where-Object { $_.Thumbprint -eq $thumb }
    if (-not $presente) {
        throw ('el certificado no quedo en LocalMachine\TrustedPeople: ' + $thumb)
    }
    Log ('import ok thumb=' + $thumb)
    exit 0
} catch {
    Log ('ERR ' + $_.Exception.Message)
    exit 1
}
