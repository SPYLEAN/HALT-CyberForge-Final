import { Suspense } from "react";

import { Skeleton } from "@/components/halt";
import { CommandCenter } from "@/components/views/CommandCenter";

export default async function CommandCenterPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  return (
    <Suspense fallback={<Skeleton variant="graph" label="Loading the Command Center" />}>
      <CommandCenter incidentId={incidentId} />
    </Suspense>
  );
}
