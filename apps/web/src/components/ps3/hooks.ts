"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useSyncExternalStore } from "react";

import { parseQuery, toSearch, type Atlas, type AtlasQuery } from "@/lib/ps3/atlas";
import { loadFixtures, type Fixtures } from "@/lib/ps3/engine";
import { initialState, reduceAtlas, type AtlasAction, type AtlasStoreState, type HistoryMode, type Patch } from "@/lib/ps3/store";

export interface AtlasStore {
  fx: Fixtures;
  q: AtlasQuery;
  atlas: Atlas;
  focus: AtlasStoreState["focus"];
  /** Patches apply to the latest state. Selections push history (Back restores them); scrubbing replaces. */
  set: (patch: Patch, mode?: HistoryMode, opts?: { focus?: boolean }) => void;
}

/**
 * Read a URL into state. A URL that names a stage but no payload position (a shared link, an older URL) gets the
 * same synchronisation as a selection: the payload moves to that stage, so status and evidence agree.
 */
export function loadFromSearch(fx: Fixtures, search: string, base?: AtlasStoreState): AtlasStoreState {
  const raw = new URLSearchParams(search);
  const q = parseQuery(raw, fx);
  let s = base ? reduceAtlas(fx, base, { type: "load", q }) : initialState(fx, q);
  if (q.node && !raw.has("t")) {
    const sync: AtlasAction = { type: "patch", patch: { node: q.node, ...(raw.has("panel") ? { panel: q.panel } : {}) }, mode: "none" };
    s = reduceAtlas(fx, s, sync);
  }
  return s;
}

let fixtures: Fixtures | null = null;
export const useFixtures = () => (fixtures ??= loadFixtures());

/**
 * The Atlas state: a reducer (so rapid input never reads a stale value), mirrored to the URL with the History API
 * (shareable, restorable, Back/Forward work) and reloaded from it on popstate.
 */
export function useUrlAtlas(basePath = "/atlas"): AtlasStore {
  const fx = useFixtures();
  const params = useSearchParams();
  const [s, dispatch] = useReducer(
    (st: AtlasStoreState, a: AtlasAction | { type: "url"; search: string }) => (a.type === "url" ? loadFromSearch(fx, a.search, st) : reduceAtlas(fx, st, a)),
    undefined,
    () => loadFromSearch(fx, params.toString()),
  );

  useEffect(() => {
    if (s.mode === "none") return;
    const search = toSearch(s.q, fx);
    if (window.location.search === search || (!search && !window.location.search)) return;
    const url = `${basePath}${search}`;
    if (s.mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, [s, fx, basePath]);

  useEffect(() => {
    const onPop = () => dispatch({ type: "url", search: window.location.search });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fx]);

  const set = useCallback((patch: Patch, mode: HistoryMode = "push", opts?: { focus?: boolean }) => dispatch({ type: "patch", patch, mode, focus: opts?.focus }), []);
  return { fx, q: s.q, atlas: s.atlas, focus: s.focus, set };
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
/** Below 960 px the Atlas becomes a guided pipeline; the full scene is never shrunk onto a phone. */
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
