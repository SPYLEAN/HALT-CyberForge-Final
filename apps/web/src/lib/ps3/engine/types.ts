// PS3 client contracts (docs/PS3_DATA_CONTRACTS.md). Contract-isolated: nothing here touches the HALT API.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type Zone = "source" | "acquisition" | "transformation" | "validation" | "destination";
export const ZONES: Zone[] = ["source", "acquisition", "transformation", "validation", "destination"];

export type MappingOp = "rename" | "lowercase" | "epoch_ms" | "enum" | "default" | "drop";
export type OcsfTarget = "ocsf.detection_finding" | "ocsf.authentication";

export interface MappingRule {
  id: string;
  from?: string;
  to?: string;
  op: MappingOp;
  required?: boolean;
  map?: Record<string, number>;
  value?: Json;
}

export interface Destination {
  id: string;
  kind: "api" | "queue" | "store";
  title: string;
  requires: string[];
}

export interface ConnectorConfig {
  schema: "halt.connector/v0";
  id: string;
  version: string;
  title: string;
  source: {
    id: string;
    kind: "rest_api" | "webhook";
    vendor: string;
    endpoint: string;
    auth: { type: "oauth2_client_credentials" | "api_key_header" | "hmac_signature"; secret_ref: string; scopes?: string[] };
    pagination: { type: "cursor" | "none"; cursor_param?: string; cursor_field?: string; page_size?: number };
    rate_limit: { requests_per_minute: number };
    retry: { max_attempts: number; backoff: "exponential"; base_ms: number };
    records_field: string;
  };
  mapping: { version: string; target: OcsfTarget; rules: MappingRule[] };
  validation: {
    required: string[];
    types: Record<string, "integer" | "string">;
    dedupe_key: string;
    policies: { id: string; title: string; rule: "no_field"; field: string }[];
  };
  destinations: Destination[];
}

export interface Exchange {
  seq: number;
  at: string;
  request: { method: string; url: string; headers: Record<string, string>; body?: Json };
  response: { status: number; headers: Record<string, string>; body: Json };
}

export interface Recording {
  connector_id: string;
  captured_at: string;
  exchanges: Exchange[];
}

export interface DriftScenario {
  id: string;
  connector_id: string;
  title: string;
  op: "rename" | "remove";
  field: string;
  to?: string;
}

export interface Approver {
  id: string;
  name: string;
  role: string;
  title: string;
}

export type StageKind =
  | "source.fetch"
  | "acq.auth"
  | "acq.paginate"
  | "acq.retry"
  | "xf.map"
  | "xf.normalize"
  | "val.schema"
  | "val.policy"
  | "val.dedupe"
  | "dst.deliver";

export interface Stage {
  id: string; // unique within a plan, e.g. "xf.map" or "dst.case-api"
  zone: Zone;
  kind: StageKind;
  title: string;
  destination?: Destination;
}

export interface CompileError {
  where: string;
  message: string;
}

export interface Plan {
  connector: ConnectorConfig;
  config_hash: string;
  mapping_hash: string;
  stages: Stage[];
  errors: CompileError[];
}

export type StepStatus = "ok" | "failed" | "skipped" | "duplicate";

export interface Step {
  stage_id: string;
  status: StepStatus;
  before: Json;
  after: Json;
  evidence: string[];
  hash: string;
}

export type RuleStatus = "renamed" | "converted" | "defaulted" | "dropped" | "invalid" | "unmapped-required" | "missing-optional";

export interface RuleResult {
  rule: MappingRule;
  status: RuleStatus;
  input: Json | undefined;
  output: Json | undefined;
}

export interface RecordTrace {
  source_id: string;
  page: number;
  steps: Step[];
  rules: RuleResult[];
  outcome: "delivered" | "partial" | "rejected" | "duplicate";
  ignored_fields: string[];
}

export interface RetryEvent {
  seq: number;
  at: string;
  status: number;
  retry_after_s: number | null;
  then: number | null; // seq of the retried request
}

export interface PageEvent {
  seq: number;
  at: string;
  cursor_in: string | null;
  cursor_out: string | null;
  records: number;
}

export interface Trace {
  plan: Plan;
  captured_at: string;
  auth: { ok: boolean; evidence: string[]; at: string | null };
  pages: PageEvent[];
  retries: RetryEvent[];
  records: RecordTrace[];
  digest: string;
}
