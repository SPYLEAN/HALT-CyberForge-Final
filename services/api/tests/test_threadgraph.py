"""AT-2.1 – AT-2.3: deterministic snapshots, exact path enumeration, time slicing; cut semantics."""

from __future__ import annotations

import pytest

from halt.scenario.loader import load_scenario
from halt.scenario.models import Scenario
from halt.threadgraph.build import snapshot
from halt.threadgraph.cuts import blocks, broken_processes, removal_for
from halt.threadgraph.paths import enumerate_paths

TARGET = "db.finance_ledger"

# DEMO_SCENARIO.md §3: the six high-risk candidates plus U1, by live route.
EXPECTED_ROUTES = {
    ("attacker.docusync_app", "token.grant_docusync", "api.finance", TARGET),
    ("attacker.docusync_app", "token.grant_docusync", "process.reconciliation", TARGET),
    ("user.m_verma", "session.s3", "process.payment", TARGET),
    ("attacker.as64500", "session.s1", "api.finance", TARGET),
    ("attacker.as64500", "session.s2", "process.payment", TARGET),
    ("attacker.docusync_app", "token.grant_docusync", "process.payroll", TARGET),
    ("attacker.as64500", "process.support", "api.finance", TARGET),  # U1
}


@pytest.fixture(scope="module")
def scenario() -> Scenario:
    return load_scenario()


def _paths(s: Scenario) -> dict[tuple[str, ...], object]:
    return {tuple(p.node_ids): p for p in enumerate_paths(s.topology.nodes, s.topology.edges, TARGET)}


def test_AT_2_1_snapshot_hash_is_stable(scenario: Scenario) -> None:
    hashes = {snapshot(load_scenario()).hash for _ in range(3)}
    assert len(hashes) == 1
    assert snapshot(scenario).id == f"GS-{hashes.pop()[:12]}"


def test_AT_2_1_snapshot_hash_changes_with_the_graph() -> None:
    assert snapshot(load_scenario()).hash != snapshot(load_scenario(variant="verma_not_releaser")).hash


def test_AT_2_2_exact_paths(scenario: Scenario) -> None:
    assert set(_paths(scenario)) == EXPECTED_ROUTES


def test_AT_2_2_provenance_and_uncertainty(scenario: Scenario) -> None:
    paths = enumerate_paths(scenario.topology.nodes, scenario.topology.edges, TARGET)
    uncertain = [p for p in paths if p.uncertain]
    assert [p.node_ids[1] for p in uncertain] == ["process.support"]
    s3 = next(p for p in paths if "session.s3" in p.node_ids)
    assert s3.provenance == "forecast"
    assert "e.asn-user" in s3.entry_edge_ids  # the sign-in that put the attacker in the account
    assert all(not e.startswith("f.") for p in paths for e in p.entry_edge_ids)


def test_AT_2_2_enumeration_is_deterministic(scenario: Scenario) -> None:
    runs = [enumerate_paths(scenario.topology.nodes, scenario.topology.edges, TARGET) for _ in range(3)]
    assert runs[0] == runs[1] == runs[2]


def test_AT_2_3_snapshot_respects_first_seen(scenario: Scenario) -> None:
    t0 = scenario.incident.t0
    for t in [0, 84, 99, 128, 300, 400]:
        snap = snapshot(scenario, t, include_forecast=False)
        for item in [*snap.nodes, *snap.edges]:
            assert item.first_seen is None or (item.first_seen - t0).total_seconds() <= t
            assert item.provenance != "forecast"
    early = {n.id for n in snapshot(scenario, 0, include_forecast=False).nodes}
    assert "attacker.phish_sender" in early and "token.grant_docusync" not in early
    assert "token.grant_docusync" in {n.id for n in snapshot(scenario, 158).nodes}


def test_AT_2_3_edges_never_dangle(scenario: Scenario) -> None:
    for t in range(0, 700, 50):
        snap = snapshot(scenario, t)
        ids = {n.id for n in snap.nodes}
        assert all(e.source in ids and e.target in ids for e in snap.edges)


def test_cut_coverage_per_candidate(scenario: Scenario) -> None:
    paths = enumerate_paths(scenario.topology.nodes, scenario.topology.edges, TARGET)
    actions = {a.id: a for a in scenario.actions}

    def covered(cid: str) -> set[str]:
        r = removal_for([actions[cid]])
        return {p.node_ids[1] for p in paths if blocks(p, r)}

    assert covered("C01") == {"token.grant_docusync"}  # the three grant paths
    assert covered("C02") == {"session.s1"}
    assert covered("C03") == {"session.s2"}
    assert covered("C04") == {"session.s3"}
    assert covered("C08") == {"session.s3"}
    assert covered("C09") == set()  # soft cuts never count
    assert covered("C11") == set() and covered("C12") == set()


def test_soft_cuts_only_when_asked(scenario: Scenario) -> None:
    c09 = next(a for a in scenario.actions if a.id == "C09")
    assert not removal_for([c09]).edge_ids
    assert removal_for([c09], strengths=("hard", "soft")).edge_ids == {
        "e.asn-s1",
        "e.asn-s2",
        "i.asn-support",
    }


def test_business_breakage(scenario: Scenario) -> None:
    nodes, edges = scenario.topology.nodes, scenario.topology.edges
    actions = {a.id: a for a in scenario.actions}
    assert (
        broken_processes(nodes, edges, removal_for([actions[c] for c in ["C01", "C02", "C03", "C04"]])) == {}
    )
    assert set(broken_processes(nodes, edges, removal_for([actions["C08"]]))) == {"process.payment"}
    assert set(broken_processes(nodes, edges, removal_for([actions["C05"]]))) == {
        "process.payment",
        "process.payroll",
        "process.reconciliation",
        "process.support",
    }
    v = load_scenario(variant="verma_not_releaser")
    assert broken_processes(v.topology.nodes, v.topology.edges, removal_for([actions["C08"]])) == {}
