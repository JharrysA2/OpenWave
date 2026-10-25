#!/usr/bin/env bash
# Compila OpenWave y lo deja como paquete nativo de Arch (.pkg.tar.zst).
#
#   scripts/package-arch.sh             prepara staging + binario y empaqueta
#   scripts/package-arch.sh --no-build  solo empaqueta (los artefactos ya están)
#
# Salida: packaging/arch/openwave-<version>-x86_64.pkg.tar.zst
# Instalar: sudo pacman -U packaging/arch/openwave-<version>-x86_64.pkg.tar.zst
#
# Requiere makepkg (paquete «pacman») y fakeroot. El PKGBUILD vive en
# packaging/arch/ y empaqueta sin recompilar: ver sus cabeceras.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/packaging/arch"
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v makepkg >/dev/null 2>&1 || die "falta makepkg (va en el paquete «pacman»)"

if [ "$BUILD" = "1" ]; then
  log "==> Staging (backend, runtime de Python y ffmpeg pineados)"
  "$ROOT/scripts/prepare-runtime.sh"
  log "==> Binario release (frontend + Rust, sin empaquetar)"
  (cd "$ROOT" && npx tauri build --no-bundle)
fi

[ -x "$ROOT/src-tauri/target/release/OpenWave" ] ||
  die "falta src-tauri/target/release/OpenWave (vuelve a lanzarlo sin --no-build)"
[ -d "$ROOT/build/staging-linux/backend" ] ||
  die "falta build/staging-linux (vuelve a lanzarlo sin --no-build)"

log "==> makepkg"
cd "$PKG"
rm -rf src pkg
makepkg -f || die "makepkg ha fallado. Si faltan dependencias, instálalas con
«sudo pacman -S <nombre>» (las tiene packaging/arch/PKGBUILD en «depends»)"

paquete="$(ls -t "$PKG"/openwave-*.pkg.tar.zst 2>/dev/null | head -1)"
[ -n "$paquete" ] || die "makepkg no generó ningún .pkg.tar.zst"

log ""
log "Paquete: $paquete"
log "Contenido: $(pacman -Qlp "$paquete" | wc -l) ficheros, $(du -h "$paquete" | cut -f1)"
log "Instalar:  sudo pacman -U ${paquete#"$ROOT/"}"
