import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TrustRun } from "@/components/firex/TrustCentre";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Trust Centre · HALT" };

export default async function TrustRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^frun-[0-9a-f]{16}$/.test(runId)) notFound();
  return (
    <PlatformShell>
      <TrustRun runId={runId} />
    </PlatformShell>
  );
}
