// Dotted-path access over plain JSON objects ("host.name").
import type { Json, JsonObject } from "./types";

export function getPath(obj: Json | undefined, path: string): Json | undefined {
  let cur: Json | undefined = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as JsonObject)[key];
  }
  return cur;
}

export function setPath(obj: JsonObject, path: string, value: Json): void {
  const keys = path.split(".");
  let cur = obj;
  keys.slice(0, -1).forEach((k) => {
    const next = cur[k];
    if (next === null || typeof next !== "object" || Array.isArray(next)) cur[k] = {};
    cur = cur[k] as JsonObject;
  });
  cur[keys[keys.length - 1]!] = value;
}

export function deletePath(obj: JsonObject, path: string): void {
  const keys = path.split(".");
  let cur: Json | undefined = obj;
  for (const k of keys.slice(0, -1)) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return;
    cur = (cur as JsonObject)[k];
  }
  if (cur && typeof cur === "object" && !Array.isArray(cur)) delete (cur as JsonObject)[keys[keys.length - 1]!];
}

/** Every leaf path in an object, in key order ("host.name", "host.ip", ...). */
export function leafPaths(obj: Json, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return prefix ? [prefix] : [];
  return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

export const clone = <T extends Json>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
