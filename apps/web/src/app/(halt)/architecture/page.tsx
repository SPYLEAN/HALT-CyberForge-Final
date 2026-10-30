import type { Metadata } from "next";

import { Architecture } from "@/components/v2/platform/Architecture";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "System Architecture · HALT" };

export default function ArchitecturePage() {
  return (
    <PlatformShell>
      <Architecture />
    </PlatformShell>
  );
}
