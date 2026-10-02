"""OpenWave Backend — Soporte HTTP Range para respuestas de audio.

El navegador solo considera seekable un recurso audio/video si el servidor
responde con 206 + Content-Range cuando envía la cabecera ``Range``
(Chromium envía ``Range: bytes=0-`` en la PRIMERA petición de un <audio>).
Starlette 0.37.2 ignora ``Range`` en FileResponse → 200 + cuerpo completo →
el elemento marca el recurso como no-seekable y ``audio.currentTime = t``
REINICIA la reproducción desde 0.

Este módulo implementa el subconjunto necesario para seek de audio:
  - ``parse_range(header, total)`` → (start, end) | None (sin rango) | "invalid"
  - ``range_file_response(...)``: 200/206/416 + Accept-Ranges + Content-Range.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

from starlette.responses import Response, StreamingResponse

_CHUNK = 64 * 1024


def parse_range(header: str | None, total: int) -> tuple[int, int] | None | str:
    """Interpreta una cabecera Range de un solo rango.

    Returns:
        - ``None``: sin cabecera (o multi-rango, no soportado) → responder 200.
        - ``"invalid"``: sintaxis correcta pero fuera de rango → responder 416.
        - ``(start, end)`` inclusive, ya recortado al tamaño total.
    """
    if not header:
        return None
    header = header.strip()
    if not header.lower().startswith("bytes="):
        return None
    spec = header[6:]
    if "," in spec:
        # Multi-rango: innecesario para seek de audio; degradar a 200.
        return None
    if "-" not in spec:
        return "invalid"
    first, _, last = spec.partition("-")
    first, last = first.strip(), last.strip()
    try:
        if first == "":
            # suffix-range: últimos N bytes
            n = int(last)
            if n <= 0:
                return "invalid"
            start = max(0, total - n)
            end = total - 1
        else:
            start = int(first)
            end = int(last) if last else total - 1
    except ValueError:
        return "invalid"
    if start < 0 or end < 0 or start > end or start >= total:
        return "invalid"
    return (start, min(end, total - 1))


def _file_chunks(path: str, start: int, length: int) -> Iterator[bytes]:
    remaining = length
    with open(path, "rb") as fh:
        fh.seek(start)
        while remaining > 0:
            chunk = fh.read(min(_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def range_file_response(
    path: str, media_type: str, range_header: str | None
) -> Response:
    """Sirve un fichero local honoreando la cabecera ``range_header``.

    - Sin Range → 200 + ``Accept-Ranges: bytes`` (Chromium lo usa para
      decidir que el recurso es seekable).
    - Con Range válido → 206 + ``Content-Range`` + cuerpo parcial.
    - Range inválido → 416 + ``Content-Range: bytes */total``.
    """
    if not os.path.isfile(path):
        return Response(
            status_code=404,
            content=b'{"detail":"Archivo no encontrado"}',
            media_type="application/json",
        )
    total = os.path.getsize(path)
    # Content-Encoding: identity → el GZipMiddleware de la app deja la
    # respuesta intacta (si no, comprime el stream y borra Content-Length
    # y Content-Range se referirían a bytes sin comprimir → seek roto).
    common = {"Accept-Ranges": "bytes", "Content-Encoding": "identity"}

    rng = parse_range(range_header, total)
    if rng == "invalid":
        return Response(
            status_code=416,
            headers={**common, "Content-Range": f"bytes */{total}"},
        )

    if isinstance(rng, tuple):
        start, end = rng
        status = 206
        common["Content-Range"] = f"bytes {start}-{end}/{total}"
    else:
        start, end = 0, total - 1
        status = 200

    length = (end - start + 1) if total else 0
    common["Content-Length"] = str(length)
    return StreamingResponse(
        _file_chunks(path, start, length),
        status_code=status,
        media_type=media_type,
        headers=common,
    )
