<#
.SYNOPSIS
  Sube la versión, commitea, empaqueta en .zip y (opcionalmente) pushea.

.EXAMPLE
  ./scripts/publish.ps1 -Message "Agrega atajo para pausar"
  Sube versión patch, commitea y crea el .zip. No pushea.

.EXAMPLE
  ./scripts/publish.ps1 -Message "Agrega atajo para pausar" -Bump minor -Push
  Igual, pero además pushea al remoto.

.NOTES
  Publicar en el Chrome Web Store no tiene CLI oficial (a diferencia de
  "vsce publish" para el VS Code Marketplace). La única vía es la Chrome
  Web Store API, que exige credenciales OAuth propias generadas en Google
  Cloud Console. Este script no las inventa ni las asume: al final deja el
  .zip listo y muestra el paso manual.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [ValidateSet('patch', 'minor', 'major', 'none')]
    [string]$Bump = 'patch',

    [switch]$Push
)

$ErrorActionPreference = 'Stop'

function Step($text) {
    Write-Host "==> $text" -ForegroundColor Cyan
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Se necesita Node.js (para bump_version.js y package.js)."
    exit 1
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Bump -ne 'none') {
    Step "Subiendo versión ($Bump)"
    node scripts/bump_version.js $Bump
    if ($LASTEXITCODE -ne 0) { throw "No se pudo subir la versión" }
}

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version

Step "Empaquetando extensión (dist/auto-action-v$version.zip)"
node scripts/package.js
if ($LASTEXITCODE -ne 0) { throw "El empaquetado falló" }

Step "Preparando commit"
git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nada para commitear." -ForegroundColor Yellow
}
else {
    git commit -m "$Message (v$version)"
    if ($LASTEXITCODE -ne 0) { throw "El commit falló" }
}

if ($Push) {
    Step "Pusheando al remoto"
    git push
    if ($LASTEXITCODE -ne 0) { throw "El push falló" }
}
else {
    Write-Host "Se salteó git push. Volvé a correr con -Push para pushear." -ForegroundColor Yellow
}

Write-Host "Publicar en el Chrome Web Store no tiene CLI oficial (a diferencia de 'vsce publish')." -ForegroundColor Yellow
Write-Host "Subí manualmente dist/auto-action-v$version.zip en:" -ForegroundColor Yellow
Write-Host "  https://chrome.google.com/webstore/devconsole" -ForegroundColor Yellow

Write-Host "Listo. v$version" -ForegroundColor Green
