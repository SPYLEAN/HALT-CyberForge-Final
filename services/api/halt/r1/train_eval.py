"""Train and evaluate the HALT-R1 event scorer on synthetic data (AT-2.6).

Compares three scorers on a held-out synthetic set by PR-AUC (average precision):
- rule: the deterministic rule score;
- logreg: logistic regression on the feature vector (the baseline);
- gbm: scikit-learn HistGradientBoosting. It ships only if it beats logreg by GBM_MARGIN.

Synthetic-on-synthetic results measure pipeline correctness, not real-world detection efficacy.
Write the report with:  python -m halt.r1.train_eval
"""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score

from halt.contracts.events import EventSource, SecurityEvent
from halt.r1.correlate import score_stream
from halt.r1.features import FEATURE_NAMES
from halt.scenario.background import generate as generate_background

GBM_MARGIN = 0.02
REPORT_PATH = Path(__file__).resolve().parents[2] / "reports" / "r1_eval.json"
MODEL_PATH = Path(__file__).resolve().parent / "r1_model.json"
T0 = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)

TRAIN = {"benign_seeds": range(1000, 1020), "attack_seed": 11, "attacks": 300}
TEST = {"benign_seeds": range(2000, 2010), "attack_seed": 22, "attacks": 150}


def _attack_chain(rng: random.Random, i: int, start: datetime) -> list[SecurityEvent]:
    """One consent-phishing chain with randomised strength of each signal (some chains are stealthy)."""
    upn = f"victim{i:04d}@corp.example"
    t = start
    out: list[SecurityEvent] = []

    def add(kind: str, gap_s: float, attrs: dict[str, str | int | float | bool]) -> None:
        nonlocal t
        t = t + timedelta(seconds=gap_s)
        out.append(
            SecurityEvent(
                id="BG-0000",
                ts=t,
                source=EventSource(system="synthetic", record_id=f"SYN-{i}-{len(out)}"),
                kind=kind,
                attributes={"upn": upn, **attrs},
            )
        )

    if rng.random() < 0.9:
        add(
            "mail_delivered",
            0,
            {
                "recipient": upn,
                "sender_domain": "lure.example",
                "sender_domain_age_days": rng.randint(1, 20) if rng.random() < 0.8 else rng.randint(60, 900),
                "link_type": "oauth_consent" if rng.random() < 0.85 else "document",
            },
        )
    add(
        "sign_in",
        rng.randint(30, 900),
        {
            "asn": 64999,
            "asn_first_seen_for_user": rng.random() < 0.75,
            "user_agent": "x",
            "user_agent_first_seen_for_user": rng.random() < 0.6,
            "result": "success",
        },
    )
    if rng.random() < 0.85:
        add(
            "mfa_method_added",
            rng.randint(20, 1200),
            {
                "method": "software_totp",
                "asn": 64999,
                "seconds_since_sign_in": rng.randint(20, 1200),
            },
        )
    add(
        "oauth_consent",
        rng.randint(10, 1500),
        {
            "app_name": "lure",
            "publisher_verified": rng.random() > 0.85,
            "app_age_days": rng.randint(1, 25) if rng.random() < 0.8 else rng.randint(100, 2000),
            "scopes": "Mail.Read Files.ReadWrite.All" if rng.random() < 0.9 else "User.Read",
            "consent_type": "user",
        },
    )
    if rng.random() < 0.9:
        add(
            "token_replay",
            rng.randint(60, 900),
            {
                "asn": 64999,
                "issued_asn": 64999 if rng.random() > 0.8 else 64496,
                "device_mismatch": rng.random() < 0.85,
            },
        )
    add(
        "resource_access",
        rng.randint(60, 900),
        {
            "resource": "Finance",
            "request_count": int(240 * rng.uniform(0.2, 1.2)),
            "window_s": 240,
            "via": "API",
        },
    )
    return out


def dataset(split: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Features X, labels y and rule scores for one split."""
    events: list[SecurityEvent] = []
    labels: dict[str, int] = {}
    for seed in split["benign_seeds"]:
        for e in generate_background(seed, T0):
            e = e.model_copy(
                update={"source": EventSource(system=e.source.system, record_id=f"{seed}-{e.id}")}
            )
            events.append(e)
            labels[e.source.record_id] = 0
    rng = random.Random(split["attack_seed"])
    for i in range(split["attacks"]):
        for e in _attack_chain(rng, i, T0 + timedelta(seconds=rng.randint(-2400, 2400))):
            events.append(e)
            labels[e.source.record_id] = 1
    scored = score_stream(events)
    x = np.array([s.features for s in scored])
    y = np.array([labels[s.event.source.record_id] for s in scored])
    rule = np.array([s.hit.score if s.hit else 0.0 for s in scored])
    return x, y, rule


def fit_logreg(x: np.ndarray, y: np.ndarray) -> LogisticRegression:
    return LogisticRegression(max_iter=2000, C=1.0).fit(x, y)


def fit_gbm(x: np.ndarray, y: np.ndarray) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(max_iter=200, early_stopping=False, random_state=2417).fit(x, y)


def evaluate() -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (report, model artefact). The artefact holds plain coefficients, never a pickle."""
    x_tr, y_tr, _ = dataset(TRAIN)
    x_te, y_te, rule_te = dataset(TEST)
    lr, gbm = fit_logreg(x_tr, y_tr), fit_gbm(x_tr, y_tr)
    pr = {
        "rule": float(average_precision_score(y_te, rule_te)),
        "logreg": float(average_precision_score(y_te, lr.predict_proba(x_te)[:, 1])),
        "gbm": float(average_precision_score(y_te, gbm.predict_proba(x_te)[:, 1])),
    }
    selected = "gbm" if pr["gbm"] - pr["logreg"] >= GBM_MARGIN else "logreg"
    if selected != "logreg":
        raise NotImplementedError("GBM won the evaluation: add a persisted GBM scorer before shipping it")
    artefact = {
        "model": "logreg",
        "features": FEATURE_NAMES,
        "coef": [round(float(c), 6) for c in lr.coef_[0]],
        "intercept": round(float(lr.intercept_[0]), 6),
        "trained_on": "synthetic split TRAIN (benign seeds 1000-1019, 300 attack chains, seed 11)",
    }
    report = {
        "metric": "average_precision (PR-AUC) on the held-out synthetic split",
        "pr_auc": {k: round(v, 4) for k, v in pr.items()},
        "gbm_margin_required": GBM_MARGIN,
        "selected": selected,
        "rows": {
            "train": int(len(y_tr)),
            "train_positive": int(y_tr.sum()),
            "test": int(len(y_te)),
            "test_positive": int(y_te.sum()),
        },
        "note": "Synthetic-on-synthetic: measures pipeline correctness, not real-world detection efficacy.",
    }
    return report, artefact


def main() -> None:
    report, artefact = evaluate()
    REPORT_PATH.parent.mkdir(exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    MODEL_PATH.write_text(json.dumps(artefact, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
