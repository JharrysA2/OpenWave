#!/usr/bin/env bash
# Construye los paquetes de Linux de una release y deja los tres listos para
# `gh release upload`:
#
#   src-tauri/target/release/bundle/deb/OpenWave_<v>_amd64.deb
#   src-tauri/target/release/bundle/appimage/OpenWave_<v>_amd64.AppImage
#   packaging/arch/openwave-<v>-1-x86_64.pkg.tar.zst
#
#   scripts/package-linux.sh             los tres paquetes
#   scripts/package-linux.sh --no-arch   solo .deb y .AppImage
#
# Nota sobre el AppImage: el `strip` que va embebido en linuxdeploy no sabe
# tratar las secciones `.relr.dyn` de las libs del sistema actual y el bundler
# de Tauri aborta a mitad. El script deja que Tauri prepare el AppDir y luego
# completa el empaquetado con linuxdeploy extraído en build/cache usando el
# `strip` del sistema (idempotente: si Tauri termina solo, no se toca nada).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/build/cache"
EXTRACT="$CACHE/linuxdeploy-extract"
BUNDLE="$ROOT/src-tauri/target/release/bundle"
LD_CACHE="$HOME/.cache/tauri"
ARCH=1

for arg in "$@"; do
  case "$arg" in
    --no-arch) ARCH=0 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

VERSION="$(python3 -c 'import json;print(json.load(open("'"$ROOT"'/package.json"))["version"])')"
DEB="$BUNDLE/deb/OpenWave_${VERSION}_amd64.deb"
APPIMAGE="$BUNDLE/appimage/OpenWave_${VERSION}_amd64.AppImage"
APPDIR="$BUNDLE/appimage/OpenWave.AppDir"
PKG="$ROOT/packaging/arch/openwave-${VERSION}-1-x86_64.pkg.tar.zst"

cd "$ROOT"

log "==> Staging (backend, runtime y ffmpeg pineados)"
./scripts/prepare-runtime.sh

log "==> .deb"
npx tauri build --bundles deb
[ -f "$DEB" ] || die "no salió el .deb"

log "==> .AppImage"
if ! npx tauri build --bundles appimage; then
  log "Tauri no terminó el AppImage (casi siempre el strip de linuxdeploy); se completa a mano"
fi

if [ ! -f "$APPIMAGE" ]; then
  [ -d "$APPDIR" ] || die "falta $APPDIR: el build de AppImage no avanzó"
  [ -x "$LD_CACHE/linuxdeploy-x86_64.AppImage" ] ||
    die "falta linuxdeploy en $LD_CACHE (¿nunca corrió «tauri build --bundles appimage»?)"

  if [ ! -x "$EXTRACT/squashfs-root/AppRun" ]; then
    log "Extrayendo linuxdeploy en $EXTRACT"
    mkdir -p "$EXTRACT"
    (cd "$EXTRACT" && "$LD_CACHE/linuxdeploy-x86_64.AppImage" --appimage-extract >/dev/null)
  fi

  # El strip embebido no entiende `.relr.dyn`; se cambia por el del sistema.
  if [ ! -e "$EXTRACT/squashfs-root/usr/bin/strip.orig" ]; then
    mv "$EXTRACT/squashfs-root/usr/bin/strip" "$EXTRACT/squashfs-root/usr/bin/strip.orig"
  fi
  ln -sf "$(command -v strip)" "$EXTRACT/squashfs-root/usr/bin/strip"

  log "Empaquetando con linuxdeploy (strip del sistema, plugins gtk/gstreamer)"
  PATH="$EXTRACT/squashfs-root/usr/bin:$LD_CACHE:$PATH" \
    APPIMAGE_EXTRACT_AND_RUN=1 OUTPUT="$APPIMAGE" \
    "$EXTRACT/squashfs-root/AppRun" --appdir "$APPDIR" \
    --plugin gtk --plugin gstreamer --output appimage
  [ -f "$APPIMAGE" ] || die "no salió el AppImage (ver la salida de linuxdeploy)"
fi

if [ "$ARCH" = "1" ]; then
  log "==> .pkg.tar.zst (Arch)"
  ./scripts/package-arch.sh --no-build
  [ -f "$PKG" ] || die "no salió el paquete de Arch"
fi

log ""
log "Paquetes listos para «gh release upload v$VERSION ...»:"
ls -la "$DEB" "$APPIMAGE" "$PKG" 2>/dev/null || ls -la "$DEB" "$APPIMAGE"
