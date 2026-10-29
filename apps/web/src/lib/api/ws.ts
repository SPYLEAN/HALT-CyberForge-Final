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
  /** Called when the socket reconnects after a drop (not on the first open). */
  onReconnect?: () => void;
}

/** Close codes after which reconnecting cannot help: rejected command, unknown incident. */
const FINAL_CLOSE = new Set([1003, 4404]);
export const RETRY_BASE_MS = 500;
export const RETRY_MAX_MS = 8000;

/**
 * Thin wrapper over the browser WebSocket for /ws/incidents/{id}. If the connection drops (an API restart,
 * a database outage answered with 1013, a network blip) it reconnects with exponential backoff and then
 * calls onReconnect, so the caller can seek again: the server starts every connection at t = 0.
 */
export class ReplaySocket {
  private socket: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private stopped = false;
  private opened = false;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly incidentId: string,
    private readonly handlers: ReplaySocketHandlers,
    private readonly origin: string = env.NEXT_PUBLIC_WS_ORIGIN,
  ) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  private open(): void {
    this.retry = null;
    this.handlers.onStatus("connecting");
    const socket = new WebSocket(`${this.origin}/ws/incidents/${encodeURIComponent(this.incidentId)}`);
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus("open");
      if (this.opened) {
        // A new server-side connection: commands queued while down are stale; the caller seeks again instead.
        this.queue = [];
        this.handlers.onReconnect?.();
      } else {
        for (const message of this.queue.splice(0)) socket.send(JSON.stringify(message));
      }
      this.opened = true;
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.handlers.onStatus("closed");
      if (!this.stopped && !FINAL_CLOSE.has(event.code)) {
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.attempts++);
        this.retry = setTimeout(() => this.open(), delay);
      }
    };
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
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
