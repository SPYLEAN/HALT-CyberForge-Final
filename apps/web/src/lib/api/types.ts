// Named aliases over the generated OpenAPI schema (schema.d.ts is generated: npm run gen:api).
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Meta = Schemas["Meta"];
export type Derivation = Schemas["Derivation"];
export type ApiError = Schemas["ApiError"];

export type SecurityEvent = Schemas["SecurityEvent"];
export type GraphNode = Schemas["GraphNode"];
export type GraphEdge = Schemas["GraphEdge"];
export type GraphSnapshot = Schemas["GraphSnapshot"];

export type Finding = Schemas["Finding"];
export type AttackPath = Schemas["AttackPath"];

export type ResponseAction = Schemas["ResponseAction"];
export type DisplayAction = Schemas["DisplayAction"];
export type Constraint = Schemas["Constraint"];
export type ConstraintResult = Schemas["ConstraintResult"];
export type Policy = Schemas["Policy"];
export type Approver = Schemas["Approver"];

export type SimulationRequest = Schemas["SimulationRequest"];
export type SimulationRun = Schemas["SimulationRun"];
export type Plan = Schemas["Plan"];
export type Proof = Schemas["Proof"];
export type Approval = Schemas["Approval"];
export type Execution = Schemas["Execution"];
export type AuditEntry = Schemas["AuditEntry"];

export type Incident = Schemas["Incident"];
export type IncidentSummary = Schemas["IncidentSummary"];

export type ServerMessage =
  | Schemas["ClockMessage"]
  | Schemas["EventMessage"]
  | Schemas["GraphDeltaMessage"]
  | Schemas["FindingMessage"]
  | Schemas["StageMessage"]
  | Schemas["GateMessage"]
  | Schemas["StaleMessage"];

export type ClientMessage = Schemas["PlayCommand"] | Schemas["SeekCommand"] | Schemas["SubscribeCommand"];
