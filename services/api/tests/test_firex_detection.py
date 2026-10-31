"""Detection and reconstruction on synthetic fixtures. Positives and negatives for every rule, and the
data-quality
fixtures the controlled ranges cannot reach: collapsed timestamps, session collisions and unreliable attack
ids."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pyarrow.parquet as pq

from halt.firex.parser import canonical_hash, parse_text
from halt.firex.reconstruct import cluster_detections
from halt.firex.util import read_json
from tests.firex_support import DAY, admin, background, dns, ips, line, run_fixture, traffic, virus, vpn_up


def rules_of(runner: Any) -> list[str]:
    return [d["rule_id"] for d in read_json(runner.dir / "detections.json")]


def incidents_of(runner: Any) -> list[dict[str, Any]]:
    return read_json(runner.dir / "incidents" / "index.json")


# ---- account lifecycle


def lifecycle(actor: str = "opsuser", src: str = "203.0.113.9", account: str = "tempsvc1") -> list[str]:
    return [
        admin(
            DAY, actor, src, action="Add", status=None, msg=f"Add system.admin {account}", logid="0100044547"
        ),
        admin(DAY + 300, account, src),
        admin(
            DAY + 600,
            actor,
            src,
            action="Delete",
            status=None,
            msg=f"Delete system.admin {account}",
            logid="0100044547",
        ),
    ]


def test_account_created_used_deleted(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, [*background(DAY - 100, 20), *lifecycle()])
    [det] = read_json(runner.dir / "detections.json")
    assert det["rule_id"] == "account_lifecycle" and det["status"] == "unconfirmed"
    assert [s["stage"] for s in det["steps"]] == ["installation", "actions_on_objectives", "defense_evasion"]
    assert det["technique_id"] == "T1136.001" and det["basis"] == "observed"
    assert len(det["evidence_refs"]) == 3 and det["first_utc"] and det["config_hash"]


def test_created_account_never_used_or_removed_is_not_a_detection(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, [lifecycle()[0], *background(DAY, 5)])
    assert rules_of(runner) == []


def test_partial_lifecycle_has_lower_confidence(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, lifecycle()[:2])
    [det] = read_json(runner.dir / "detections.json")
    assert det["confidence"] < 0.85


# ---- logging tamper


def tamper(user: str = "opsuser", src: str = "203.0.113.10") -> list[str]:
    off = "Attribute 'status' of setting 'log disk setting' changed from 'enable' to 'disable'"
    on = "Attribute 'status' of setting 'log disk setting' changed from 'disable' to 'enable'"
    return [
        admin(DAY, user, src, action="Edit", status=None, msg=off, logid="0100044546"),
        admin(
            DAY + 60,
            user,
            src,
            action="Edit",
            status=None,
            msg="Objects of 'firewall policy' were purged",
            logid="0100044546",
        ),
        admin(DAY + 120, user, src, action="Edit", status=None, msg=on, logid="0100044546"),
    ]


def test_logging_disabled_changed_restored(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, tamper())
    [det] = read_json(runner.dir / "detections.json")
    assert det["rule_id"] == "logging_tamper" and len(det["steps"]) == 3
    assert det["confidence"] == 0.85


def test_ordinary_config_edit_is_not_tamper(tmp_path: Path) -> None:
    edit = admin(
        DAY,
        "opsuser",
        "203.0.113.10",
        action="Edit",
        status=None,
        msg="Changed the banner text",
        logid="0100044546",
    )
    assert rules_of(run_fixture(tmp_path, [edit])) == []


def test_disable_with_no_change_or_restore_is_not_a_detection(tmp_path: Path) -> None:
    assert rules_of(run_fixture(tmp_path, tamper()[:1])) == []


# ---- web attack


NAMES = ("HTTP.URI.SQL.Injection", "HTTP.Path.Traversal", "HTTP.URI.XSS.Attack")


def test_concentrated_web_attack_needs_volume_and_several_signatures(tmp_path: Path) -> None:
    lines = [ips(DAY + i, f"203.0.113.{i % 3 + 1}", "10.20.0.5", NAMES[i % 3], 15000 + i) for i in range(60)]
    [det] = read_json(run_fixture(tmp_path / "a", lines).dir / "detections.json")
    assert det["rule_id"] == "web_attack_concentration" and det["merged_events"] == 60
    assert det["technique_id"] == "T1190"
    one_signature = [ips(DAY + i, "203.0.113.1", "10.20.0.5", NAMES[0], 15000) for i in range(60)]
    assert rules_of(run_fixture(tmp_path / "b", one_signature)) == []
    too_few = [ips(DAY + i, "203.0.113.1", "10.20.0.5", NAMES[i % 3], 15000) for i in range(10)]
    assert rules_of(run_fixture(tmp_path / "c", too_few)) == []


def test_scattered_ips_alerts_are_not_an_incident(tmp_path: Path) -> None:
    lines = [
        ips(DAY + i, f"10.1.0.{i % 200 + 1}", f"198.51.{i % 200}.7", NAMES[i % 3], 100 + i)
        for i in range(200)
    ]
    runner = run_fixture(tmp_path, lines)
    assert rules_of(runner) == [] and incidents_of(runner) == []


def test_attackid_is_not_the_identity(tmp_path: Path) -> None:
    """One id reused across names counts as several signatures; many ids on one name count as one."""
    many_ids = [ips(DAY + i, "203.0.113.1", "10.20.0.5", NAMES[0], 20000 + i) for i in range(60)]
    assert rules_of(run_fixture(tmp_path / "a", many_ids)) == []
    one_id = [ips(DAY + i, "203.0.113.1", "10.20.0.5", NAMES[i % 3], 15000) for i in range(60)]
    assert rules_of(run_fixture(tmp_path / "b", one_id)) == ["web_attack_concentration"]


# ---- internal fan-out


def fanout(count: int, src: str = "10.1.0.44") -> list[str]:
    return [
        traffic(
            DAY + i,
            src,
            f"10.20.0.{i + 1}",
            srcrole="lan",
            dstrole="dmz",
            port=445,
            service="SMB",
            sid=500 + i,
        )
        for i in range(count)
    ]


def test_internal_fanout(tmp_path: Path) -> None:
    assert rules_of(run_fixture(tmp_path / "a", fanout(15))) == ["internal_fanout"]
    assert rules_of(run_fixture(tmp_path / "b", fanout(5))) == []


def test_external_smb_is_not_internal_fanout(tmp_path: Path) -> None:
    lines = [traffic(DAY + i, "10.1.0.4", f"198.51.100.{i + 1}", port=445, service="SMB") for i in range(30)]
    assert rules_of(run_fixture(tmp_path, lines)) == []


# ---- DNS


def test_sustained_dns_needs_volume_and_duration(tmp_path: Path) -> None:
    long = [dns(DAY + i * 2, "10.1.0.88", "198.51.100.8") for i in range(600)]
    [det] = read_json(run_fixture(tmp_path / "a", long).dir / "detections.json")
    assert det["rule_id"] == "sustained_dns" and det["basis"] == "inferred"
    assert (
        det["last_ns"] - det["first_ns"] == 599 * 2 * 1_000_000_000
    )  # a merged step keeps its real duration
    short = [
        dns(DAY, "10.1.0.88", "198.51.100.8").replace(f"eventtime={DAY}000000000", f"eventtime={DAY}{i:09d}")
        for i in range(600)
    ]
    assert rules_of(run_fixture(tmp_path / "b", short)) == []


# ---- malware


def test_repeated_malware_requires_the_same_host_and_destination(tmp_path: Path) -> None:
    same = [virus(DAY + i * 60, "10.1.0.51", "198.51.100.34", f"W{i}/x!tr", sid=i + 1) for i in range(5)]
    assert rules_of(run_fixture(tmp_path / "a", same)) == ["repeated_malware"]
    scattered = [virus(DAY + i, f"10.1.0.{i + 1}", f"198.51.100.{i + 1}", "W1/x!tr") for i in range(50)]
    runner = run_fixture(tmp_path / "b", scattered)
    assert rules_of(runner) == [] and incidents_of(runner) == []


# ---- flood


def deny(i: int, dst: str = "10.20.0.20") -> str:
    return traffic(
        DAY + i,
        f"198.{i % 200}.{i % 250}.{i % 240 + 1}",
        dst,
        action="deny",
        srcrole="wan",
        dstrole="dmz",
        sid=i + 1,
    )


def test_denial_flood_needs_volume_and_many_sources(tmp_path: Path) -> None:
    assert rules_of(run_fixture(tmp_path / "a", [deny(i) for i in range(1200)])) == ["denial_flood"]
    one_source = [
        traffic(DAY + i, "198.51.100.1", "10.20.0.20", action="deny", srcrole="wan", dstrole="dmz")
        for i in range(1200)
    ]
    assert rules_of(run_fixture(tmp_path / "b", one_source)) == []


# ---- VPN


def test_vpn_identity_alternating_between_addresses(tmp_path: Path) -> None:
    alt = [
        vpn_up(DAY + i * 400, "user.one", "198.51.100.1" if i % 2 == 0 else "198.51.100.2") for i in range(4)
    ]
    assert rules_of(run_fixture(tmp_path / "a", alt)) == ["vpn_alternation"]
    same = [vpn_up(DAY + i * 400, "user.one", "198.51.100.1") for i in range(4)]
    assert rules_of(run_fixture(tmp_path / "b", same)) == []
    moved_once = [
        vpn_up(DAY + i * 400, "user.one", "198.51.100.1" if i < 2 else "198.51.100.2") for i in range(4)
    ]
    assert rules_of(run_fixture(tmp_path / "c", moved_once)) == []


# ---- failed logins


def failed(ts: int, user: str, src: str) -> str:
    return admin(ts, user, src, status="failed", msg="login failed", logid="0100032002")


def test_failure_background_alone_is_not_brute_force(tmp_path: Path) -> None:
    lines = [failed(DAY + i, "admin", f"198.51.{i % 200}.{i % 240 + 1}") for i in range(2000)]
    runner = run_fixture(tmp_path, lines)
    assert rules_of(runner) == [] and incidents_of(runner) == []


def test_success_unrelated_to_failures_is_not_brute_force(tmp_path: Path) -> None:
    lines = [
        *[failed(DAY + i, "admin", "198.51.100.1") for i in range(50)],
        admin(DAY + 60, "someone", "198.51.100.200"),
    ]
    assert rules_of(run_fixture(tmp_path, lines)) == []


def test_failures_then_success_for_same_account_or_source(tmp_path: Path) -> None:
    lines = [
        *[failed(DAY + i, "admin", "198.51.100.1") for i in range(50)],
        admin(DAY + 60, "admin", "198.51.100.1"),
    ]
    assert rules_of(run_fixture(tmp_path / "a", lines)) == ["failure_then_success"]
    late = [
        *[failed(DAY + i, "admin", "198.51.100.1") for i in range(50)],
        admin(DAY + 90000, "admin", "198.51.100.1"),
    ]
    assert rules_of(run_fixture(tmp_path / "b", late)) == []


# ---- collapsed timestamps, duplicates, sessions


def test_collapse_threshold_is_configurable_and_records_ranges(tmp_path: Path) -> None:
    lines = [
        *background(DAY, 5),
        *[traffic(DAY + 50, f"10.1.0.{i % 200 + 1}", "198.51.100.1", sid=i, sent=i) for i in range(30)],
    ]
    runner = run_fixture(
        tmp_path, lines, rules={"collapse": {"threshold_records": 20, "config_version": "test"}}
    )
    quality = read_json(runner.dir / "quality.json")
    [stamp] = quality["collapsed_timestamps"]
    assert (
        stamp["affected_records"] == 30
        and stamp["threshold_records"] == 20
        and stamp["config_version"] == "test"
    )
    assert (
        stamp["first_line"] == 6 and stamp["last_line"] == 35 and stamp["first_offset"] < stamp["last_offset"]
    )
    assert quality["records_in_collapsed_timestamps"] == 30


def test_below_threshold_is_not_collapsed(tmp_path: Path) -> None:
    lines = [traffic(DAY, "10.1.0.1", "198.51.100.1", sid=i, sent=i) for i in range(10)]
    assert read_json(run_fixture(tmp_path, lines).dir / "quality.json")["collapsed_timestamps"] == []


def test_collapsed_records_do_not_create_window_detections(tmp_path: Path) -> None:
    """A burst sharing one timestamp has no duration or rate, so the time-window DNS rule must ignore it."""
    ts_rule = {"collapse": {"threshold_records": 100, "config_version": "test"}}
    pile = [
        dns(DAY + 700, "10.1.0.9", "198.51.100.8").replace("x.example", f"h{i}.example") for i in range(800)
    ]
    spread = [dns(DAY + 700 - i, "10.1.0.9", "198.51.100.8") for i in range(1, 50)]
    runner = run_fixture(tmp_path, [*spread, *pile], rules=ts_rule)
    assert read_json(runner.dir / "quality.json")["records_in_collapsed_timestamps"] == 800
    assert "sustained_dns" not in rules_of(runner)


def test_collapsed_evidence_is_labelled_and_ordered_by_offset(tmp_path: Path) -> None:
    ts_rule = {"collapse": {"threshold_records": 100, "config_version": "test"}}
    same = [
        ips(DAY, f"203.0.113.{i % 3 + 1}", "10.20.0.5", NAMES[i % 3], 15000 + i, sid=i) for i in range(120)
    ]
    runner = run_fixture(tmp_path, same, rules=ts_rule)
    [det] = read_json(runner.dir / "detections.json")
    assert det["timestamp_quality"] == "collapsed"
    offsets = [s["offset"] for s in det["steps"]]
    assert offsets == sorted(offsets)
    [summary] = incidents_of(runner)
    detail = read_json(runner.dir / "incidents" / summary["incident_id"] / "detail.json")
    assert any("collapsed" in gap for gap in detail["evidence_gaps"])
    graph = read_json(runner.dir / "incidents" / summary["incident_id"] / "graph.json")
    # Bounded: never all-to-all. The selected path is a chain, one next_step per consecutive pair.
    links = [e for e in graph["edges"] if e["relation"] == "next_step"]
    steps = [n for n in graph["nodes"] if n["on_selected_path"]]
    assert len(links) == len(steps) - 1
    assert any("same timestamp" in c for e in links for c in e["contradictions"])


def test_exact_duplicates_are_counted_once_but_repeated_behaviour_is_not_a_duplicate(tmp_path: Path) -> None:
    repeat = traffic(DAY, "10.1.0.1", "198.51.100.1")
    repeated_behaviour = [traffic(DAY + i, "10.1.0.2", "198.51.100.2", sid=9) for i in range(30)]
    runner = run_fixture(tmp_path, [repeat, repeat, repeat, *repeated_behaviour])
    quality = read_json(runner.dir / "quality.json")
    assert quality["exact_duplicates"] == 2
    bursts = read_json(runner.dir / "bursts.json")
    assert bursts["total"] == 1
    assert bursts["items"][0]["count"] == 30 and bursts["items"][0]["grouping_key"]["src_ip"] == "10.1.0.2"
    assert bursts["items"][0]["evidence_refs"] and bursts["items"][0]["rule_version"]


def test_duplicates_do_not_inflate_detection_counts(tmp_path: Path) -> None:
    unique = [ips(DAY + i, "203.0.113.1", "10.20.0.5", NAMES[i % 3], 100 + i) for i in range(30)]
    assert rules_of(run_fixture(tmp_path, unique + unique)) == []


def test_session_id_alone_links_nothing(tmp_path: Path) -> None:
    """A malware record and unrelated traffic sharing one session id stay apart."""
    shared = 777
    lines = [
        *[virus(DAY + i * 60, "10.1.0.51", "198.51.100.34", "W1/x!tr", sid=shared) for i in range(4)],
        traffic(DAY + 5, "10.9.9.9", "198.51.100.200", sid=shared),
    ]
    runner = run_fixture(tmp_path, lines)
    [summary] = incidents_of(runner)
    graph = read_json(runner.dir / "incidents" / summary["incident_id"] / "graph.json")
    labels = " ".join(n["label"] for n in graph["nodes"])
    assert "10.9.9.9" not in labels and "198.51.100.200" not in labels


# ---- reconstruction


def det(rid: str, ns: int, **ents: list[str]) -> dict[str, Any]:
    return {"detection_id": rid, "first_ns": ns, "first_offset": ns, "entities": ents}


CORRELATION = {"max_join_gap_seconds": 1000, "max_entity_detections": 3}


def test_cluster_joins_only_on_entities_never_on_time() -> None:
    groups = cluster_detections(
        [det("a", 1, users=["u1"]), det("b", 2, users=["u2"]), det("c", 3, users=["u1"])], CORRELATION
    )
    assert [[d["detection_id"] for d in g] for g in groups] == [["a", "c"], ["b"]]


def test_cluster_ignores_over_common_entities() -> None:
    many = [det(str(i), i, src_ips=["198.51.100.1"]) for i in range(5)]
    assert len(cluster_detections(many, CORRELATION)) == 5


def test_cluster_requires_a_pivot_for_a_shared_target() -> None:
    shared_target = [det("a", 1, dst_ips=["10.0.0.5"]), det("b", 2, dst_ips=["10.0.0.5"])]
    assert len(cluster_detections(shared_target, CORRELATION)) == 2
    pivot = [det("a", 1, dst_ips=["10.0.0.5"]), det("b", 2, src_ips=["10.0.0.5"])]
    assert len(cluster_detections(pivot, CORRELATION)) == 1


def test_cluster_respects_the_join_gap() -> None:
    far = [det("a", 1, users=["u"]), det("b", 10**13, users=["u"])]
    assert len(cluster_detections(far, CORRELATION)) == 2


def test_incident_contents_and_observed_inferred_reachable_are_separate(tmp_path: Path) -> None:
    host = "10.1.0.44"
    lines = [
        *fanout(15, src=host),
        *[virus(DAY + 100 + i * 60, host, "198.51.100.34", "W1/x!tr", sid=900 + i) for i in range(4)],
        traffic(
            DAY + 50, host, "10.30.0.9", srcrole="lan", dstrole="lan", port=8080, service="HTTP", sid=950
        ),
    ]
    runner = run_fixture(tmp_path, lines)
    [summary] = incidents_of(runner)
    assert summary["detection_count"] == 2 and summary["status"] == "unconfirmed"
    folder = runner.dir / "incidents" / summary["incident_id"]
    graph, hyp, reach, story, detail = (
        read_json(folder / f"{n}.json") for n in ("graph", "hypotheses", "reachability", "story", "detail")
    )
    kinds = {e["classification"] for e in graph["edges"]}
    assert {"observed", "inferred", "reachable"} <= kinds
    assert all(not e["on_selected_path"] for e in graph["edges"] if e["classification"] == "reachable")
    assert all(
        e["evidence_refs"] and e["rule_version"] for e in graph["edges"] if e["classification"] != "reachable"
    )
    assert [t["target"] for t in reach["targets"]] == ["10.30.0.9"]
    assert all(t["hypothetical"] is True for t in reach["targets"]) and "not observed" in reach["label"]
    assert hyp["selected"]["status"] == "selected" and hyp["alternates"]
    assert hyp["uncertainty_margin"] == round(
        hyp["selected"]["score"] - max(a["score"] for a in hyp["alternates"]), 3
    )
    assert story["unsupported_claims"] == 0 and all(s["evidence_ids"] for s in story["statements"])
    valid = {e["evidence_id"] for e in detail["evidence"]}
    assert {i for s in story["statements"] for i in s["evidence_ids"]} <= valid
    assert detail["response_simulation"]["available"] is False and detail["response_simulation"]["missing"]
    assert len(graph["nodes"]) <= graph["node_cap"]


def test_replay_gives_identical_ids_and_hashes(tmp_path: Path) -> None:
    lines = [*background(DAY - 50, 30), *lifecycle(), *tamper(), *fanout(15)]
    a = run_fixture(tmp_path / "a", list(lines), workers=1)
    b = run_fixture(tmp_path / "b", list(lines), workers=2, chunk_bytes=1024)
    assert [i["incident_id"] for i in incidents_of(a)] == [i["incident_id"] for i in incidents_of(b)]
    for summary in incidents_of(a):
        ga = read_json(a.dir / "incidents" / summary["incident_id"] / "graph.json")["graph_hash"]
        gb = read_json(b.dir / "incidents" / summary["incident_id"] / "graph.json")["graph_hash"]
        assert ga == gb


def test_canonical_hash_matches_between_parse_and_store(tmp_path: Path) -> None:
    text = line(DAY, srcip="10.0.0.1", msg="a b")
    runner = run_fixture(tmp_path, [text])
    fields, _ = parse_text(text)
    assert fields is not None
    assert pq.read_table(runner.dir / "parts").column("canonical_sha256")[0].as_py() == canonical_hash(fields)
