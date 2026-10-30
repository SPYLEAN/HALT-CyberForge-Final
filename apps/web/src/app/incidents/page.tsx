import type { Metadata } from "next";

import { IncidentRooms } from "@/components/v2/platform/IncidentRooms";
import { PlatformShell } from "@/components/v2/platform/PlatformShell";

export const metadata: Metadata = { title: "Incident Rooms · HALT" };

export default function IncidentRoomsPage() {
  return (
    <PlatformShell>
      <IncidentRooms />
    </PlatformShell>
  );
}
