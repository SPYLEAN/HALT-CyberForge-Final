import { StatusChip } from "@/components/halt";

/** Persistent while demonstration data is on (2-layout.md). */
export function SimulatedChip({ simulated }: { simulated: boolean }) {
  if (!simulated) return null;
  return (
    <span title="All data in this incident is synthetic" data-testid="simulated-chip">
      <StatusChip kind="simulated">SIMULATED</StatusChip>
    </span>
  );
}
