#!/usr/bin/env bash
#
# Abre Brave en un perfil de pruebas AISLADO en /tmp y carga la extensión
# Auto Action vía DevTools Protocol, lista para probar en un solo comando.
#
# Usage:
#   ./scripts/local.sh
#   Abre example.com con la extensión ya instalada.
#
#   ./scripts/local.sh https://tu-pagina-de-prueba.com
#   Igual, pero abre esa URL en vez de example.com.
#
# Detalle técnico:
#   1. Abre Brave con --user-data-dir apuntando a un perfil descartable en
#      /tmp (nunca tu perfil real, incluso si Brave ya está corriendo).
#   2. Carga la extensión con el método oficial del DevTools Protocol
#      (Extensions.loadUnpacked) en vez de --load-extension, que Chrome/
#      Brave puede ignorar en versiones recientes si Developer mode no está
#      activado en ese perfil.
#
# Requiere Node.js o Python 3 (sin dependencias externas: el cliente de
# WebSocket para hablar con el DevTools Protocol está escrito a mano en
# _cdp_loader.js / _cdp_loader.py).

set -euo pipefail

step() {
  printf '\033[36m==> %s\033[0m\n' "$1"
}

warn() {
  printf '\033[33m%s\033[0m\n' "$1"
}

usage() {
  sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ext_dir="$root"
profile_dir="/tmp/auto-action-test-profile"
port=9333
url="${1:-https://example.com}"

browser=""
for bin in brave-browser brave-browser-stable brave; do
  if command -v "$bin" >/dev/null 2>&1; then
    browser="$bin"
    break
  fi
done

if [[ -z "$browser" ]]; then
  # Windows (Git Bash/MSYS): el binario no vive en el PATH con esos nombres
  # de Linux, hay que buscarlo en su ruta típica de instalación.
  for win_path in \
    "/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" \
    "/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"; do
    if [[ -f "$win_path" ]]; then
      browser="$win_path"
      break
    fi
  done
fi

if [[ -z "$browser" ]]; then
  echo "Error: no se encontró Brave instalado en el sistema." >&2
  exit 1
fi

loader_cmd=()
if command -v node >/dev/null 2>&1; then
  loader_cmd=(node "$root/scripts/_cdp_loader.js")
elif command -v python3 >/dev/null 2>&1; then
  loader_cmd=(python3 "$root/scripts/_cdp_loader.py")
fi

if [[ ${#loader_cmd[@]} -eq 0 ]]; then
  echo "Error: se necesita Node.js o Python 3 para automatizar la carga." >&2
  exit 1
fi

if [[ ! -f "$ext_dir/manifest.json" ]]; then
  echo "Error: no se encontró manifest.json en $ext_dir" >&2
  exit 1
fi

step "Preparando perfil de pruebas descartable"
# Siempre fresco: evita acumular recargas duplicadas de la extensión entre
# corridas y garantiza un estado predecible. Como vive en /tmp con un nombre
# propio, esto NUNCA toca tu perfil real de Brave (el kill de abajo solo
# apunta a procesos que ya estén usando ESTE mismo directorio temporal).
pkill -9 -f "user-data-dir=$profile_dir" >/dev/null 2>&1 || true
sleep 0.5
rm -rf "$profile_dir"
mkdir -p "$profile_dir"

echo "Navegador: $browser"
echo "Extensión: $ext_dir"
echo "Perfil de pruebas: $profile_dir (aislado, no afecta tu perfil normal)"

step "Abriendo Brave"
"$browser" \
  --user-data-dir="$profile_dir" \
  --remote-debugging-port="$port" \
  --no-first-run \
  --no-default-browser-check \
  about:blank \
  >/dev/null 2>&1 &
disown

step "Instalando la extensión vía DevTools Protocol"
if "${loader_cmd[@]}" "$port" "$ext_dir" "$url"; then
  printf '\033[32m%s\033[0m\n' "Listo. Auto Action está instalada y activa en esta ventana de Brave."
  echo "Abrí el popup (icono ⚡ de la barra de extensiones) sobre la pestaña de prueba."
else
  warn "No se pudo automatizar la instalación (ver error arriba)."
  echo "Podés hacerlo a mano: en la ventana que se abrió, andá a brave://extensions," >&2
  echo "activá 'Developer mode' y usá 'Cargar descomprimida' seleccionando:" >&2
  echo "  $ext_dir" >&2
  exit 1
fi
