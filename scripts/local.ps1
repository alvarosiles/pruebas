<#
.SYNOPSIS
  Abre Brave en un perfil de pruebas AISLADO en %TEMP% y carga la extensión
  Auto Action vía DevTools Protocol, lista para probar en un solo comando.

.EXAMPLE
  ./scripts/local.ps1
  Abre example.com con la extensión ya instalada.

.EXAMPLE
  ./scripts/local.ps1 -Url https://tu-pagina-de-prueba.com
  Igual, pero abre esa URL en vez de example.com.

.NOTES
  Detalle técnico:
    1. Abre Brave con -UserDataDir apuntando a un perfil descartable en
       %TEMP% (nunca tu perfil real, incluso si Brave ya está corriendo).
    2. Carga la extensión con el método oficial del DevTools Protocol
       (Extensions.loadUnpacked) en vez de --load-extension, que Chrome/
       Brave puede ignorar en versiones recientes si Developer mode no
       está activado en ese perfil.

  Requiere Node.js o Python 3 (sin dependencias externas: el cliente de
  WebSocket para hablar con el DevTools Protocol está escrito a mano en
  _cdp_loader.js / _cdp_loader.py).
#>

param(
    [string]$Url = "https://example.com"
)

$ErrorActionPreference = 'Stop'

function Step($text) {
    Write-Host "==> $text" -ForegroundColor Cyan
}

$root = Split-Path -Parent $PSScriptRoot
$extDir = $root
$profileDir = Join-Path $env:TEMP "auto-action-test-profile"
$port = 9333

$browserCandidates = @(
    "${env:ProgramFiles}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:LocalAppData}\BraveSoftware\Brave-Browser\Application\brave.exe"
)
$browser = $browserCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $browser) {
    Write-Error "No se encontró Brave instalado en el sistema."
    exit 1
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $loaderCmd = "node"
    $loaderArgs = @((Join-Path $PSScriptRoot "_cdp_loader.js"))
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $loaderCmd = "python"
    $loaderArgs = @((Join-Path $PSScriptRoot "_cdp_loader.py"))
}
else {
    Write-Error "Se necesita Node.js o Python 3 para automatizar la carga."
    exit 1
}

if (-not (Test-Path (Join-Path $extDir "manifest.json"))) {
    Write-Error "No se encontró manifest.json en $extDir"
    exit 1
}

Step "Preparando perfil de pruebas descartable"
# Siempre fresco: evita acumular recargas duplicadas de la extensión entre
# corridas y garantiza un estado predecible. Como vive en %TEMP% con un
# nombre propio, esto NUNCA toca tu perfil real de Brave (solo se mata el
# proceso que ya esté usando ESTE mismo directorio temporal, si lo hay).
Get-CimInstance Win32_Process -Filter "Name = 'brave.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("user-data-dir=$profileDir") } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

Write-Host "Navegador: $browser"
Write-Host "Extensión: $extDir"
Write-Host "Perfil de pruebas: $profileDir (aislado, no afecta tu perfil normal)"

Step "Abriendo Brave"
Start-Process -FilePath $browser -ArgumentList @(
    "--user-data-dir=$profileDir",
    "--remote-debugging-port=$port",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
)

Step "Instalando la extensión vía DevTools Protocol"
& $loaderCmd @loaderArgs $port $extDir $Url
if ($LASTEXITCODE -ne 0) {
    Write-Host "No se pudo automatizar la instalación (ver error arriba)." -ForegroundColor Yellow
    Write-Host "Podés hacerlo a mano: en la ventana que se abrió, andá a brave://extensions," -ForegroundColor Yellow
    Write-Host "activá 'Developer mode' y usá 'Cargar descomprimida' seleccionando:" -ForegroundColor Yellow
    Write-Host "  $extDir" -ForegroundColor Yellow
    exit 1
}

Write-Host "Listo. Auto Action está instalada y activa en esta ventana de Brave." -ForegroundColor Green
Write-Host "Abrí el popup (icono ⚡ de la barra de extensiones) sobre la pestaña de prueba."
