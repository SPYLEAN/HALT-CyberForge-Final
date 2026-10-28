"""Write services/api/openapi.json (committed). The web app generates its types from it (npm run gen:api).

Usage: python scripts/export_openapi.py [--check]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from halt.config import Settings
from halt.main import create_app

OUT = Path(__file__).resolve().parent.parent / "openapi.json"


def render() -> str:
    app = create_app(Settings(db_url="sqlite+pysqlite:///:memory:"))
    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    text = render()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is out of date; run: python scripts/export_openapi.py", file=sys.stderr)
            return 1
        print(f"{OUT} is up to date")
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
