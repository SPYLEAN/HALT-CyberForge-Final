"""Build a sealed Proof for an optimal SafeCut plan.

Claims (each recomputed here, see enumerate.py), under the plan's policy profile:
  CHK-01 coverage      0 of N paths the policy requires cut survive on the post-action snapshot
  CHK-02 business      every process keeps its dependency closure
  CHK-03 downtime      critical downtime within the limit
  CHK-04 users         distinct users affected within the limit
  CHK-05 authorisation every required role has an available approver at plan time
  CHK-06 evidence      every action preserves evidence; the event bundle is hashed into the proof
  CHK-07 rollback      every action reversible in time; apply-then-roll-back dry run restores the snapshot
  CHK-08 optimality    2^n enumeration finds the plan's objective as the minimum
  CHK-09 irredundancy  dropping any selected action breaks the policy (a required path re-opens, or the
                       open paths' reach exceeds C-RESIDUAL)
  CHK-10 residual      the enumerated paths left open, and their simulated reach (sum of own counts, and
                       EchoLab's measured count for this plan) are within the policy's C-RESIDUAL limit
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta

from halt.canonical import sha256_hex
from halt.contracts.common import Derivation, Meta
from halt.contracts.findings import AttackPath
from halt.contracts.graph import Removed
from halt.contracts.plan import Plan
from halt.contracts.proof import Enumeration, Proof, ProofClaim, Signature
from halt.contracts.simulation import PlanRef, SimulationRequest
from halt.echolab.simulate import simulate
from halt.gate.connectors import SimulatedEnvironment
from halt.proofseal.enumerate import (
    closure_of,
    enumerate_subsets,
    enumerated,
    hard_refs,
    limit,
    open_reach,
    required,
    roles_needed,
)
from halt.proofseal.seal import Sealer, certificate_of
from halt.scenario.loader import scenario_hashes
from halt.scenario.models import Scenario
from halt.scenario.profiles import apply_profile, profile
from halt.threadgraph.build import snapshot
from halt.threadgraph.paths import enumerate_paths

VALID_FOR = timedelta(minutes=40)


class ProofError(ValueError):
    pass


def _claim(
    n: int, text: str, method: str, ok: bool, result: Derivation, evidence: Sequence[str] = ()
) -> ProofClaim:
    return ProofClaim(
        id=f"CHK-{n:02d}",
        text=text,
        method=method,
        evidence_ids=list(evidence),
        result=result,
        status="verified" if ok else "failed",
    )


def prove(
    s: Scenario, paths: Sequence[AttackPath], plan: Plan, sealer: Sealer, at: datetime | None = None
) -> Proof:
    if plan.status != "optimal":
        raise ProofError("only an optimal plan can be sealed")
    # The proof judges the plan by the policy the plan names, read from the scenario, not from SafeCut.
    s = apply_profile(s, plan.profile_id)
    policy = profile(s)
    at = at or plan.meta.generated_at
    actions = {a.id: a for a in s.actions}
    selected = [actions[i] for i in plan.selected_candidate_ids]
    must = required(s, list(paths))
    must_paths = [p for p in paths if p.id in must]

    refs = set().union(*(hard_refs(a) for a in selected)) if selected else set()
    node_ids = {n.id for n in s.topology.nodes}
    removed = Removed(node_ids=sorted(refs & node_ids), edge_ids=sorted(refs - node_ids))
    pre, post = snapshot(s), snapshot(s, removed=removed)
    post_nodes, post_edges = {n.id for n in post.nodes}, {e.id for e in post.edges}
    claims: list[ProofClaim] = []

    # CHK-01 coverage
    surviving = [p.id for p in must_paths if set(p.node_ids) <= post_nodes and set(p.edge_ids) <= post_edges]
    claims.append(
        _claim(
            1,
            f"{len(surviving)} of {len(must_paths)} paths {policy.title} requires cut "
            "are reachable after the plan",
            f"Route check on post-action snapshot {post.hash[:12]}",
            not surviving,
            Derivation(
                numerator=len(surviving),
                denominator=len(must_paths),
                method="Routes whose nodes and edges all survive",
                source_ids=surviving,
            ),
        )
    )

    # CHK-02 business continuity
    processes = sorted(n.id for n in s.topology.nodes if n.kind == "process")
    broken = [p for p in processes if closure_of(s, p) & refs]
    claims.append(
        _claim(
            2,
            f"{len(processes) - len(broken)} of {len(processes)} business processes keep every dependency",
            "Dependency closure (networkx descendants) intersected with removed refs",
            not broken,
            Derivation(
                numerator=len(processes) - len(broken),
                denominator=len(processes),
                method="Processes with an intact dependency closure",
                source_ids=broken,
            ),
        )
    )

    # CHK-03 downtime
    critical = {n.id for n in s.topology.nodes if n.kind == "process" and n.criticality == "critical"}
    window = s.incident.params.containment_window_min
    downtime = window * len(set(broken) & critical)
    claims.append(
        _claim(
            3,
            f"Critical downtime {downtime} min (limit {limit(s, 'C-DOWNTIME'):g} min)",
            "Critical processes broken x containment window",
            downtime <= limit(s, "C-DOWNTIME"),
            Derivation(
                numerator=downtime, method=f"{len(set(broken) & critical)} critical processes x {window} min"
            ),
        )
    )

    # CHK-04 users
    named = sorted({u for a in selected for u in a.impact.users})
    groups = {g.group_id: g.users for a in selected for g in a.impact.groups}
    users = len(named) + sum(groups.values())
    claims.append(
        _claim(
            4,
            f"{users} users affected (limit {limit(s, 'C-USERS'):g})",
            "Distinct named users plus bulk groups",
            users <= limit(s, "C-USERS"),
            Derivation(
                numerator=users, method="Named users plus group sizes", source_ids=named + sorted(groups)
            ),
        )
    )

    # CHK-05 authorisation
    available = {
        r: [ap.name for ap in s.approvers if ap.available and r in ap.roles]
        for a in selected
        for r in roles_needed(s, a, at)
    }
    missing = sorted(r for r, names in available.items() if not names)
    claims.append(
        _claim(
            5,
            "Every required role has an available approver"
            if not missing
            else f"No approver for {', '.join(missing)}",
            f"Policies {sorted({p for a in selected for p in a.authorisation.policy_ids})} "
            f"at {at:%H:%MZ}, incl. freezes",
            not missing,
            Derivation(
                numerator=len(available) - len(missing),
                denominator=len(available),
                method="; ".join(f"{r}: {', '.join(n) or 'none'}" for r, n in sorted(available.items())),
            ),
        )
    )

    # CHK-06 evidence
    bundle = sha256_hex([*s.events, *s.background_events])
    destroys = [a.id for a in selected if not a.evidence_preserving]
    claims.append(
        _claim(
            6,
            f"{len(s.events)} incident events sealed; "
            f"{len(selected) - len(destroys)} of {len(selected)} actions "
            "preserve evidence",
            f"sha256 of the event bundle: {bundle}",
            not destroys,
            Derivation(
                numerator=len(selected) - len(destroys),
                denominator=len(selected),
                method="Evidence-preserving actions; bundle hashed before any action runs (IR-DATA-07)",
                source_ids=destroys,
            ),
            evidence=[e.id for e in s.events],
        )
    )

    # CHK-07 rollback
    rev_limit = limit(s, "C-REVERSIBLE")
    slow = [
        a.id
        for a in selected
        if not (a.reversibility.reversible and (a.reversibility.seconds or 1e9) <= rev_limit)
    ]
    env = SimulatedEnvironment(s)
    for a in selected:
        env.apply(a)
    applied_hash = env.snapshot_hash()
    for a in reversed(selected):
        env.rollback(a)
    restored = env.snapshot_hash() == pre.hash
    claims.append(
        _claim(
            7,
            f"{len(selected) - len(slow)} of {len(selected)} rollback plans within {rev_limit:g} s; "
            "dry run restores "
            "the snapshot"
            if restored
            else "Rollback dry run did not restore the snapshot",
            "Apply all, roll back in reverse on a simulated copy; compare snapshot hashes",
            not slow and restored and applied_hash == post.hash,
            Derivation(
                numerator=len(selected) - len(slow),
                denominator=len(selected),
                method=f"Pre {pre.hash[:12]} -> applied {applied_hash[:12]} "
                f"-> restored {env.snapshot_hash()[:12]}",
                source_ids=[a.reversibility.rollback_id or a.id for a in selected],
            ),
        )
    )

    # CHK-08 optimality, CHK-09 irredundancy
    enum, eff = enumerate_subsets(s, list(paths), at)
    chosen = tuple(sorted(plan.selected_candidate_ids))
    objective = plan.objective.value if plan.objective else None
    claims.append(
        _claim(
            8,
            f"Optimal among {enum.checked:,} subsets ({enum.feasible} feasible)"
            + (", unique" if len(enum.optimal) == 1 else f", {len(enum.optimal)} tie"),
            "Independent enumeration of every subset of the catalogue",
            enum.best == objective and chosen in enum.optimal,
            Derivation(
                numerator=len(enum.optimal),
                denominator=enum.checked,
                method=f"Minimum objective {enum.best}; plan objective {objective}",
            ),
        )
    )
    residual_limit = limit(s, "C-RESIDUAL")

    def still_holds(ids: list[str]) -> bool:
        covered = set().union(*(eff[o].covers for o in ids)) if ids else set()
        return must <= covered and open_reach(s, list(paths), covered)[1] <= residual_limit

    redundant = [cid for cid in chosen if still_holds([o for o in chosen if o != cid])]
    claims.append(
        _claim(
            9,
            "Removing any action breaks the policy: a required path re-opens or the residual limit "
            "is exceeded"
            if not redundant
            else f"Redundant: {', '.join(redundant)}",
            "Leave-one-out against C-COVER and C-RESIDUAL",
            not redundant,
            Derivation(
                numerator=len(chosen) - len(redundant),
                denominator=len(chosen),
                method="Actions whose removal still satisfies the policy",
                source_ids=redundant,
            ),
        )
    )

    # What the proof does not cover
    residual_routes = [p for p in enumerate_paths(post.nodes, post.edges, s.incident.params.target_id)]
    run = simulate(
        s,
        list(paths),
        SimulationRequest(plans=[PlanRef(label="C", source="plan", plan_id=plan.id)]),
        {plan.id: list(plan.selected_candidate_ids)},
    )
    future = run.futures[0]

    # CHK-10 residual: which enumerated paths survive the plan, and how far they still reach.
    edges = {e.id: e for e in s.topology.edges}
    survivors = [
        p for p in enumerated(s, list(paths)) if any(r.edge_ids == p.edge_ids for r in residual_routes)
    ]
    survivor_ids, bound = open_reach(
        s, list(paths), {p.id for p in enumerated(s, list(paths))} - {p.id for p in survivors}
    )
    measured = future.target_reached.numerator or 0
    n = future.target_reached.denominator or s.incident.params.rollouts
    claims.append(
        _claim(
            10,
            (
                f"{len(survivor_ids)} of {len(enumerated(s, list(paths)))} enumerated paths to "
                f"{policy.protected_asset_id} stay open ({', '.join(survivor_ids)}): "
                f"{measured:,} of {n:,} simulated rollouts still reach it, within the "
                f"{policy.title} limit of {residual_limit:,.0f}"
                if survivor_ids
                else f"No enumerated path to {policy.protected_asset_id} stays open: "
                f"{measured:,} of {n:,} simulated rollouts reach it"
            ),
            f"Route check on post-action snapshot {post.hash[:12]}; bound = sum of open paths' own reach "
            f"({bound:,}); EchoLab measured {measured:,} with seed {run.request.seed}",
            bound <= residual_limit and measured <= residual_limit,
            Derivation(
                numerator=measured,
                denominator=n,
                method=f"Open paths' reach bound {bound:,}; limit {residual_limit:,.0f} ({policy.id})",
                source_ids=survivor_ids,
            ),
            evidence=sorted({ev for p in survivors for e in p.edge_ids for ev in edges[e].evidence_ids}),
        )
    )

    not_covered = []
    for p in survivors:
        not_covered.append(
            f"{p.id} ({' → '.join(p.node_ids)}, simulated risk {p.risk:.4f}) "
            f"stays open under {policy.title}: "
            f"{future.path_reached.get(p.id, 0):,} of {n:,} simulated rollouts reach "
            f"{policy.protected_asset_id} along it with this plan. This is accepted residual risk, "
            "not containment."
        )
    not_covered += [
        "Only paths enumerated in the modelled graph are proven; "
        "this is not a claim of zero real-world risk.",
        "Attacker capabilities outside the modelled graph (other accounts, devices or tokens).",
        "Transition probabilities are scenario inputs; reach counts are simulated, not measured.",
        "Execution is simulated; no real identity or network system is changed.",
        "The signature uses a per-deployment demo key.",
    ]

    hashes = scenario_hashes(s)
    draft = Proof(
        id="PS-draft",
        plan_id=plan.id,
        snapshot_hash=pre.hash,
        post_snapshot_hash=post.hash,
        claims=claims,
        enumeration=Enumeration(
            subsets_checked=enum.checked,
            feasible=enum.feasible,
            optimal_count=len(enum.optimal),
            unique=len(enum.optimal) == 1,
        ),
        not_covered=not_covered,
        versions={
            "HALT-R1": "rules + logreg (r1_model.json)",
            "ThreadGraph": "schema 1.0",
            "EchoLab": f"seed {run.request.seed}, {run.request.rollouts} rollouts",
            "SafeCut": f"ortools {plan.solver.version}",
            "ProofSeal": "1.0",
            "policies": hashes["policies"][:12],
            "graph": hashes["graph"][:12],
        },
        certificate="0" * 64,
        signature=Signature(key_id="pending", value=""),
        sealed_at=at,
        valid_until=at + VALID_FOR,
        meta=Meta(
            incident_id=s.incident.id,
            seed=s.incident.params.seed,
            generated_at=at,
            input_hashes={**hashes, "events_bundle": bundle, "plan": plan.meta.input_hashes["plan_body"]},
        ),
    )
    # The id embeds a prefix of the content hash, then the certificate covers the final id too.
    number = s.incident.id.split("-")[-1]
    content = certificate_of({**draft.model_dump(mode="json"), "id": None})
    sealed = draft.model_copy(update={"id": f"PS-{number}-{content[:8]}"})
    certificate = certificate_of(sealed.model_dump(mode="json"))
    return sealed.model_copy(update={"certificate": certificate, "signature": sealer.sign(certificate)})


def all_verified(proof: Proof) -> bool:
    return all(c.status == "verified" for c in proof.claims)
