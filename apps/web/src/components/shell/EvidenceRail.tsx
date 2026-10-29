import type { ReactNode } from "react";

/** Right rail: observed evidence, model findings, confidence, source event ids, policy requirements, explanation. */
export interface EvidenceSection {
  id: "evidence" | "findings" | "confidence" | "sources" | "policy" | "explain";
  title: string;
  content: ReactNode | null;
}

export const EMPTY_TEXT: Record<EvidenceSection["id"], string> = {
  evidence: "Select a node, path or action to see the events behind it.",
  findings: "No HALT-R1 findings yet for this selection.",
  confidence: "No confidence without evidence.",
  sources: "No source records referenced.",
  policy: "No policy applies to this selection.",
  explain: "Select something to explain.",
};

export function EvidenceRail({ sections, subject }: { sections: EvidenceSection[]; subject?: string | null }) {
  return (
    <aside className="cc-inspector" aria-label="Evidence" tabIndex={0}>
      <p className="label">{subject ? `Evidence · ${subject}` : "Evidence"}</p>
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`ev-${section.id}`} style={{ marginTop: "var(--space-5)" }}>
          <h3 id={`ev-${section.id}`} className="label" style={{ margin: 0 }}>
            {section.title}
          </h3>
          <div className="evidence-text" style={{ marginTop: "var(--space-2)" }}>
            {section.content ?? <span style={{ color: "var(--text-secondary)" }}>{EMPTY_TEXT[section.id]}</span>}
          </div>
        </section>
      ))}
    </aside>
  );
}
