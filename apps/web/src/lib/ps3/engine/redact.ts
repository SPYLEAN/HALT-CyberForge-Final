// Secrets never reach the interface (A-6): recorded exchanges are redacted before anything reads them.
import type { Exchange, Json, Recording } from "./types";

export const REDACTED = "[redacted]";
const SECRET_HEADERS = new Set(["authorization", "proxy-authorization", "x-api-key", "x-signature", "cookie", "set-cookie"]);
const SECRET_KEY = /(^|_)(secret|password|access_token|refresh_token|id_token|api_key|apikey|client_secret)$/i;

export function redactJson(value: Json | undefined): Json {
  if (value === undefined || value === null || typeof value !== "object") return value ?? null;
  if (Array.isArray(value)) return value.map(redactJson);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? REDACTED : redactJson(v)]));
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SECRET_HEADERS.has(k.toLowerCase()) ? REDACTED : v]));
}

export function redactExchange(x: Exchange): Exchange {
  return {
    ...x,
    request: { ...x.request, headers: redactHeaders(x.request.headers), body: x.request.body === undefined ? undefined : redactJson(x.request.body) },
    response: { ...x.response, headers: redactHeaders(x.response.headers), body: redactJson(x.response.body) },
  };
}

export function redactRecording(r: Recording): Recording {
  return { ...r, exchanges: r.exchanges.map(redactExchange) };
}
