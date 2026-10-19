"""OpenWave Backend — Desfase entre el videoclip y la canción.

Muchos videoclips oficiales llevan una intro (o un outro) que la versión
publicada de la canción no tiene: el vídeo dura más y, si se pone «a la par»
del audio de la app, se ve desfasado respecto a lo que suena. Ese desfase se
mide aquí comparando las DOS pistas por su sonoridad: la canción se busca
dentro del vídeo y la posición en la que encaja es el desfase.

Sin esta medida, esos videoclips quedan fuera (el filtro de duración los
descarta) y la pantalla se queda con la portada aunque la canción tenga vídeo,
que es justo lo que no se quiere.

La comparación de envolventes es pura (no toca disco ni red), así que se puede
probar sin audio real; decodificar (ffmpeg) y descargar (yt-dlp) viven fuera.
"""

import array
import math
import subprocess
from pathlib import Path

from logging_config import get_logger

logger = get_logger(__name__)

# Resolución de la envolvente de sonoridad (s): 100 ms alinea de sobra un
# fondo; más fino multiplica el coste de la búsqueda sin mejorar lo que se ve.
_FRAME = 0.1
# Muestras por segundo del PCM intermedio (mono).
_HZ = 8000
# Correlación mínima para dar el desfase por válido (global).
_CORR_MINIMA = 0.75
# Separación mínima (s) entre el pico principal y el segundo pico para descartar
# ambigüedad (repeticiones/estrofas). 2 s es razonable.
_MARGEN_PICOS = 2.0
# Cuánto puede bajar la correlación del segundo pico respecto al mejor para
# seguir considerándolo un empate: dos posiciones que puntúan casi igual no se
# pueden distinguir y el desfase no se arriesga. Un pico claramente peor (el
# caso normal: la misma canción en el vídeo y ruido alrededor) no es empate.
_MARGEN_CORR = 0.05
# Búsqueda de desfase entre -120 s y +120 s (tope de seguridad).
_BUSQUEDA_MAX_S = 120.0


def _envolvente(pcm: bytes) -> list[float]:
    """Sonoridad (RMS) por tramos de ``_FRAME`` s de un PCM s16le mono."""
    muestras = array.array("h")
    muestras.frombytes(pcm[: len(pcm) - len(pcm) % 2])
    paso = int(_HZ * _FRAME)
    env = []
    for i in range(0, len(muestras) - paso + 1, paso):
        trozo = muestras[i : i + paso]
        env.append(math.sqrt(sum(v * v for v in trozo) / paso))
    return env


def desfase_por_envolventes(video: list[float], cancion: list[float]) -> float | None:
    """Desfase (s) de la canción dentro del vídeo, o ``None`` si no se puede.

    Positivo = el vídeo lleva contenido de más ANTES de la canción (una intro),
    así que el vídeo hay que arrancarlo ese tiempo por delante del audio.

    Un vídeo más corto que la canción no puede llevar la canción entera dentro
    (no hay dónde buscarla), pero sí empieza con ella: se usa alineado por el
    principio (desfase 0) en vez de descartarlo, que es lo que pasa en la
    práctica con los cortes y las ediciones limpias.
    """
    lv = len(video)
    lc = len(cancion)
    if lc < 10:
        return None
    if lv < lc:
        logger.info(
            "desfase: vídeo más corto que la canción (%.0fs < %.0fs): se usa alineado",
            lv * _FRAME,
            lc * _FRAME,
        )
        return 0.0
    pref1 = [0.0]
    pref2 = [0.0]
    for x in video:
        pref1.append(pref1[-1] + x)
        pref2.append(pref2[-1] + x * x)
    suma_c = sum(cancion)
    media_c = suma_c / lc
    var_c = sum((x - media_c) ** 2 for x in cancion)
    if var_c <= 0.0:
        return None
    mejor_pos = -10_000
    mejor_corr = -10.0
    segundo_pos = -10_000
    segundo_corr = -10.0
    margen = int(_MARGEN_PICOS / _FRAME)
    for pos in range(-int(_BUSQUEDA_MAX_S / _FRAME), int(_BUSQUEDA_MAX_S / _FRAME) + 1):
        if pos < 0:
            continue
        if pos > lv - lc:
            break
        sb = pref1[pos + lc] - pref1[pos]
        sb2 = pref2[pos + lc] - pref2[pos]
        media_v = sb / lc
        var_v = sb2 - lc * media_v * media_v
        if var_v <= 0.0:
            continue
        num = 0.0
        for c_i, v_i in zip(cancion, video[pos : pos + lc], strict=False):
            num += (c_i - media_c) * (v_i - media_v)
        corr = num / math.sqrt(var_c * var_v)
        if corr > mejor_corr:
            segundo_pos, segundo_corr = mejor_pos, mejor_corr
            mejor_pos, mejor_corr = pos, corr
        elif corr > segundo_corr:
            if abs(pos - mejor_pos) > margen:
                segundo_pos, segundo_corr = pos, corr
    if mejor_pos < 0 or mejor_corr < _CORR_MINIMA:
        return None
    if segundo_pos >= 0 and segundo_corr >= mejor_corr - _MARGEN_CORR:
        # Dos posiciones puntúan casi igual: no hay forma de saber cuál es la
        # buena (repeticiones, vídeo con la canción dos veces) y no se arriesga.
        # Un segundo pico claramente peor es lo normal (el resto del vídeo) y no
        # impide dar el desfase: la correlación de la posición buena manda.
        logger.warning(
            "desfase: pico ambiguo (%.2f s corr %.2f / %.2f s corr %.2f)",
            mejor_pos * _FRAME,
            mejor_corr,
            segundo_pos * _FRAME,
            segundo_corr,
        )
        return None
    offset = round(mejor_pos * _FRAME, 2)
    logger.info("desfase: detectado %.2f s (correlación %.2f)", offset, mejor_corr)
    return offset


def _pcm(ruta: Path, ffmpeg: str) -> bytes:
    """Decodifica el audio de un fichero a PCM s16le mono a ``_HZ``."""
    cmd = [
        ffmpeg,
        "-v",
        "error",
        "-i",
        str(ruta),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(_HZ),
        "-f",
        "s16le",
        "-",
    ]
    return subprocess.run(cmd, check=True, capture_output=True, timeout=180).stdout


def medir(video_path: Path, cancion_path: Path, ffmpeg: str) -> float | None:
    """Desfase (s) entre un videoclip descargado y la canción, o ``None``.

    Compara la sonoridad de las dos pistas: las dos se decodifican a PCM mono
    a 8 kHz y la canción se busca dentro del vídeo. ``None`` significa «no
    encaja» (correlación baja o pico ambiguo) y sí se puede cachear; un fallo
    de lectura o decodificación se propaga como excepción porque es
    transitorio y no debe confundirse con «esta canción no sirve».
    """
    try:
        env_video = _envolvente(_pcm(video_path, ffmpeg))
        env_cancion = _envolvente(_pcm(cancion_path, ffmpeg))
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        logger.warning("desfase: no se pudo leer el audio (fallo transitorio): %s", e)
        raise
    return desfase_por_envolventes(env_video, env_cancion)
