// What this browser tab has done in the PS2 demo, kept in memory only (a reload clears it, like the backend's
// own in-memory store). It lets browser back show an earlier ingestion instead of posting it again.
import { useSyncExternalStore } from "react";

import type { IngestionResult } from "./api";

export interface Ps2Session {
  ingestion: IngestionResult | null;
  eventsCreated: number | null; // canonical events returned by GET /ingestions/{id}/events
  sourceTypes: Record<string, number> | null; // events per source type, from the same response
  runs: Record<string, string>; // batch_id → run_id
}

const EMPTY: Ps2Session = { ingestion: null, eventsCreated: null, sourceTypes: null, runs: {} };
let state: Ps2Session = EMPTY;
const listeners = new Set<() => void>();

export const ps2Session = {
  get: () => state,
  set(update: Partial<Ps2Session>) {
    state = { ...state, ...update };
    listeners.forEach((l) => l());
  },
  reset() {
    state = EMPTY;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function usePs2Session(): Ps2Session {
  return useSyncExternalStore(ps2Session.subscribe, ps2Session.get, () => EMPTY);
}
