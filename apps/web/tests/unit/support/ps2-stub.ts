// Replays PS2 API responses recorded from the real backend (services/api/scripts/record_ps2_fixtures.py).
import { vi } from "vitest";

import recorded from "../../fixtures/api/ps2.json";

type Hit = { status: number; body: unknown };
export const responses = recorded.responses as Record<string, Hit>;
export const runs = recorded.runs as Record<"scenario-a" | "scenario-b" | "upload", string>;
export const partialUpload = recorded.uploads.partial;

/** Same canonical form as the recorder: sorted keys, compact separators. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export const calls: string[] = [];

/** Stub fetch with the recorded responses. Unknown requests fail loudly instead of inventing data. */
export function replayPs2Recording(): void {
  calls.length = 0;
  vi.stubGlobal("fetch", async (input: Request | string) => {
    const request = typeof input === "string" ? new Request(input) : input;
    const url = new URL(request.url);
    let key = `${request.method} ${url.pathname}${url.search}`;
    if (request.method === "POST") key += ` ${canonical(JSON.parse(await request.text()))}`;
    calls.push(key);
    const hit = responses[key];
    if (!hit) return new Response(JSON.stringify({ code: "not_recorded", message: key, request_id: "test" }), { status: 599 });
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "content-type": "application/json" } });
  });
}

export function ps2ApiDown(): void {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
}

export function body<T>(key: string): T {
  const hit = responses[key];
  if (!hit) throw new Error(`not recorded: ${key}`);
  return hit.body as T;
}

export const runPath = (id: string, part = "") => `GET /api/v1/ps2/reconstructions/${id}${part}`;
