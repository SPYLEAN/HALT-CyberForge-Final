"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button, Dialog, StatusChip } from "@/components/halt";
import { displayStage } from "@/components/shell/CommandCenterShell";
import { SimulatedChip } from "@/components/shell/SimulatedChip";
import { STAGE_LABEL } from "@/components/shell/stages";
import type { EvidenceSection } from "@/components/shell/EvidenceRail";
import { useOps } from "@/lib/api/ops";
import { replayTime } from "@/lib/format";
import { useIncident, type Speed, type ViewId } from "@/lib/state/incident-store";

import { criticalServices, policyTitle, stages, type Stage } from "../derive";
import { useAllEvents } from "../hooks";
import { Icon, type IconName } from "../icons";

export type Mode = "command" | "forensic";

export const NAV: Array<{ id: ViewId; label: string; icon: IconName }> = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "graph", label: "ThreadGraph", icon: "graph" },
  { id: "echolab", label: "EchoLab", icon: "echolab" },
  { id: "safecut", label: "SafeCut", icon: "safecut" },
  { id: "proofseal", label: "ProofSeal", icon: "proofseal" },
  { id: "timeline", label: "Timeline", icon: "timeline" },
  { id: "policies", label: "Policies", icon: "policies" },
  { id: "report", label: "Reports", icon: "report" },
];

/** Each nav item's live status, read from the API (never decoration). */
function useNavStatus(): Record<ViewId, { text: string; tone?: "threat" | "continuity" | "text" } | null> {
  const ops = useOps();
  const { state } = useIncident();
  const verified = ops.proof?.claims.filter((c) => c.status === "verified").length ?? 0;
  const high = ops.paths.filter((p) => p.high_risk).length;
  return {
    overview: ops.incident ? { text: (STAGE_LABEL[displayStage(state.stage, ops.incident.state) ?? "new"]?.[0] ?? "").split(" ")[0]!.toLowerCase() } : null,
    graph: ops.paths.length ? { text: `${high} of ${ops.paths.length}`, tone: "threat" } : state.events.length ? { text: `${Object.keys(state.nodes).length} ent.` } : null,
    echolab: ops.simulation ? { text: "run", tone: "text" } : null,
    safecut: ops.plan ? (ops.plan.status === "optimal" ? { text: `${ops.plan.display_actions.length} act.`, tone: "continuity" } : { text: "none", tone: "threat" }) : null,
    proofseal: ops.proof ? { text: `${verified}/${ops.proof.claims.length}`, tone: verified === ops.proof.claims.length ? "continuity" : "threat" } : null,
    timeline: state.events.length ? { text: `${state.events.length} ev.` } : null,
    policies: ops.plan ? { text: ops.plan.profile_id === "continuity_balanced" ? "CB" : "ZT", tone: "text" } : null,
    report: ops.proof ? { text: "ready", tone: "text" } : null,
  };
}

export function NavRail({ active, onSelect, mode }: { active: ViewId; onSelect: (v: ViewId) => void; mode: Mode }) {
  const status = useNavStatus();
  return (
    <nav className="v2-rail" aria-label="Command Center">
      {NAV.map((item, i) => {
        const s = status[item.id];
        return (
          <span key={item.id} style={{ display: "contents" }}>
            {i === 7 ? <span className="v2-rail-sep" aria-hidden /> : null}
            <a
              href={`?view=${item.id}${mode === "forensic" ? "&mode=forensic" : ""}`}
              aria-current={active === item.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onSelect(item.id);
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {s ? (
                <span className="v2-rail-status" data-tone={s.tone}>
                  {s.text}
                </span>
              ) : null}
            </a>
          </span>
        );
      })}
    </nav>
  );
}

function BarItem({ label, children, optional, rank }: { label: string; children: ReactNode; optional?: boolean; rank?: number }) {
  return (
    <div className="v2-bar-item" data-optional={optional ? "" : undefined} data-rank={rank}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function CommandBar({ mode, onMode, actor }: { mode: Mode; onMode: (m: Mode) => void; actor?: string }) {
  const ops = useOps();
  const { state, seek } = useIncident();
  const [confirm, setConfirm] = useState(false);
  const stage = displayStage(state.stage, ops.incident?.state);
  const [word, kind] = stage ? STAGE_LABEL[stage] : ["CONNECTING", "pending" as const];
  const services = criticalServices(state.nodes, ops);
  const down = services.filter((s) => s.down).length;
  const outstanding = ops.outstandingRoles;
  return (
    <header className="v2-bar" aria-label="Incident">
      <Link href="/mission" aria-label="HALT Mission Control" style={{ display: "inline-flex", flexShrink: 0 }}>
        <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={104} height={30} priority unoptimized />
      </Link>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, maxWidth: 300 }}>
        <span className="v2-id">Incident {state.incidentId}</span>
        <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ops.incident?.title ?? "Connecting to the HALT API"}</span>
      </div>
      <span aria-live="polite" style={{ flexShrink: 0 }}>
        <StatusChip kind={kind}>{word}</StatusChip>
      </span>
      <div className="v2-bar-status">
        {ops.incident ? <BarItem label="Severity">{ops.incident.severity}</BarItem> : null}
        {services.length ? (
          <BarItem label="Critical services">
            <span className={down ? "v2-threat-text" : "v2-continuity-text"}>{down ? `${down} of ${services.length} stopped by plan` : `${services.length} of ${services.length} running`}</span>
          </BarItem>
        ) : null}
        <BarItem label="Elapsed" optional>
          <span className="v2-id" style={{ color: "var(--v2-text)" }}>
            {replayTime(state.cursor)} {state.playing ? "· playing" : ""}
          </span>
        </BarItem>
        {policyTitle(ops) ? (
          <BarItem label="Policy" optional>
            {policyTitle(ops)}
          </BarItem>
        ) : null}
        {ops.plan?.status === "optimal" && outstanding !== null ? (
          <BarItem label="Approvals" optional rank={3}>
            {outstanding.length ? `${outstanding.length} pending` : "recorded"}
          </BarItem>
        ) : null}
        {actor ? (
          <BarItem label="Operator · demo identity" optional rank={3}>
            {actor}
          </BarItem>
        ) : null}
      </div>
      <div className="v2-bar-controls">
        <SimulatedChip simulated={state.simulated} />
        <div role="group" aria-label="Mode" style={{ display: "flex", border: "var(--border-hairline) solid var(--v2-border-strong)", borderRadius: "var(--v2-radius-m)" }}>
          {(["command", "forensic"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="halt-btn halt-btn-ghost"
              aria-pressed={mode === m}
              onClick={() => onMode(m)}
              style={{ background: mode === m ? "var(--v2-command)" : "transparent", border: "none", minHeight: 36, padding: "0 12px", fontSize: 13 }}
            >
              {m === "command" ? "Command" : "Forensic"}
            </button>
          ))}
        </div>
        <Link className="halt-btn halt-btn-ghost" href={`/incidents/${state.incidentId}/theatre`} title="Presentation mode" style={{ minHeight: 36 }}>
          <Icon name="theatre" size={18} />
          <span className="v2-bar-label">Theatre</span>
        </Link>
        <button type="button" className="halt-btn halt-btn-ghost" onClick={() => setConfirm(true)} title="Reset to the seed" style={{ minHeight: 36 }}>
          <Icon name="reset" size={18} />
          <span className="v2-bar-label">Reset</span>
        </button>
      </div>
      {confirm ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--scrim)", zIndex: "var(--z-dialog)", display: "grid", placeItems: "center" }}>
          <Dialog
            title={`Reset ${state.incidentId} to its seed?`}
            kicker="Demo control"
            onClose={() => setConfirm(false)}
            footer={
              <div className="v2-btn-row">
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  KEEP THE INCIDENT
                </Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    setConfirm(false);
                    await ops.reset("baseline");
                    seek(0);
                  }}
                >
                  RESET TO SEED
                </Button>
              </div>
            }
          >
            <p className="v2-body">
              The baseline scenario restarts from the first event: no plan, no proof, no approvals. The audit log is append-only, so its history is kept and the reset is recorded. Plans and proofs derived afterwards are identical to a fresh start.
            </p>
          </Dialog>
        </div>
      ) : null}
    </header>
  );
}

const SPEEDS: Speed[] = [1, 4, 16];

/** The incident's ten stages: six replayed events on the scrubber, four response milestones after it. */
export function StageTrack() {
  const ops = useOps();
  const { state, seek, play, pause } = useIncident();
  const all = useAllEvents(state.incidentId);
  const end = ops.incident?.replay_end_s ?? 0;
  const list = stages(state, ops, all);
  const replay = list.slice(0, all.length);
  const response = list.slice(all.length);
  const current = list.find((s) => s.status === "active");
  return (
    <footer className="v2-track" aria-label="Incident replay">
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          className="halt-btn"
          onClick={() => (state.playing ? pause() : play(state.speed))}
          aria-label={state.playing ? "Pause replay" : "Play replay"}
          style={{ minHeight: 40, minWidth: 40, padding: 0, justifyContent: "center", borderRadius: 999 }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            {state.playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /> : <path d="M4 2.5 13 8l-9 5.5z" fill="currentColor" />}
          </svg>
        </button>
        <div role="group" aria-label="Replay speed" style={{ display: "flex" }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="halt-btn halt-btn-ghost"
              aria-pressed={s === state.speed}
              onClick={() => play(s)}
              style={{ minHeight: 32, padding: "0 8px", fontSize: 12.5, fontFamily: "var(--font-mono)", color: s === state.speed ? "var(--v2-text)" : "var(--v2-text-2)", textDecoration: s === state.speed ? "underline" : "none", textUnderlineOffset: 4 }}
            >
              {`${s}×`}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: "var(--space-5)", alignItems: "center", minWidth: 0 }}>
        <div style={{ position: "relative", minWidth: 0, paddingTop: 16 }}>
          <ol aria-label="Incident stages" style={{ listStyle: "none", margin: 0, padding: 0, position: "absolute", left: 0, right: 0, top: 0, height: 16 }}>
            {replay.map((s) => (
              <li
                key={s.n}
                title={`${s.n}. ${s.label} (${s.detail})`}
                className="v2-meta"
                style={{ position: "absolute", left: `${end ? ((s.t ?? 0) / end) * 100 : 0}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 11.5, color: s.status === "done" ? "var(--v2-text)" : "var(--v2-text-2)" }}
              >
                <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, marginRight: 4, background: s.status === "done" ? "var(--v2-text)" : "transparent", border: "1px solid var(--v2-text-2)" }} />
                <span className="v2-stage-num">{s.n}</span>
                <span className="sr-only">{`. ${s.label}, ${s.status === "done" ? "observed" : "not yet"}`}</span>
              </li>
            ))}
          </ol>
          <input
            type="range"
            min={0}
            max={end}
            step={1}
            value={Math.min(state.cursor, end)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Replay position"
            aria-valuetext={replayTime(state.cursor)}
            className="v2-scrubber"
            style={{ width: "100%", minHeight: 28, accentColor: "var(--v2-text)" }}
          />
        </div>
        <ol aria-label="Response stages" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: "var(--space-3)", alignItems: "center", minWidth: 0, overflow: "hidden" }}>
          {response.map((s) => (
            <li key={s.n} title={s.detail ?? s.label} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 12.5, color: s.status === "pending" ? "var(--v2-text-2)" : "var(--v2-text)" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0 }}>
                {s.status === "done" ? (
                  <>
                    <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--v2-proof-ring)" strokeWidth="2" />
                    <circle cx="7" cy="7" r="2" fill="var(--v2-proof-core)" />
                  </>
                ) : (
                  <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={s.status === "active" ? undefined : "2 2"} />
                )}
              </svg>
              <span style={{ whiteSpace: "nowrap" }}>{s.short ?? s.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div style={{ textAlign: "right", minWidth: 128 }}>
        <div className="v2-id" data-testid="replay-clock" style={{ color: "var(--v2-text)", fontSize: 15 }}>{replayTime(state.cursor)}</div>
        <div className="v2-meta" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{current ? `Next: ${current.label}` : "All stages complete"}</div>
      </div>
    </footer>
  );
}

const EMPTY: Record<EvidenceSection["id"], string> = {
  evidence: "Select an entity, path or action to see the events behind it.",
  findings: "No HALT-R1 finding cites this selection.",
  confidence: "No confidence without evidence.",
  sources: "No source records referenced.",
  policy: "No policy applies to this selection.",
  explain: "Select something to explain.",
};

/** The incident's own evidence when nothing is selected: never an empty rail. */
function IncidentEvidence() {
  const ops = useOps();
  const { state } = useIncident();
  const findings = ops.findings.length ? ops.findings : Object.values(state.findings);
  const residual = ops.plan?.status === "optimal" ? ops.plan.residual : null;
  return (
    <>
      <section>
        <h3>Observed evidence</h3>
        {state.events.length ? (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {state.events.map((e) => (
              <li key={e.id} style={{ marginBottom: 6 }}>
                {(e.kind as string).replaceAll("_", " ")} <span className="v2-id">{e.id} · {e.source.system}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="v2-body">The replay has not delivered an event yet.</p>
        )}
      </section>
      <section>
        <h3>HALT-R1 findings</h3>
        {findings.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {findings.map((f) => (
              <li key={f.id} style={{ marginBottom: 6 }}>
                {f.title} <span className="v2-id">{f.evidence_ids.join(", ")} · {f.score.derivation.numerator} of {f.score.derivation.denominator} conditions</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="v2-body">No finding yet: findings arrive as the replay correlates events.</p>
        )}
      </section>
      {residual ? (
        <section>
          <h3>Uncertainty</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--v2-text-2)" }}>
            {residual.uncertainty.map((u) => (
              <li key={u} style={{ marginBottom: 6 }}>
                {u}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="v2-meta">Select any entity, path, action or claim to inspect its own evidence.</p>
    </>
  );
}

export function EvidenceDrawer({ sections, subject }: { sections: EvidenceSection[]; subject: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className="v2-drawer" aria-label="Evidence" data-open={open} tabIndex={0}>
      <div className="v2-drawer-head">
        <button
          type="button"
          className="halt-btn halt-btn-ghost"
          aria-expanded={open}
          aria-label={open ? "Hide evidence" : "Show evidence"}
          onClick={() => setOpen(!open)}
          style={{ minHeight: 32, padding: "0 8px" }}
        >
          {open ? "›" : "‹"}
        </button>
        {open ? (
          <div style={{ minWidth: 0 }}>
            <div className="v2-kicker">Evidence</div>
            <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject ?? "This incident"}</div>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="v2-drawer-body">
          {subject ? (
            sections.map((s) => (
              <section key={s.id} aria-labelledby={`ev-${s.id}`}>
                <h3 id={`ev-${s.id}`}>{s.title}</h3>
                <div>{s.content ?? <span style={{ color: "var(--v2-text-2)" }}>{EMPTY[s.id]}</span>}</div>
              </section>
            ))
          ) : (
            <IncidentEvidence />
          )}
        </div>
      ) : null}
    </aside>
  );
}

export function StageLabel({ stage }: { stage: Stage }) {
  return <span>{`${stage.n}. ${stage.label}`}</span>;
}

export function CommandShell({
  view,
  onView,
  mode,
  onMode,
  actor,
  evidence,
  subject,
  children,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  actor?: string;
  evidence: EvidenceSection[];
  subject: string | null;
  children: ReactNode;
}) {
  return (
    <div className="v2-cc" data-mode={mode}>
      <CommandBar mode={mode} onMode={onMode} actor={actor} />
      <NavRail active={view} onSelect={onView} mode={mode} />
      <main className="v2-main" id="workspace" tabIndex={0} aria-label="Workspace" data-mode={mode}>
        {children}
      </main>
      <EvidenceDrawer sections={evidence} subject={subject} />
      <StageTrack />
    </div>
  );
}
