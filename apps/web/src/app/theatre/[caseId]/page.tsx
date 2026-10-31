import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TheatreView } from "@/components/firex/TheatreView";

export const metadata: Metadata = { title: "Theatre · HALT" };

export default async function TheatrePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!/^fcase-[0-9a-f]{16}$/.test(caseId)) notFound();
  return <TheatreView caseId={caseId} />;
}
