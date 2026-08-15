<#
Reinicia el gateway ARRIS TG2482 (192.168.60.1) usando el endpoint HTTP
que ya usa panel-routers.html (?util_restart), con autenticacion basica.
#>

param(
    [string]$Ip = "192.168.60.1",
    [string]$User = "admin",
    [string]$Password = "alvaro"
)

$ErrorActionPreference = "Stop"

$pair = "${User}:${Password}"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
$basicAuth = [System.Convert]::ToBase64String($bytes)
$headers = @{ Authorization = "Basic $basicAuth" }

$url = "http://$Ip/?util_restart"

Write-Host "Reiniciando ARRIS en $Ip ..."

try {
    $response = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 15
    Write-Host "Solicitud enviada. Codigo de respuesta: $($response.StatusCode)"
    Write-Host "El equipo deberia reiniciarse en unos segundos."
}
catch {
    Write-Warning "Fallo la solicitud: $($_.Exception.Message)"
    Write-Warning "Si el ARRIS usa login por formulario en vez de Basic Auth, avisa para ajustar el script."
    exit 1
}
