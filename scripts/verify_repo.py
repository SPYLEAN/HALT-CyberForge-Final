"""Repository integrity checks (AT-0.1 legacy file, AT-0.2 vendored package).

Run with: python -I scripts/verify_repo.py
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "assets" / "halt-package"
LEGACY_PNG = ROOT / "SentinelRoute shield emblem.png"
LEGACY_PNG_SHA256 = "d33c44cef2f2265569d5e408044a67c22adc2ca18eb2175d4bea82168b4eb435"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []

    if not LEGACY_PNG.exists():
        errors.append(f"missing legacy file: {LEGACY_PNG.name}")
    elif sha256(LEGACY_PNG) != LEGACY_PNG_SHA256:
        errors.append(f"legacy file changed: {LEGACY_PNG.name}")

    manifest = PACKAGE / "CHECKSUMS.sha256"
    expected: dict[str, str] = {}
    for line in manifest.read_text(encoding="utf-8").splitlines():
        digest, name = line.split(maxsplit=1)
        expected[name.lstrip("*")] = digest

    actual = {
        p.relative_to(PACKAGE).as_posix()
        for p in PACKAGE.rglob("*")
        if p.is_file() and p != manifest
    }
    for name in sorted(actual - expected.keys()):
        errors.append(f"unexpected file in vendored package: {name}")
    for name, digest in sorted(expected.items()):
        path = PACKAGE / name
        if not path.is_file():
            errors.append(f"missing vendored file: {name}")
        elif sha256(path) != digest:
            errors.append(f"vendored file modified: {name}")

    for e in errors:
        print(f"FAIL {e}")
    if errors:
        return 1
    print(f"OK legacy file intact; {len(expected)} vendored files match CHECKSUMS.sha256")
    return 0


if __name__ == "__main__":
    sys.exit(main())
