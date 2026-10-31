import { notFound, redirect } from "next/navigation";

/** Theatre now plays a case manifest, and Case Builder on the run page creates one. */
export default async function FirexTheatrePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^frun-[0-9a-f]{16}$/.test(runId)) notFound();
  redirect(`/firex/runs/${runId}`);
}
