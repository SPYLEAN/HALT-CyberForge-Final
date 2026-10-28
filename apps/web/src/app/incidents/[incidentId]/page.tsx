"use client";

import { Skeleton } from "@/components/halt";
import { CommandCenterShell } from "@/components/shell/CommandCenterShell";
import { RAIL_ITEMS } from "@/components/shell/AppRail";
import { useIncident } from "@/lib/state/incident-store";

// Phase 7 shell. The seven system views arrive in Phase 8; until then the workspace shows a loading
// state in forecast language, never placeholder numbers.
const T0 = "2026-10-27T09:41:12Z";
const REPLAY_END = 666;

export default function CommandCenterPage() {
  const { state } = useIncident();
  const view = RAIL_ITEMS.find((item) => item.id === state.view);
  return (
    <CommandCenterShell
      t0={T0}
      end={REPLAY_END}
      evidence={[
        { id: "evidence", title: "Observed evidence", content: null },
        { id: "findings", title: "Model findings", content: null },
        { id: "confidence", title: "Confidence", content: null },
        { id: "sources", title: "Source event IDs", content: null },
        { id: "policy", title: "Policy requirements", content: null },
      ]}
    >
      <h1 className="product-title">{view?.label}</h1>
      <Skeleton variant="graph" label={`${view?.label} view is not built yet`} />
    </CommandCenterShell>
  );
}
