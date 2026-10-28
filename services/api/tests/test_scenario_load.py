"""AT-1.1 – AT-1.3, AT-1.5: the INC-2417 fixture loads, validates and cross-checks; bad ones are refused."""

from __future__ import annotations

import json
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from halt.canonical import sha256_hex
from halt.config import Settings
from halt.contracts.actions import ResponseAction
from halt.contracts.graph import GraphEdge
from halt.main import create_app
from halt.scenario.background import generate, render
from halt.scenario.loader import DEFAULT_SCENARIO_DIR, ScenarioError, load_scenario, scenario_hashes

VARIANTS = [
    "baseline",
    "verma_not_releaser",
    "approver_unavailable",
    "no_phish_resistant_mfa",
    "relaxed_users_250",
]


@pytest.fixture
def fixture_copy(tmp_path: Path) -> Callable[[str, Callable[[Any], None]], Path]:
    """Copy the fixture to tmp and mutate one file's parsed JSON."""

    def make(name: str, mutate: Callable[[Any], None]) -> Path:
        d = tmp_path / "inc"
        shutil.copytree(DEFAULT_SCENARIO_DIR, d)
        path = d / name
        data = json.loads(path.read_text(encoding="utf-8"))
        mutate(data)
        path.write_text(json.dumps(data), encoding="utf-8")
        return d

    return make


# AT-1.1


@pytest.mark.parametrize("variant", VARIANTS)
def test_AT_1_1_every_variant_loads(variant: str) -> None:
    s = load_scenario(variant=variant)
    assert s.incident.id == "INC-2417"
    assert s.variant == variant
    assert [e.id for e in s.events] == [f"EV-0{i}" for i in range(1, 7)]
    assert len(s.actions) == 12


def test_AT_1_1_variants_change_only_their_section() -> None:
    base = scenario_hashes(load_scenario())
    expected = {
        "verma_not_releaser": {"graph"},
        "approver_unavailable": {"policies"},
        "no_phish_resistant_mfa": {"actions"},
        "relaxed_users_250": {"constraints"},
    }
    for variant, sections in expected.items():
        h = scenario_hashes(load_scenario(variant=variant))
        assert {k for k in h if h[k] != base[k]} == sections, variant


def test_AT_1_1_unknown_variant() -> None:
    with pytest.raises(ScenarioError, match="unknown variant"):
        load_scenario(variant="nope")


def test_AT_1_1_corrupt_json_refused(tmp_path: Path) -> None:
    d = tmp_path / "inc"
    shutil.copytree(DEFAULT_SCENARIO_DIR, d)
    (d / "topology.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(ScenarioError, match="invalid JSON"):
        load_scenario(d)


def test_AT_1_1_api_refuses_to_start_on_bad_fixture(fixture_copy: Any) -> None:
    d = fixture_copy("incident.json", lambda inc: inc["params"].update(target_id="db.missing"))
    with pytest.raises(ScenarioError, match="db.missing"):
        create_app(Settings(db_url="sqlite+pysqlite:///:memory:", scenario_dir=d))


@pytest.mark.parametrize(
    ("name", "mutate", "message"),
    [
        (
            "topology.json",
            lambda t: t["edges"].append({**t["edges"][0], "target": "user.ghost"}),
            "duplicate edge",
        ),
        ("topology.json", lambda t: t["edges"][0].update(target="user.ghost"), "unknown node user.ghost"),
        (
            "topology.json",
            lambda t: t["nodes"][0].update(evidence_ids=["EV-99"]),
            "unknown evidence id EV-99",
        ),
        (
            "actions.json",
            lambda a: a[0]["cuts"].append(
                {"ref": "e.phish-user", "ref_type": "edge", "strength": "hard", "rationale": "x"}
            ),
            "cannot cut historical edge",
        ),
        (
            "actions.json",
            lambda a: a[3]["authorisation"].update(required_roles=["tier2_analyst"]),
            "missing ['finance_ops_owner']",
        ),
        (
            "actions.json",
            lambda a: a[0]["authorisation"].update(policy_ids=["IR-SESS-01"]),
            "does not apply to revoke_oauth_grant",
        ),
        (
            "events.json",
            lambda e: e[0].update(attack={"technique_id": "T1566", "technique_name": "Phishing"}),
            "attack must be null",
        ),
        ("constraints.json", lambda c: c.pop(), "constraints must define each"),
        ("presets.json", lambda p: p[0]["action_ids"].append("C99"), "unknown action C99"),
        ("presets.json", lambda p: p.pop(), "presets must define"),
        ("variants.json", lambda v: v[1]["ops"][0].update(edge_id="d.nope"), "unknown edge d.nope"),
    ],
)
def test_AT_1_1_cross_reference_errors(fixture_copy: Any, name: str, mutate: Any, message: str) -> None:
    with pytest.raises(ScenarioError, match=message.replace("[", r"\[").replace("]", r"\]")):
        load_scenario(fixture_copy(name, mutate))


# AT-1.2


def test_AT_1_2_fixture_evidence_rules() -> None:
    s = load_scenario()
    for e in s.topology.edges:
        if e.kind == "hostile" and e.provenance == "observed":
            assert e.evidence_ids, e.id
        if e.provenance == "forecast":
            assert not e.evidence_ids, e.id


def _edge(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": "f.a-b",
        "source": "user.a",
        "target": "user.b",
        "kind": "hostile",
        "relation": "x",
        "provenance": "forecast",
        "transition": {"p": 0.5, "delay_s": [0, 10]},
    }
    return {**base, **overrides}


def test_AT_1_2_observed_hostile_edge_needs_evidence() -> None:
    with pytest.raises(ValidationError, match="observed hostile edge needs at least one evidence id"):
        GraphEdge.model_validate(_edge(provenance="observed"))


def test_AT_1_2_forecast_edge_has_no_evidence() -> None:
    with pytest.raises(ValidationError, match="forecast edge must not carry evidence ids"):
        GraphEdge.model_validate(_edge(evidence_ids=["EV-01"]))


def test_live_hostile_edge_needs_transition() -> None:
    with pytest.raises(ValidationError, match="transition is required"):
        GraphEdge.model_validate(_edge(transition=None))


# AT-1.3


@pytest.mark.parametrize("field", ["impact", "reversibility", "authorisation"])
def test_AT_1_3_action_requires_field(fixture_copy: Any, field: str) -> None:
    raw = json.loads((DEFAULT_SCENARIO_DIR / "actions.json").read_text(encoding="utf-8"))[0]
    raw.pop(field)
    with pytest.raises(ValidationError, match=field):
        ResponseAction.model_validate(raw)
    with pytest.raises(ScenarioError, match=field):
        load_scenario(fixture_copy("actions.json", lambda a: a[0].pop(field)))


def test_AT_1_3_fixture_actions_complete() -> None:
    for a in load_scenario().actions:
        assert a.impact.description and a.reversibility.method and a.authorisation.policy_ids
        assert a.connector == "simulated"


# AT-1.5


def test_AT_1_5_background_is_deterministic() -> None:
    s = load_scenario()
    t0, seed = s.incident.t0, s.incident.params.seed
    first, second = generate(seed, t0), generate(seed, t0)
    assert sha256_hex(first) == sha256_hex(second)
    assert sha256_hex(first) != sha256_hex(generate(seed + 1, t0))


def test_AT_1_5_committed_background_matches_generator() -> None:
    s = load_scenario()
    committed = (DEFAULT_SCENARIO_DIR / "background_events.json").read_text(encoding="utf-8")
    assert committed == render(generate(s.incident.params.seed, s.incident.t0)), (
        "background_events.json is stale; run: python -m halt.scenario.background"
    )


def test_background_never_touches_the_attacker() -> None:
    for e in load_scenario().background_events:
        assert e.attributes.get("asn") != 64500
        assert "m.verma" not in str(e.attributes.get("upn", ""))
