"""AT-4.2: no application code names a candidate action. Selections only come from the solver.

Candidate ids (C01..C12) may appear in the scenario fixture JSON and in tests, nowhere else.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CANDIDATE_ID = re.compile(r"\bC\d{2}\b")
SOURCES = [
    (REPO / "services" / "api" / "halt", ("*.py",)),
    (REPO / "apps" / "web" / "src", ("*.ts", "*.tsx")),
]


def test_AT_4_2_no_candidate_ids_in_code() -> None:
    offenders = []
    for root, patterns in SOURCES:
        for pattern in patterns:
            for path in root.rglob(pattern):
                if path.name == "schema.d.ts":  # generated from OpenAPI, contains no data
                    continue
                for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                    if CANDIDATE_ID.search(line):
                        offenders.append(f"{path.relative_to(REPO)}:{n}: {line.strip()}")
    assert not offenders, "candidate ids in application code:\n" + "\n".join(offenders)
