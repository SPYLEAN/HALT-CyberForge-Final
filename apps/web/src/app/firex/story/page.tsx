import type { Metadata } from "next";

import { RunStory } from "@/components/firex/RunStory";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Kill Chain Intelligence · HALT" };

export default function FirexStoryPage() {
  return (
    <PlatformShell>
      <RunStory theatre={false} />
    </PlatformShell>
  );
}
