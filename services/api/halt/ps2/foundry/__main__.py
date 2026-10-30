"""Write the PS2 datasets (raw logs + context + manifest) and, separately, their ground truth.

    python -m halt.ps2.foundry          # regenerate
    python -m halt.ps2.foundry --check  # fail if the committed files differ from a fresh generation

Raw inputs go to halt/ps2/datasets/<id>/ (what the engine may read); ground truth goes to
halt/ps2/ground_truth/<id>.json (only halt.ps2.evaluate reads it).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from halt.ps2.foundry import scenario_a, scenario_b

ROOT = Path(__file__).resolve().parent.parent
DATASETS = {
    "scenario-a": ("OAuth consent phishing against Finance Operations", scenario_a, 2417),
    "scenario-b": ("Service-account abuse in a cloud data platform", scenario_b, 7310),
}


def outputs() -> dict[Path, str]:
    out: dict[Path, str] = {}
    for dataset_id, (title, module, seed) in DATASETS.items():
        files, context, truth = module.generate(seed)
        base = ROOT / "datasets" / dataset_id
        for name, text in files.items():
            out[base / "raw" / name] = text
        manifest = {
            "dataset_id": dataset_id,
            "title": title,
            "seed": seed,
            "synthetic": True,
            "captured_at": module.CAPTURED_AT,
            "files": module.FILES,
        }
        out[base / "manifest.json"] = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
        out[base / "context.json"] = json.dumps(context, indent=2, sort_keys=True) + "\n"
        out[ROOT / "ground_truth" / f"{dataset_id}.json"] = json.dumps(truth, indent=2, sort_keys=True) + "\n"
    return out


def main() -> int:
    out = outputs()
    if "--check" in sys.argv:
        stale = [str(p) for p, text in out.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            print("stale PS2 datasets; run: python -m halt.ps2.foundry\n" + "\n".join(stale), file=sys.stderr)
            return 1
        print("PS2 datasets are up to date")
        return 0
    for path, text in out.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
