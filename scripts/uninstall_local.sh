#!/usr/bin/env bash
#
# Limpia el perfil de pruebas descartable que crea scripts/local.sh.
#
# Usage:
#   ./scripts/uninstall_local.sh
#
# Importante: Chrome/Brave NO tiene un comando de línea para desinstalar
# una extensión (a diferencia de "code --uninstall-extension" en VS Code).
# Este script solo puede limpiar el perfil temporal aislado que usa
# local.sh; si además cargaste "Cargar descomprimida" a mano en tu perfil
# real de Brave, tenés que sacarla vos desde brave://extensions (este
# script te muestra los pasos exactos al final).

set -euo pipefail

step() {
  printf '\033[36m==> %s\033[0m\n' "$1"
}

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage

profile_dir="/tmp/auto-action-test-profile"

if pgrep -f "user-data-dir=$profile_dir" >/dev/null 2>&1; then
  step "Cerrando la ventana de pruebas"
  pkill -9 -f "user-data-dir=$profile_dir" >/dev/null 2>&1 || true
  sleep 0.5
fi

if [[ -d "$profile_dir" ]]; then
  step "Borrando perfil de pruebas ($profile_dir)"
  rm -rf "$profile_dir"
  printf '\033[32m%s\033[0m\n' "Listo. No quedó ningún rastro de la ventana de pruebas."
else
  echo "No había ningún perfil de pruebas activo (nada que limpiar)."
fi

echo
echo "¿La cargaste también en tu Brave normal con 'Cargar descomprimida'?"
echo "Ese modo no se puede sacar por línea de comandos: andá a brave://extensions,"
echo "buscá 'Auto Action' y usá 'Quitar' (o el interruptor para desactivarla sin quitarla)."
