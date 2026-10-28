"""AT-4.7: on random small instances the CP-SAT objective equals the brute-force objective."""

from __future__ import annotations

from _brute import brute_force
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from halt.safecut.instance import Candidate, Instance
from halt.safecut.model import solve_instance

PATHS = ("P1", "P2", "P3", "P4")
PROCESSES = ("b1", "b2", "b3")
USERS = ("u1", "u2", "u3", "u4")
GROUPS = {"g1": 7, "g2": 40}


@st.composite
def instances(draw: st.DrawFn) -> Instance:
    n = draw(st.integers(min_value=1, max_value=8))
    cands = []
    for i in range(n):
        cands.append(
            Candidate(
                id=f"X{i}",
                covers=frozenset(draw(st.sets(st.sampled_from(PATHS), max_size=3))),
                soft_covers=frozenset(),
                breaks=frozenset(draw(st.sets(st.sampled_from(PROCESSES), max_size=2))),
                users=frozenset(draw(st.sets(st.sampled_from(USERS), max_size=3))),
                groups=frozenset(draw(st.sets(st.sampled_from(sorted(GROUPS)), max_size=1))),
                approvals=draw(st.integers(min_value=1, max_value=3)),
                reversible_ok=draw(st.booleans()) or draw(st.booleans()),
                auth_ok=draw(st.booleans()) or draw(st.booleans()),
                evidence_ok=draw(st.booleans()) or draw(st.booleans()),
            )
        )
    return Instance(
        candidates=tuple(cands),
        paths=tuple(draw(st.sets(st.sampled_from(PATHS), min_size=1))),
        critical=frozenset(draw(st.sets(st.sampled_from(PROCESSES)))),
        processes=frozenset(PROCESSES),
        window_min=draw(st.sampled_from([30, 240])),
        downtime_limit_min=draw(st.sampled_from([0, 240])),
        users_limit=draw(st.sampled_from([2, 5, 50])),
        reversible_limit_s=300,
        group_sizes=dict(GROUPS),
    )


@settings(max_examples=200, deadline=None, derandomize=True, suppress_health_check=[HealthCheck.too_slow])
@given(instances())
def test_AT_4_7_cp_sat_matches_brute_force(inst: Instance) -> None:
    best, optimal, _ = brute_force(inst)
    result = solve_instance(inst)
    if best is None:
        assert result.status == "infeasible"
    else:
        assert result.status == "optimal"
        assert result.objective == best
        assert result.chosen in optimal
