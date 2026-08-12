#!/usr/bin/env bash
#
# Sube la versión, commitea, empaqueta en .zip y (opcionalmente) pushea.
#
# Usage:
#   ./scripts/publish.sh -m "Agrega atajo para pausar"
#   Sube versión patch, commitea y crea el .zip. No pushea.
#
#   ./scripts/publish.sh -m "Agrega atajo para pausar" -b minor -p
#   Igual, pero además pushea al remoto.
#
# Options:
#   -m <mensaje>   Mensaje de commit (obligatorio)
#   -b <bump>      patch|minor|major|none (default: patch)
#   -p             Pushea al remoto después de commitear
#   -h             Muestra esta ayuda
#
# Nota sobre publicar en el Chrome Web Store: a diferencia de "vsce publish"
# para el VS Code Marketplace, Chrome NO tiene un CLI oficial de primera
# parte para publicar. La única vía es la Chrome Web Store API, que exige
# credenciales OAuth propias (client id/secret + refresh token) generadas en
# Google Cloud Console. Este script no las inventa ni las asume: al final te
# deja el .zip listo y te muestra el paso manual (o cómo automatizarlo si
# vos mismo configurás esas credenciales).

set -euo pipefail

step() {
  printf '\033[36m==> %s\033[0m\n' "$1"
}

warn() {
  printf '\033[33m%s\033[0m\n' "$1"
}

usage() {
  sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

message=""
bump="patch"
push=false

while getopts ":m:b:ph" opt; do
  case "$opt" in
    m) message="$OPTARG" ;;
    b) bump="$OPTARG" ;;
    p) push=true ;;
    h) usage ;;
    \?) echo "Opción desconocida: -$OPTARG" >&2; usage ;;
    :) echo "La opción -$OPTARG necesita un valor." >&2; usage ;;
  esac
done

if [ -z "$message" ]; then
  echo "Error: -m <mensaje> es obligatorio" >&2
  usage
fi

case "$bump" in
  patch|minor|major|none) ;;
  *) echo "Error: -b debe ser patch|minor|major|none" >&2; exit 1 ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Error: se necesita Node.js (para bump_version.js y package.js)." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ "$bump" != "none" ]; then
  step "Subiendo versión ($bump)"
  node scripts/bump_version.js "$bump"
fi

version="$(node -p "require('./manifest.json').version")"

step "Empaquetando extensión (dist/auto-action-v$version.zip)"
node scripts/package.js

step "Preparando commit"
git add -A

if git diff --cached --quiet; then
  warn "Nada para commitear."
else
  git commit -m "$message (v$version)"
fi

if [ "$push" = true ]; then
  step "Pusheando al remoto"
  git push
else
  warn "Se salteó git push. Volvé a correr con -p para pushear."
fi

warn "Publicar en el Chrome Web Store no tiene CLI oficial (a diferencia de 'vsce publish')."
echo "Subí manualmente dist/auto-action-v$version.zip en:" >&2
echo "  https://chrome.google.com/webstore/devconsole" >&2
echo "(o configurá la Chrome Web Store API con tus propias credenciales OAuth" >&2
echo " si querés automatizar este paso más adelante)." >&2

printf '\033[32mListo. v%s\033[0m\n' "$version"
