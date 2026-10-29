import Image from "next/image";

import { StatusChip } from "@/components/halt";
import type { Stage } from "@/lib/state/incident-store";

import { SimulatedChip } from "./SimulatedChip";
import { STAGE_LABEL } from "./stages";

export interface TopBarProps {
  incidentId: string;
  title?: string;
  stage: Stage | null;
  simulated: boolean;
  actor?: string;
}

export function TopBar({ incidentId, title, stage, simulated, actor }: TopBarProps) {
  const [word, kind] = stage ? STAGE_LABEL[stage] : ["CONNECTING", "pending" as const];
  return (
    <header className="cc-top" aria-label="Incident">
      {/* Primary horizontal lockup, Bone on Ink, at least 100px wide (brand rule). */}
      <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={112} height={32} priority unoptimized />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span className="label">Incident {incidentId}</span>
        {title ? (
          <span className="body" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title}
          </span>
        ) : null}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <span aria-live="polite">
          <StatusChip kind={kind}>{word}</StatusChip>
        </span>
        <SimulatedChip simulated={simulated} />
        {actor ? (
          <span className="label" title="Demo identity: the X-Halt-Actor header, not authentication">
            Operator · {actor} · demo identity
          </span>
        ) : null}
      </div>
    </header>
  );
}
