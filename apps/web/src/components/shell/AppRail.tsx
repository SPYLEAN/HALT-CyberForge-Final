"use client";

import { Nav, type NavItem } from "@/components/halt";
import type { ViewId } from "@/lib/state/incident-store";

export const RAIL_ITEMS: Array<NavItem & { id: ViewId }> = [
  { id: "overview", label: "Incident Overview" },
  { id: "graph", label: "ThreadGraph" },
  { id: "echolab", label: "EchoLab" },
  { id: "safecut", label: "SafeCut" },
  { id: "proofseal", label: "ProofSeal" },
  { id: "timeline", label: "Timeline" },
  { id: "policies", label: "Policies" },
];

export function AppRail({ active, onSelect }: { active: ViewId; onSelect: (view: ViewId) => void }) {
  return (
    <div className="cc-rail">
      <Nav
        items={RAIL_ITEMS.map((item) => ({ ...item, href: `?view=${item.id}` }))}
        active={active}
        onSelect={(id) => onSelect(id as ViewId)}
        label="Command Center"
        height="100%"
      />
    </div>
  );
}
