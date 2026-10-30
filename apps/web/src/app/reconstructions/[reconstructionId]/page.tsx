import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Workspace } from "@/components/ps2/Workspace";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";
import { RUN_ID } from "@/lib/ps2/api";

export const metadata: Metadata = { title: "Reconstruction · HALT" };

export default async function ReconstructionPage({ params }: { params: Promise<{ reconstructionId: string }> }) {
  const { reconstructionId } = await params;
  if (!RUN_ID.test(reconstructionId)) notFound();
  return (
    <PlatformShell>
      <Workspace runId={reconstructionId} />
    </PlatformShell>
  );
}
