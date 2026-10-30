"use client";

import { useEffect, useState } from "react";

import { api, unwrap } from "@/lib/api/client";
import type { SecurityEvent } from "@/lib/api/types";

/** Every observed event of the incident (labels for the stage track before the replay delivers them). */
export function useAllEvents(incidentId: string): SecurityEvent[] {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  useEffect(() => {
    let live = true;
    api
      .GET("/api/v1/incidents/{incident_id}/events", { params: { path: { incident_id: incidentId } } })
      .then(unwrap)
      .then((r) => live && setEvents(r.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [incidentId]);
  return events;
}
