import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QualityCaseView } from "@/components/firex/QualityCaseView";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Quality Case · HALT" };

export default async function QualityCasePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^frun-[0-9a-f]{16}$/.test(runId)) notFound();
  return (
    <PlatformShell>
      <QualityCaseView runId={runId} />
    </PlatformShell>
  );
}
