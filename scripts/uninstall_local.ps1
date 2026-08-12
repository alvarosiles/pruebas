<#
.SYNOPSIS
  Limpia el perfil de pruebas descartable que crea scripts/local.ps1.

.EXAMPLE
  ./scripts/uninstall_local.ps1

.NOTES
  Importante: Chrome/Brave NO tiene un comando de línea para desinstalar
  una extensión (a diferencia de "code --uninstall-extension" en VS Code).
  Este script solo puede limpiar el perfil temporal aislado que usa
  local.ps1; si además cargaste "Cargar descomprimida" a mano en tu perfil
  real de Brave, tenés que sacarla vos desde brave://extensions (este
  script te muestra los pasos exactos al final).
#>

$ErrorActionPreference = 'Stop'

function Step($text) {
    Write-Host "==> $text" -ForegroundColor Cyan
}

$profileDir = Join-Path $env:TEMP "auto-action-test-profile"

$procs = Get-CimInstance Win32_Process -Filter "Name = 'brave.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("user-data-dir=$profileDir") }

if ($procs) {
    Step "Cerrando la ventana de pruebas"
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

if (Test-Path $profileDir) {
    Step "Borrando perfil de pruebas ($profileDir)"
    Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
    Write-Host "Listo. No quedó ningún rastro de la ventana de pruebas." -ForegroundColor Green
}
else {
    Write-Host "No había ningún perfil de pruebas activo (nada que limpiar)."
}

Write-Host ""
Write-Host "¿La cargaste también en tu Brave normal con 'Cargar descomprimida'?"
Write-Host "Ese modo no se puede sacar por línea de comandos: andá a brave://extensions,"
Write-Host "buscá 'Auto Action' y usá 'Quitar' (o el interruptor para desactivarla sin quitarla)."
