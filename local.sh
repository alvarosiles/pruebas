#!/usr/bin/env bash
# local.sh
# Lanza Brave con la extensión "Auto Action" cargada en modo desarrollador,
# usando un --user-data-dir aislado.
#
# ADVERTENCIA IMPORTANTE (probado en este equipo): si Brave YA está abierto,
# los navegadores basados en Chromium suelen reenviar la orden de "abrir
# estas URLs" a la ventana que ya está corriendo, IGNORANDO --user-data-dir
# y --load-extension. Es decir: el aislamiento de perfil NO está garantizado
# si Brave ya estaba en ejecución. Este script detecta ese caso y avisa antes
# de lanzar, para que decidas si cerrar Brave primero o continuar de todos
# modos.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR"
PROFILE_DIR="$SCRIPT_DIR/.brave-test-profile"
TEST_URL="${1:-https://example.com}"

# Localiza el binario de Brave (varía según instalación: paquete .deb, snap, flatpak)
BRAVE_BIN=""
for candidate in brave-browser brave-browser-stable brave; do
  if command -v "$candidate" >/dev/null 2>&1; then
    BRAVE_BIN="$candidate"
    break
  fi
done

if [[ -z "$BRAVE_BIN" ]] && command -v flatpak >/dev/null 2>&1 && flatpak list 2>/dev/null | grep -q com.brave.Browser; then
  BRAVE_BIN="flatpak run com.brave.Browser"
fi

if [[ -z "$BRAVE_BIN" ]]; then
  echo "No se encontró Brave instalado (probé: brave-browser, brave-browser-stable, brave, flatpak com.brave.Browser)." >&2
  echo "Instálalo o ajusta BRAVE_BIN en este script." >&2
  exit 1
fi

if [[ ! -f "$EXT_DIR/manifest.json" ]]; then
  echo "No se encontró manifest.json en $EXT_DIR" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

# Detecta un proceso principal de Brave ya corriendo (excluye helpers como
# zygote/gpu/utility/renderer/crashpad, que siempre acompañan al principal).
ALREADY_RUNNING=""
if pgrep -f '/brave(-browser)?[^/]*$' >/dev/null 2>&1 || pgrep -x brave >/dev/null 2>&1; then
  if pgrep -af brave 2>/dev/null | grep -vE -- '--type=|crashpad|chrome-sandbox|chrome_crashpad' | grep -qE 'brave($| )'; then
    ALREADY_RUNNING="1"
  fi
fi

if [[ -n "$ALREADY_RUNNING" ]]; then
  cat >&2 <<'EOF'
⚠️  Brave ya está abierto en este equipo.

En este entorno se comprobó que, con Brave ya corriendo, un nuevo lanzamiento
con --user-data-dir/--load-extension puede ser IGNORADO: Chromium reenvía la
orden a la ventana que ya tenías abierta (con tu perfil real) en vez de crear
una instancia aislada nueva. Es decir, la extensión podría NO cargarse, y en
cambio se abrirían pestañas nuevas en tu Brave normal.

Opciones:
  1) Cerrá todas las ventanas de Brave y volvé a correr ./local.sh
  2) Continuá igual (puede abrir pestañas en tu ventana actual en vez de un
     perfil aislado) — se hace en 5s, Ctrl+C para cancelar.
EOF
  sleep 5
fi

echo "Extensión: $EXT_DIR"
echo "Perfil de pruebas (aislado si no había Brave abierto): $PROFILE_DIR"
echo "Página de prueba: $TEST_URL"
echo "Binario: $BRAVE_BIN"
echo

# --load-extension carga la carpeta como "descomprimida" (equivalente a
# hacerlo manualmente desde chrome://extensions).
# --user-data-dir aísla el perfil para no mezclar con tu Brave normal.
# --new-window: si Chromium igual reenvía la orden a una instancia existente,
# que al menos abra una ventana nueva (más fácil de identificar y cerrar) en
# vez de pestañas sueltas mezcladas con las tuyas.
exec $BRAVE_BIN \
  --user-data-dir="$PROFILE_DIR" \
  --load-extension="$EXT_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --new-window \
  "chrome://extensions/" \
  "$TEST_URL"
