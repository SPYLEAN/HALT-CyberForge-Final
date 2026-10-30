// PS3 engine entry point: fixtures (redacted at load) and the pure pipeline functions.
import connectorsJson from "../fixtures/connectors.json";
import exchangesJson from "../fixtures/exchanges.json";

import { redactRecording } from "./redact";
import type { Approver, ConnectorConfig, DriftScenario, Recording } from "./types";

export * from "./compile";
export * from "./drift";
export * from "./hash";
export * from "./receipt";
export * from "./redact";
export * from "./run";
export * from "./types";

export interface Fixtures {
  connectors: ConnectorConfig[];
  recordings: Recording[];
  drift: DriftScenario[];
  approvers: Approver[];
}

/** The synthetic fixtures. Recordings are redacted here, before any caller can read them. */
export function loadFixtures(): Fixtures {
  return {
    connectors: connectorsJson.connectors as unknown as ConnectorConfig[],
    recordings: (exchangesJson.recordings as unknown as Recording[]).map(redactRecording),
    drift: connectorsJson.drift as unknown as DriftScenario[],
    approvers: connectorsJson.approvers as unknown as Approver[],
  };
}
