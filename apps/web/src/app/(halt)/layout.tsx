import type { ReactNode } from "react";

import { OpsProvider } from "@/lib/api/ops";
import { IncidentProvider } from "@/lib/state/incident-store";

// The incident-response product. Shared by the landing page and the Command Center: the incident never restarts
// between them. The PS3 Connector Atlas, in (ps3), is contract-isolated and does not mount these providers.
export default function HaltLayout({ children }: { children: ReactNode }) {
  return (
    <IncidentProvider incidentId="INC-2417">
      <OpsProvider incidentId="INC-2417">{children}</OpsProvider>
    </IncidentProvider>
  );
}
