"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { clampQuery, deriveAtlas, parseQuery, toSearch, type Atlas, type AtlasQuery } from "@/lib/ps3/atlas";
import { loadFixtures, type Fixtures } from "@/lib/ps3/engine";

export interface AtlasStore {
  fx: Fixtures;
  q: AtlasQuery;
  atlas: Atlas;
  /** Selection, panel and drift changes push history (Back restores them); scrubbing replaces. */
  set: (patch: Partial<AtlasQuery>, mode?: "push" | "replace") => void;
}

let fixtures: Fixtures | null = null;
export const useFixtures = () => (fixtures ??= loadFixtures());

/** Derive the next query, clamped against the state it produces. */
export function nextQuery(fx: Fixtures, q: AtlasQuery, atlas: Atlas, patch: Partial<AtlasQuery>): AtlasQuery {
  const merged = { ...q, ...patch };
  if (patch.connector && patch.connector !== q.connector) Object.assign(merged, { drift: patch.drift ?? null, repair: false, node: patch.node ?? null, t: 0, record: 0 });
  if (patch.drift !== undefined && patch.drift !== q.drift) Object.assign(merged, { repair: patch.repair ?? false, t: patch.t ?? 0 });
  const changes = merged.connector !== q.connector || merged.drift !== q.drift || merged.repair !== q.repair;
  return clampQuery(merged, changes ? deriveAtlas(fx, merged) : atlas);
}

/** The Atlas state held in the URL: shareable, restorable, and the browser's Back button works. */
export function useUrlAtlas(basePath = "/atlas"): AtlasStore {
  const fx = useFixtures();
  const params = useSearchParams();
  const router = useRouter();
  const search = params.toString();
  const q = useMemo(() => parseQuery(new URLSearchParams(search), fx), [search, fx]);
  const atlas = useMemo(() => deriveAtlas(fx, q), [fx, q]);
  const set = useCallback(
    (patch: Partial<AtlasQuery>, mode: "push" | "replace" = "push") => {
      const next = nextQuery(fx, q, atlas, patch);
      router[mode](`${basePath}${toSearch(next, fx)}`, { scroll: false });
    },
    [fx, q, atlas, router, basePath],
  );
  return { fx, q, atlas, set };
}

function useMedia(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    () => window.matchMedia?.(query).matches ?? fallback,
    () => fallback,
  );
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)", false);
/** Below 960 px the Atlas becomes a guided tour; the full scene is never shrunk onto a phone. */
export const useCompact = () => useMedia("(max-width: 959px)", false);

let webgl: boolean | null = null;
export function detectWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}
/** null while rendering on the server: the page shell and the 2D flow render first. */
export const useWebGL = (): boolean | null =>
  useSyncExternalStore(
    () => () => undefined,
    () => detectWebGL(),
    () => null,
  );
