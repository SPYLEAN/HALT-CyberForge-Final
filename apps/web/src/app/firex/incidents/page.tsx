import type { Metadata } from "next";

import { FirexIncidentRooms } from "@/components/firex/FirexIncidentRooms";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Incident Rooms · HALT" };

export default function FirexIncidentRoomsPage() {
  return (
    <PlatformShell>
      <FirexIncidentRooms />
    </PlatformShell>
  );
}
