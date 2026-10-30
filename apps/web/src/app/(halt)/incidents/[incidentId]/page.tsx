import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/halt";
import { CommandCenter } from "@/components/views/CommandCenter";

export default async function CommandCenterPage({ params }: { params: Promise<{ incidentId: string }> }) {
  // The demo serves one incident; its providers live in the root layout so a hand-off keeps state.
  const { incidentId } = await params;
  if (incidentId !== "INC-2417") notFound();
  return (
    <Suspense fallback={<Skeleton variant="graph" label="Loading the Command Center" />}>
      <CommandCenter />
    </Suspense>
  );
}
