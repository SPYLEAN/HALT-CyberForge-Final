import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Theatre } from "@/components/v2/theatre/Theatre";

export const metadata: Metadata = { title: "Theatre · HALT" };

export default async function TheatrePage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  if (incidentId !== "INC-2417") notFound();
  return <Theatre />;
}
