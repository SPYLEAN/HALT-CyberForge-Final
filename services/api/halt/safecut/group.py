"""Group selected candidates into display actions (A1..An).

Candidates group when they share action type, policies and principal (the user owning their targets,
via identity edges; otherwise the targets themselves). Two session revocations for one user become one
display action; everything else stays separate.
"""

from __future__ import annotations

from collections.abc import Sequence

from halt.contracts.actions import DisplayAction, ResponseAction
from halt.contracts.findings import AttackPath
from halt.safecut.instance import Instance
from halt.scenario.models import Scenario

PLURAL = {"revoke_session": "Revoke {n} compromised sessions"}


def _principal(s: Scenario, target: str) -> str:
    owners = sorted(e.source for e in s.topology.edges if e.kind == "identity" and e.target == target)
    return owners[0] if owners else target


def group(
    s: Scenario, inst: Instance, chosen: Sequence[str], paths: Sequence[AttackPath]
) -> list[DisplayAction]:
    actions = {a.id: a for a in s.actions}
    covers = {c.id: c.covers for c in inst.candidates}
    groups: dict[tuple[str, tuple[str, ...], tuple[str, ...]], list[ResponseAction]] = {}
    for cid in sorted(chosen):
        a = actions[cid]
        key = (
            a.type,
            tuple(sorted(a.authorisation.policy_ids)),
            tuple(sorted({_principal(s, t) for t in a.targets})),
        )
        groups.setdefault(key, []).append(a)

    order = [p.id for p in paths]
    out = []
    for i, members in enumerate(sorted(groups.values(), key=lambda g: g[0].id), start=1):
        blocked = set().union(*(covers[a.id] for a in members))
        title = (
            members[0].title
            if len(members) == 1
            else PLURAL.get(members[0].type, " + ".join(a.title for a in members)).format(n=len(members))
        )
        out.append(
            DisplayAction(
                id=f"A{i}",
                candidate_ids=[a.id for a in members],
                title=title,
                blocks_path_ids=[p for p in order if p in blocked],
            )
        )
    return out
