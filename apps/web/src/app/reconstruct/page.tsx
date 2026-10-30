import type { Metadata } from "next";

import { Intake } from "@/components/ps2/Intake";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Reconstruct · HALT" };

export default function ReconstructPage() {
  return (
    <PlatformShell>
      <Intake />
    </PlatformShell>
  );
}
