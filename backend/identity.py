"""OpenWave Backend — Identidad de paquete sparse en Windows.

El MSI registra un paquete sparse (``OpenWave``) para que el Administrador de
tareas agrupe la app y sus procesos WebView2 bajo un mismo nombre. Si ese
registro falla, la app funciona igual pero aparece como «WebView2» y los hijos
se separan. Este módulo permite comprobarlo desde Ajustes y repararlo sin
reinstalar.

La consulta usa ``Get-AppxPackage`` (PowerShell). No se hace en cada petición:
el resultado se cachea unos segundos para que abrir Ajustes no dispare un
proceso cada vez. En Linux/macOS se declara «no soportado» y no ejecuta nada.
"""

from __future__ import annotations

import subprocess
import sys
import threading
import time
from pathlib import Path

from logging_config import get_logger

logger = get_logger(__name__)

_TTL = 30.0
_cache: tuple[float, dict] | None = None
_cache_lock = threading.Lock()

# Comando mínimo: el nombre del paquete es el mismo que usa el script del MSI.
_PS_ESTADO = (
    "$p = Get-AppxPackage -Name OpenWave -ErrorAction SilentlyContinue | "
    "Select-Object -First 1; "
    "if ($p) { $p.PackageFamilyName }"
)


def _sin_ventana() -> int:
    """Evitar que PowerShell abra una consola al consultar la identidad."""
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _ejecutar(argumentos: list[str], timeout: float) -> subprocess.CompletedProcess:
    return subprocess.run(
        argumentos,
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=_sin_ventana(),
        check=False,
    )


def estado_identidad(forzar: bool = False) -> dict:
    """¿Está registrado el paquete sparse? Resultado cacheado 30 s."""
    global _cache

    if sys.platform != "win32":
        return {"soportado": False, "registrada": None, "paquete": None}

    with _cache_lock:
        if not forzar and _cache is not None:
            creado, datos = _cache
            if time.time() - creado < _TTL:
                return dict(datos)
        try:
            proc = _ejecutar(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    _PS_ESTADO,
                ],
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("identidad: no se pudo consultar: %s", exc)
            datos = {
                "soportado": True,
                "registrada": None,
                "paquete": None,
                "error": "No se pudo consultar la identidad de Windows.",
            }
            _cache = (time.time(), datos)
            return dict(datos)

        paquete = (proc.stdout or "").strip().splitlines()
        familia = paquete[0].strip() if paquete else ""
        if proc.returncode != 0:
            detalle = " ".join((proc.stderr or "").split())[:200]
            logger.warning("identidad: PowerShell fallo: %s", detalle)
            datos = {
                "soportado": True,
                "registrada": None,
                "paquete": None,
                "error": detalle or "No se pudo consultar la identidad.",
            }
        else:
            datos = {
                "soportado": True,
                "registrada": bool(familia),
                "paquete": familia or None,
            }
        _cache = (time.time(), datos)
        return dict(datos)


def _script_identidad() -> Path | None:
    """Ruta del script del MSI, también en el repo para pruebas manuales."""
    raiz = Path(__file__).resolve().parent.parent
    candidatos = (
        raiz / "openwave-identity-ca.ps1",
        raiz / "packaging" / "appx" / "openwave-identity-ca.ps1",
    )
    return next((p for p in candidatos if p.is_file()), None)


def reparar_identidad() -> dict:
    """Reparar el registro con UAC (el script del MSI, ``-Mode Register``).

    El endpoint espera a que termine el proceso elevado. Si el usuario cancela
    el UAC, PowerShell termina con error y se devuelve un mensaje claro; nunca
    se oculta el fallo.
    """
    if sys.platform != "win32":
        return {"ok": False, "error": "Solo disponible en Windows."}

    script = _script_identidad()
    if script is None:
        return {
            "ok": False,
            "error": "No se encontró openwave-identity-ca.ps1 en la instalación.",
        }

    ruta = str(script).replace("'", "''")
    comando = (
        "$ErrorActionPreference = 'Stop'; "
        f"$script = '{ruta}'; "
        "$argList = '-NoProfile -ExecutionPolicy Bypass -NonInteractive "
        "-File \"' + $script + '\" -Mode Register'; "
        "$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -PassThru "
        "-Wait -ArgumentList $argList; "
        "exit $p.ExitCode"
    )
    try:
        proc = _ejecutar(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                comando,
            ],
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "La reparación tardó demasiado. Revisa si quedó una ventana de UAC abierta.",
        }
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("identidad: no se pudo reparar: %s", exc)
        return {"ok": False, "error": f"No se pudo ejecutar la reparación: {exc}"}

    if proc.returncode != 0:
        detalle = " ".join(((proc.stderr or "") + " " + (proc.stdout or "")).split())
        if "cancel" in detalle.lower():
            return {"ok": False, "error": "Reparación cancelada en la ventana de UAC."}
        logger.warning("identidad: reparación fallo (%s): %s", proc.returncode, detalle)
        return {
            "ok": False,
            "error": "La reparación falló. Revisa openwave-identity.log en ProgramData.",
        }

    estado = estado_identidad(forzar=True)
    if estado.get("registrada"):
        logger.info("identidad: reparada (%s)", estado.get("paquete"))
        return {"ok": True, "estado": estado}
    return {
        "ok": False,
        "error": (
            "El script terminó pero el paquete sigue sin registrarse. "
            "Revisa openwave-identity.log en ProgramData."
        ),
        "estado": estado,
    }


def avisar_si_falta_identidad() -> None:
    """Comprobar al arrancar y dejar el diagnóstico en openwave.log."""
    time.sleep(1.0)
    estado = estado_identidad(forzar=True)
    if not estado.get("soportado"):
        return
    if estado.get("registrada") is True:
        logger.info("identidad: paquete registrado (%s)", estado.get("paquete"))
    elif estado.get("registrada") is False:
        logger.error(
            "identidad: el paquete sparse NO está registrado; el Administrador "
            "de tareas agrupará los WebView2 aparte. Se puede reparar desde "
            "Ajustes → Acerca de o con scripts/install-msi.ps1."
        )
    else:
        logger.warning(
            "identidad: no se pudo comprobar (%s)", estado.get("error", "sin detalle")
        )
