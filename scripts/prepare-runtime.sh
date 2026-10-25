#!/usr/bin/env bash
# Prepara build/staging-linux para `tauri build --bundles deb,appimage`.
#
#   build/staging-linux/backend  copia de backend/ solo con código de producción
#   build/staging-linux/runtime  CPython portable + requirements-runtime.txt
#   build/staging-linux/ffmpeg   ffmpeg estático (MP3 y calidad «Baja»)
#
# Mismo contrato que scripts/prepare-runtime.ps1 en Windows: el arranque
# (src-tauri/src/lib.rs) y backend/config.py descubren el intérprete y los
# binarios por layout, sin rutas propias de cada sistema.
#
# Idempotente: si existe build/staging-linux/.ready y no cambiaron el código de
# producción ni requirements-runtime.txt, no hace nada. `--force` reconstruye.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/build/cache"
STAGE="$ROOT/build/staging-linux"
RUNTIME="$STAGE/runtime"
BACKEND_DST="$STAGE/backend"
FFMPEG_DIR="$STAGE/ffmpeg"
MARKER="$STAGE/.ready"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 2 ;;
  esac
done

# Pines (misma versión de Python que el runtime de Windows: 3.14)
PBS_RELEASE="20261021"
PY_VERSION="3.14.9"
PY_SHA256="dfa4c5a40c47f338f41658017be550c72247c391e6bfb1fa4da03ebc8451abdf"
PY_NAME="cpython-${PY_VERSION}+${PBS_RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz"
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${PY_NAME}"

FFMPEG_BUILD="autobuild-2026-10-23-13-04"
FFMPEG_NAME="ffmpeg-n8.1.3-24-g92611900bb-linux64-gpl-8.1.tar.xz"
FFMPEG_SHA256="d0eb612b8994407f78413e2929cb4b073bc699c8ab79e198b31624736fdc2f93"
FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_BUILD}/${FFMPEG_NAME}"

REQUIREMENTS="$ROOT/backend/requirements-runtime.txt"

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Hash del código que se empaqueta (*.py de producción, sin tests ni cachés).
code_hash() {
  find "$ROOT/backend" -type f -name '*.py' \
    ! -name 'test_*' ! -name 'conftest.py' \
    ! -path '*/venv/*' ! -path '*/.venv/*' \
    ! -path '*/__pycache__/*' ! -path '*/.pytest_cache/*' ! -path '*/.ruff_cache/*' \
    -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}

# Descarga con hash pineado; reutiliza la caché si ya está.
fetch() {
  local url="$1" dest="$2" expected="$3" what="$4"
  if [ -f "$dest" ] && [ "$(sha256_of "$dest")" = "$expected" ]; then
    log "  $what: en caché"
    return 0
  fi
  log "  $what: descargando $(basename "$dest")"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 \
    -o "$dest.part" "$url" || die "falló la descarga de $what"
  local got
  got="$(sha256_of "$dest.part")"
  [ "$got" = "$expected" ] || {
    rm -f "$dest.part"
    die "$what con hash inesperado ($got, se esperaba $expected)"
  }
  mv "$dest.part" "$dest"
}

mkdir -p "$CACHE" "$STAGE"

want="$( { code_hash; sha256sum "$REQUIREMENTS" | cut -d' ' -f1; } | sha256sum | cut -d' ' -f1)"
if [ "$FORCE" -eq 0 ] && [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$want" ]; then
  log "Staging ya preparado (build/staging-linux/.ready). Usa --force para reconstruir."
  exit 0
fi

log "[1/7] Descargas pineadas -> build/cache"
fetch "$PY_URL" "$CACHE/$PY_NAME" "$PY_SHA256" "Python $PY_VERSION portable"
fetch "$FFMPEG_URL" "$CACHE/$FFMPEG_NAME" "$FFMPEG_SHA256" "ffmpeg $FFMPEG_BUILD"

log "[2/7] Staging limpio -> build/staging-linux"
rm -rf "$STAGE"
mkdir -p "$RUNTIME" "$BACKEND_DST" "$FFMPEG_DIR"

log "[3/7] Intérprete portable -> runtime/"
tar -xzf "$CACHE/$PY_NAME" -C "$RUNTIME" --strip-components=1
PY="$RUNTIME/bin/python3"
[ -x "$PY" ] || die "no aparece $PY tras extraer el runtime"
"$PY" -c 'import sys; print("  Python", sys.version.split()[0])' || die "el intérprete no arranca"
# El runtime no depende de la librería del sistema para sus extensiones.
"$PY" -c 'import sqlite3, ssl, zlib, lzma; print("  módulos nativos ok")' \
  || die "al intérprete portable le faltan módulos nativos"

# Recorte del intérprete: sin Tcl/Tk (la app no usa tkinter) y sin bibliotecas
# estáticas de compilación. Los símbolos de libpython también se van.
rm -rf "$RUNTIME"/lib/libtcl* "$RUNTIME"/lib/libtk* \
       "$RUNTIME"/lib/python3.14/tkinter "$RUNTIME"/lib/python3.14/idlelib \
       "$RUNTIME"/lib/python3.14/turtledemo "$RUNTIME"/lib/python3.14/ensurepip \
       "$RUNTIME"/lib/python3.14/config-* "$RUNTIME"/lib/python3.14/lib-dynload/*.a
if command -v strip >/dev/null 2>&1; then
  find "$RUNTIME"/lib -maxdepth 1 -name 'libpython*.so*' -exec strip --strip-unneeded {} + 2>/dev/null || true
fi

log "[4/7] Código del backend -> backend/"
mapfile -t py_files < <(
  find "$ROOT/backend" -type f -name '*.py' \
    ! -name 'test_*' ! -name 'conftest.py' \
    ! -path '*/venv/*' ! -path '*/.venv/*' \
    ! -path '*/__pycache__/*' ! -path '*/.pytest_cache/*' ! -path '*/.ruff_cache/*' \
    | sort
)
[ "${#py_files[@]}" -ge 20 ] || die "solo ${#py_files[@]} ficheros .py: algo va mal"
for f in "${py_files[@]}"; do
  rel="${f#"$ROOT/backend/"}"
  mkdir -p "$BACKEND_DST/$(dirname "$rel")"
  cp "$f" "$BACKEND_DST/$rel"
done
log "  ${#py_files[@]} ficheros .py copiados"

log "[5/7] Dependencias (requirements-runtime.txt, solo wheels)"
if ! "$PY" -m pip --version >/dev/null 2>&1; then
  "$PY" -m ensurepip --upgrade >/dev/null 2>&1 || die "pip no disponible en el runtime"
fi
"$PY" -m pip install --disable-pip-version-check --no-cache-dir \
  --no-warn-script-location --only-binary=:all: \
  -r "$REQUIREMENTS" | tail -3

log "[6/7] ffmpeg estático -> ffmpeg/ffmpeg"
ff_tmp="$(mktemp -d)"
tar -xJf "$CACHE/$FFMPEG_NAME" -C "$ff_tmp" || die "no se pudo extraer ffmpeg"
ff_bin="$(find "$ff_tmp" -type f -path '*/bin/ffmpeg' | head -n1)"
[ -n "$ff_bin" ] || die "no encuentro el binario ffmpeg en el tar"
cp "$ff_bin" "$FFMPEG_DIR/ffmpeg"
chmod 755 "$FFMPEG_DIR/ffmpeg"
# El binario estático viene sin strip: se quitan los símbolos de depuración.
if command -v strip >/dev/null 2>&1; then
  strip --strip-unneeded "$FFMPEG_DIR/ffmpeg" || true
fi
rm -rf "$ff_tmp"
"$FFMPEG_DIR/ffmpeg" -hide_banner -version | head -n1 | sed 's/^/  /'

log "[7/7] Limpieza y marcador"
"$PY" -m pip uninstall -y pip setuptools wheel >/dev/null 2>&1 || true
if "$PY" -c 'import pip' >/dev/null 2>&1; then
  die "pip sigue instalado en el runtime"
fi
rm -rf "$RUNTIME"/include "$RUNTIME"/share/man "$RUNTIME"/lib/python*/test
printf '%s' "$want" > "$MARKER"

log ""
log "Staging listo en build/staging-linux:"
du -sh "$BACKEND_DST" "$RUNTIME" "$FFMPEG_DIR" | sed 's/^/  /'
log "Comprueba imports:"
"$PY" -c 'import fastapi, uvicorn, yt_dlp, ytmusicapi; print("  fastapi", fastapi.__version__, "| yt-dlp", yt_dlp.version.__version__)' \
  || die "el runtime no puede importar las dependencias"
