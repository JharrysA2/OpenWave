#!/usr/bin/env python3
"""Reordena src-tauri/icons/icon.ico dejando el tamaño MÁS GRANDE primero.

Por qué hace falta:
    tauri-codegen (src/image.rs) hace `icon_dir.entries()[0]` para construir el
    icono por defecto de la ventana (`window_builder.icon(...)`). Si la primera
    entrada es la de 16x16, Windows escala ese bitmap a la barra de tareas y el
    icono sale pixelado, aunque el .ico contenga un 256x256.

    Windows (Explorer, instalador) elige siempre el mejor tamaño disponible, así
    que reordenar el directorio del .ico no rompe nada: solo cambia qué imagen
    incrusta Tauri en la ventana.

Uso:
    python3 scripts/sort-ico.py            # reordena (idempotente)
    python3 scripts/sort-ico.py --check    # solo valida, sale 1 si está mal
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

ICO = Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "icon.ico"


def read_entries(data: bytes) -> list[tuple[bytes, bytes]]:
    """Devuelve [(cabecera_de_16_bytes, blob_de_imagen), ...] en orden de archivo."""
    (count,) = struct.unpack_from("<H", data, 4)
    entries = []
    offset = 6
    for _ in range(count):
        header = data[offset : offset + 16]
        (_, _, _, _, _, _, size, img_offset) = struct.unpack("<BBBBHHII", header)
        entries.append((header, data[img_offset : img_offset + size]))
        offset += 16
    return entries


def entry_px(header: bytes) -> int:
    w = header[0] or 256
    h = header[1] or 256
    if w != h:
        raise SystemExit(f"entrada no cuadrada: {w}x{h}")
    return w


def main() -> int:
    data = ICO.read_bytes()
    if data[:4] != b"\x00\x00\x01\x00":
        raise SystemExit(f"{ICO} no es un .ico válido")

    entries = read_entries(data)
    sizes = [entry_px(h) for h, _ in entries]
    print(f"tamaños actuales: {sizes}")

    if "--check" in sys.argv:
        if sizes and sizes[0] == max(sizes):
            print("ok: la primera entrada ya es la más grande")
            return 0
        print("FAIL: la primera entrada no es la más grande")
        return 1

    # Orden descendente; los blobs se reutilizan tal cual (sin recomprimir), así
    # que el contenido de cada tamaño es byte a byte idéntico al original.
    ordered = sorted(zip(sizes, entries), key=lambda pair: pair[0], reverse=True)

    out = bytearray(b"\x00\x00\x01\x00")
    out += struct.pack("<H", len(ordered))
    cursor = 6 + 16 * len(ordered)
    for _, (header, blob) in ordered:
        # Cabecera ICONDIR/ICONDIRENTRY: 8 bytes fijos (ancho, alto, color,
        # reservado, planos, bpp) + tamaño y offset que recalculamos aquí.
        # Ancho/alto 0 significaban 256; se conservan tal cual.
        out += header[:8]
        out += struct.pack("<II", len(blob), cursor)
        cursor += len(blob)

    for _, (_, blob) in ordered:
        out += blob

    ICO.write_bytes(bytes(out))
    print(f"reescrito: {[entry_px(h) for h, _ in read_entries(bytes(out))]} -> {ICO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
