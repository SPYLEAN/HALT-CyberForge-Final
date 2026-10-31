import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IncidentWorkspace } from "@/components/firex/IncidentWorkspace";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Incident · HALT" };

export default async function FirexIncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ incidentId: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { incidentId } = await params;
  const { run } = await searchParams;
  if (!/^finc-[0-9a-f]{12}$/.test(incidentId)) notFound();
  const runId = run && /^frun-[0-9a-f]{16}$/.test(run) ? run : undefined;
  return (
    <PlatformShell>
      <IncidentWorkspace incidentId={incidentId} runId={runId} />
    </PlatformShell>
  );
}
