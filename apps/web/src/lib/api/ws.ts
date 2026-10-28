import { z } from "zod";

import { env } from "@/env";

import type { ClientMessage, ServerMessage } from "./types";

// Runtime validation of the WebSocket envelope (halt/contracts/ws.py). Payload models keep their
// generated TypeScript types; extra fields are tolerated so a newer server does not break the client.
const base = { seq: z.number().int().nonnegative(), t: z.number().nonnegative() };
const loose = z.object({}).loose();
const STAGES = [
  "new",
  "correlating",
  "forecast_ready",
  "simulating",
  "plan_available",
  "approval_pending",
  "executing",
  "contained",
  "rollback_available",
  "rolled_back",
  "blocked_by_policy",
  "no_safe_plan",
] as const;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("clock"), playing: z.boolean(), speed: z.union([z.literal(1), z.literal(4), z.literal(16)]) }),
  z.object({ ...base, type: z.literal("event"), event: loose.extend({ id: z.string(), ts: z.string(), kind: z.string() }) }),
  z.object({ ...base, type: z.literal("graph_delta"), add_nodes: z.array(loose.extend({ id: z.string() })), add_edges: z.array(loose.extend({ id: z.string() })) }),
  z.object({ ...base, type: z.literal("finding"), finding: loose.extend({ id: z.string(), evidence_ids: z.array(z.string()) }) }),
  z.object({ ...base, type: z.literal("stage"), state: z.enum(STAGES) }),
  z.object({ ...base, type: z.literal("gate"), execution: loose.extend({ id: z.string(), state: z.string() }) }),
  z.object({ ...base, type: z.literal("stale"), reason: z.string() }),
]);

export function parseServerMessage(raw: unknown): ServerMessage {
  return serverMessageSchema.parse(raw) as unknown as ServerMessage;
}

export type SocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface ReplaySocketHandlers {
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: SocketStatus) => void;
  onInvalid?: (error: unknown) => void;
}

/** Thin wrapper over the browser WebSocket for /ws/incidents/{id}. */
export class ReplaySocket {
  private socket: WebSocket | null = null;
  private queue: ClientMessage[] = [];

  constructor(
    private readonly incidentId: string,
    private readonly handlers: ReplaySocketHandlers,
    private readonly origin: string = env.NEXT_PUBLIC_WS_ORIGIN,
  ) {}

  connect(): void {
    this.handlers.onStatus("connecting");
    const socket = new WebSocket(`${this.origin}/ws/incidents/${encodeURIComponent(this.incidentId)}`);
    this.socket = socket;
    socket.onopen = () => {
      this.handlers.onStatus("open");
      for (const message of this.queue.splice(0)) socket.send(JSON.stringify(message));
    };
    socket.onclose = () => this.handlers.onStatus("closed");
    socket.onerror = () => this.handlers.onStatus("error");
    socket.onmessage = (event) => {
      try {
        this.handlers.onMessage(parseServerMessage(JSON.parse(String(event.data))));
      } catch (error) {
        this.handlers.onInvalid?.(error);
      }
    };
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else this.queue.push(message);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
