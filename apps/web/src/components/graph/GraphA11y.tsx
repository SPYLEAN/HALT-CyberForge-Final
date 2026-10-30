import type { AttackPath, GraphNode, Plan } from "@/lib/api/types";
import { count } from "@/lib/format";

/** What a path is, in words: its risk class and what its route rests on. All from the path itself. */
export function pathBasis(p: AttackPath, threshold: number | undefined): string {
  const level = p.high_risk ? "High-risk" : `Below the ${threshold ?? "high-risk"} threshold (risk ${p.risk.toFixed(2)})`;
  return p.uncertain ? `${level} · rests on an inferred edge` : level;
}

/** Where a path stands under the current plan and its policy profile. */
export function pathStatus(p: AttackPath, blocked: Set<string>, plan: Plan | null, policyTitle: string | undefined): string {
  if (blocked.has(p.id)) return "Cut";
  const residual = plan?.status === "optimal" ? plan.residual : null;
  if (!residual) return "Open";
  if (residual.open_path_ids.includes(p.id)) return `Open · accepted residual under ${policyTitle ?? plan?.profile_id}`;
  return "Cut planned (not applied)";
}

/** Text equivalent of the graph: the path table and a live summary of the graph state. */
export function GraphA11y({
  paths,
  nodes,
  blocked,
  summary,
  onFocus,
  focusPath,
  plan = null,
  policyTitle,
  threshold,
}: {
  paths: AttackPath[];
  nodes: Record<string, GraphNode>;
  blocked: Set<string>;
  summary: string;
  onFocus?: (id: string | null) => void;
  focusPath?: string | null;
  plan?: Plan | null;
  policyTitle?: string;
  threshold?: number;
}) {
  const label = (id: string) => nodes[id]?.label ?? id;
  return (
    <section aria-label="Attack paths as text" style={{ marginTop: "var(--space-4)" }}>
      <p aria-live="polite" className="evidence-text" data-testid="graph-summary">
        {summary}
      </p>
      {paths.length ? (
        <table className="evidence-text" style={{ width: "100%", borderCollapse: "collapse", marginTop: "var(--space-3)" }}>
          <caption className="label" style={{ textAlign: "left", paddingBottom: "var(--space-2)" }}>
            Paths to the finance ledger · reach counts are SIMULATED
          </caption>
          <thead>
            <tr className="label">
              <th scope="col" style={{ textAlign: "left" }}>Path</th>
              <th scope="col" style={{ textAlign: "left" }}>Route</th>
              <th scope="col" style={{ textAlign: "right" }}>Rollouts reaching target</th>
              <th scope="col" style={{ textAlign: "left", paddingLeft: "var(--space-3)" }}>Class</th>
              <th scope="col" style={{ textAlign: "left", paddingLeft: "var(--space-3)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {paths.map((p) => (
              <tr key={p.id} style={{ borderTop: "var(--border-hairline) solid var(--line)" }}>
                <th scope="row" style={{ textAlign: "left", padding: "var(--space-2) 0" }}>
                  {onFocus ? (
                    <button
                      type="button"
                      className="halt-btn halt-btn-ghost"
                      aria-pressed={focusPath === p.id}
                      onClick={() => onFocus(focusPath === p.id ? null : p.id)}
                    >
                      {p.id}
                    </button>
                  ) : (
                    p.id
                  )}
                </th>
                <td>{p.node_ids.map(label).join(" → ")}</td>
                <td className="telemetry" style={{ textAlign: "right" }}>
                  {count(p.reach)}
                </td>
                <td style={{ paddingLeft: "var(--space-3)" }}>{pathBasis(p, threshold)}</td>
                <td style={{ paddingLeft: "var(--space-3)" }}>{pathStatus(p, blocked, plan, policyTitle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
