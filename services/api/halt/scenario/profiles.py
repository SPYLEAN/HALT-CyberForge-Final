"""Policy profiles as constraint limits.

A profile changes nothing but the limits of C-COVER (risk threshold above which every enumerated path to the
protected asset must be cut) and C-RESIDUAL (simulated reach the open paths may keep). `apply_profile`
writes those limits into the scenario's constraints, so SafeCut, ProofSeal and the reports read the policy
exactly as they read every other constraint: nothing downstream branches on the profile id.
"""

from __future__ import annotations

from halt.contracts.constraints import PolicyProfile, ProfileId
from halt.scenario.loader import ScenarioError
from halt.scenario.models import Scenario

DEFAULT_PROFILE: ProfileId = "continuity_balanced"


def profile(s: Scenario, profile_id: ProfileId | None = None) -> PolicyProfile:
    wanted = profile_id or s.profile_id or DEFAULT_PROFILE
    found = next((p for p in s.profiles if p.id == wanted), None)
    if found is None:
        raise ScenarioError(f"unknown policy profile {wanted!r}; known: {[p.id for p in s.profiles]}")
    return found


def apply_profile(s: Scenario, profile_id: ProfileId | None = None) -> Scenario:
    p = profile(s, profile_id)
    limits = {"C-COVER": p.cover_min_risk, "C-RESIDUAL": float(p.residual_reach_limit)}
    constraints = [
        c.model_copy(update={"limit": limits[c.id]}) if c.id in limits else c for c in s.constraints
    ]
    return s.model_copy(update={"constraints": constraints, "profile_id": p.id})


def with_profile(s: Scenario) -> Scenario:
    """The scenario with a profile applied: its own, or the default one."""
    return s if s.profile_id is not None else apply_profile(s)
