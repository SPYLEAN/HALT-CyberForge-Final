import type { Metadata } from "next";

import { MissionControl } from "@/components/v2/platform/MissionControl";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Mission Control · HALT" };

export default function MissionPage() {
  return (
    <PlatformShell>
      <MissionControl />
    </PlatformShell>
  );
}
