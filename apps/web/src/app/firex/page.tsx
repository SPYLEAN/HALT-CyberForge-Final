import type { Metadata } from "next";

import { Datasets } from "@/components/firex/Datasets";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Log Analysis · HALT" };

export default function FirexPage() {
  return (
    <PlatformShell>
      <Datasets />
    </PlatformShell>
  );
}
