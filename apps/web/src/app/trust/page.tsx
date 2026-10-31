import type { Metadata } from "next";

import { TrustIndex } from "@/components/firex/TrustCentre";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Trust Centre · HALT" };

export default function TrustPage() {
  return (
    <PlatformShell>
      <TrustIndex />
    </PlatformShell>
  );
}
