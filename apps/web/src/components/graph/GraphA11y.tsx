import type { AttackPath, GraphNode } from "@/lib/api/types";
import { count } from "@/lib/format";

/** Text equivalent of the graph: the path table and a live summary of the graph state. */
export function GraphA11y({
  paths,
  nodes,
  blocked,
  summary,
  onFocus,
  focusPath,
}: {
  paths: AttackPath[];
  nodes: Record<string, GraphNode>;
  blocked: Set<string>;
  summary: string;
  onFocus?: (id: string | null) => void;
  focusPath?: string | null;
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
                <td style={{ paddingLeft: "var(--space-3)" }}>
                  {!p.high_risk ? "Below threshold · uncertain" : blocked.has(p.id) ? "Cut" : "Open"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
