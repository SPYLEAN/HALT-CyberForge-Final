import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunView } from "@/components/firex/RunView";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Analysis Run · HALT" };

export default async function FirexRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^frun-[0-9a-f]{16}$/.test(runId)) notFound();
  return (
    <PlatformShell>
      <RunView runId={runId} />
    </PlatformShell>
  );
}
