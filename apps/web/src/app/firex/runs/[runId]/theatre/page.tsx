import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunStory } from "@/components/firex/RunStory";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Theatre · HALT" };

export default async function FirexTheatrePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^frun-[0-9a-f]{16}$/.test(runId)) notFound();
  return (
    <PlatformShell>
      <RunStory runId={runId} theatre />
    </PlatformShell>
  );
}
