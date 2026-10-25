#!/usr/bin/env python3
"""Sube la version de OpenWave en todos los ficheros que la declaran.

Politica de versionado (ver AGENTS.md y docs/release.md):
  - mejora o arreglo GRANDE -> sube el MINOR (1.0.1 -> 1.1.0)
  - arreglo o mejora pequena -> sube el PATCH (1.0.1 -> 1.0.2)
  - cambio incompatible -> sube el MAJOR (1.1.0 -> 2.0.0)
  - en la duda, PATCH.

Uso:
    scripts/bump-version.py patch          # 1.0.1 -> 1.0.2
    scripts/bump-version.py minor          # 1.0.1 -> 1.1.0
    scripts/bump-version.py major          # 1.0.1 -> 2.0.0
    scripts/bump-version.py 1.2.3          # version explicita
    scripts/bump-version.py patch --dry-run
    scripts/bump-version.py patch --no-changelog

Ficheros que toca:
    package.json, package-lock.json (x2), src-tauri/tauri.conf.json,
    src-tauri/Cargo.toml, src-tauri/Cargo.lock, packaging/arch/PKGBUILD
    y CHANGELOG.md.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str, dry_run: bool) -> None:
    if not dry_run:
        (ROOT / rel).write_text(text, encoding="utf-8")


def next_version(current: str, target: str) -> str:
    if SEMVER.match(target):
        return target
    major, minor, patch = (int(p) for p in current.split("."))
    if target == "major":
        return f"{major + 1}.0.0"
    if target == "minor":
        return f"{major}.{minor + 1}.0"
    if target == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise SystemExit(f"destino invalido: {target!r} (usa patch|minor|major o X.Y.Z)")


def sub_once(text: str, pattern: str, repl: str, rel: str) -> str:
    """Sustituye exactamente una ocurrencia; aborta si no hay o hay varias."""
    new, n = re.subn(pattern, repl, text, count=1)
    if n != 1:
        raise SystemExit(f"{rel}: se esperaba 1 coincidencia de {pattern!r}, hay {n}")
    return new


def update_changelog(version: str, date: str) -> tuple[str, str | None]:
    text = read("CHANGELOG.md")

    # 1. Mover el contenido pendiente bajo la version nueva.
    if "## [Unreleased]" in text:
        text = text.replace(
            "## [Unreleased]",
            f"## [Unreleased]\n\n## [{version}] - {date}",
            1,
        )
    else:
        m = re.search(r"^## \[", text, re.M)
        if not m:
            raise SystemExit("CHANGELOG.md: no encuentro ninguna seccion '## [...]'")
        text = (
            text[: m.start()]
            + f"## [Unreleased]\n\n## [{version}] - {date}\n\n"
            + text[m.start() :]
        )

    # 2. Enlaces de la cabecera inferior (Keep a Changelog).
    link = re.search(r"^\[Unreleased\]: (\S+)/compare/\S+$", text, re.M)
    if not link:
        print(
            "  aviso: no encuentro el enlace [Unreleased] en CHANGELOG.md; "
            "no actualizo los enlaces de version.",
            file=sys.stderr,
        )
        return text, None

    base = link.group(1)
    text = re.sub(
        r"^\[Unreleased\]: \S+$",
        f"[Unreleased]: {base}/compare/v{version}...HEAD",
        text,
        count=1,
        flags=re.M,
    )
    if f"[{version}]: " not in text:
        text = re.sub(
            r"^(\[Unreleased\]: .*)$",
            rf"\g<1>\n[{version}]: {base}/releases/tag/v{version}",
            text,
            count=1,
            flags=re.M,
        )
    return text, base


def main() -> int:
    parser = argparse.ArgumentParser(description="Sube la version de OpenWave.")
    parser.add_argument("target", help="patch | minor | major | X.Y.Z")
    parser.add_argument("--dry-run", action="store_true", help="no escribe nada")
    parser.add_argument(
        "--no-changelog", action="store_true", help="no toca CHANGELOG.md"
    )
    parser.add_argument("--date", help="fecha para el CHANGELOG (YYYY-MM-DD)")
    args = parser.parse_args()

    current = str(
        re.search(r'"version":\s*"([^"]+)"', read("package.json")).group(1)
    )
    version = next_version(current, args.target)
    date = args.date or _dt.date.today().isoformat()
    if version == current:
        raise SystemExit(f"la version ya es {current}; nada que hacer")

    print(f"version: {current} -> {version}" + (" (dry-run)" if args.dry_run else ""))

    # package.json y src-tauri/tauri.conf.json: primer '"version": "..."'.
    for rel in ("package.json", "src-tauri/tauri.conf.json"):
        text = sub_once(
            read(rel),
            r'("version":\s*")[^"]+(")',
            rf"\g<1>{version}\g<2>",
            rel,
        )
        write(rel, text, args.dry_run)
        print(f"  {rel}")

    # package-lock.json: las DOS entradas del propio paquete (raiz y packages['']).
    text, n = re.subn(
        r'("name": "openwave",\s*"version": ")[^"]+(")',
        rf"\g<1>{version}\g<2>",
        read("package-lock.json"),
    )
    if n != 2:
        raise SystemExit(
            f"package-lock.json: se esperaban 2 coincidencias de 'name/version', hay {n}"
        )
    write("package-lock.json", text, args.dry_run)
    print("  package-lock.json (x2)")

    # src-tauri/Cargo.toml: bloque [package].
    text = sub_once(
        read("src-tauri/Cargo.toml"),
        r'(\[package\]\s*\nname = "openwave"\s*\nversion = ")[^"]+(")',
        rf"\g<1>{version}\g<2>",
        "src-tauri/Cargo.toml",
    )
    write("src-tauri/Cargo.toml", text, args.dry_run)
    print("  src-tauri/Cargo.toml")

    # src-tauri/Cargo.lock: bloque [[package]] name = "openwave".
    text = sub_once(
        read("src-tauri/Cargo.lock"),
        r'(name = "openwave"\nversion = ")[^"]+(")',
        rf"\g<1>{version}\g<2>",
        "src-tauri/Cargo.lock",
    )
    write("src-tauri/Cargo.lock", text, args.dry_run)
    print("  src-tauri/Cargo.lock")

    # packaging/arch/PKGBUILD: pkgver; cada versión nueva empieza en r1.
    text = sub_once(
        read("packaging/arch/PKGBUILD"),
        r"(?m)^(pkgver=)[0-9][0-9a-zA-Z.]*$",
        rf"\g<1>{version}",
        "packaging/arch/PKGBUILD",
    )
    text = sub_once(text, r"(?m)^(pkgrel=)[0-9]+$", r"\g<1>1", "packaging/arch/PKGBUILD")
    write("packaging/arch/PKGBUILD", text, args.dry_run)
    print("  packaging/arch/PKGBUILD")

    # CHANGELOG.md.
    if not args.no_changelog:
        text, _base = update_changelog(version, date)
        write("CHANGELOG.md", text, args.dry_run)
        print(f"  CHANGELOG.md -> ## [{version}] - {date}")

    print(f"\nListo. Version nueva: {version}")
    if args.dry_run:
        print("(dry-run: no se ha escrito ningun fichero)")
    else:
        print("Revisa el diff, haz commit y crea el tag v" + version + ".")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
