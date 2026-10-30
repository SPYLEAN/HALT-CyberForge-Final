"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";

import type { Execution, Finding, GraphEdge, GraphNode, SecurityEvent, ServerMessage } from "@/lib/api/types";
import { ReplaySocket, type SocketStatus } from "@/lib/api/ws";

export const VIEWS = ["overview", "graph", "echolab", "safecut", "proofseal", "timeline", "policies", "report"] as const;
export type ViewId = (typeof VIEWS)[number];
export type Stage = Extract<ServerMessage, { type: "stage" }>["state"];
export type Speed = 1 | 4 | 16;

/** Shared by the landing page and the Command Center so the incident never resets between them. */
export interface IncidentState {
  incidentId: string;
  connection: SocketStatus;
  /** Times the replay socket came back after a drop; data that may be stale is refetched on each. */
  reconnects: number;
  cursor: number;
  playing: boolean;
  speed: Speed;
  lastSeq: number;
  stage: Stage | null;
  simulated: boolean;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  events: SecurityEvent[];
  findings: Record<string, Finding>;
  execution: Execution | null;
  stale: string | null;
  view: ViewId;
  selection: string | null;
}

export type IncidentAction =
  | { type: "server"; message: ServerMessage }
  | { type: "seek"; t: number }
  | { type: "connection"; status: SocketStatus }
  | { type: "reconnected" }
  | { type: "view"; view: ViewId }
  | { type: "select"; id: string | null }
  | { type: "simulated"; value: boolean };

export function initialState(incidentId: string, view: ViewId = "overview", cursor = 0): IncidentState {
  return {
    incidentId,
    connection: "idle",
    reconnects: 0,
    cursor,
    playing: false,
    speed: 1,
    lastSeq: -1,
    stage: null,
    simulated: true, // demo mode; cleared only if an API response says otherwise
    nodes: {},
    edges: {},
    events: [],
    findings: {},
    execution: null,
    stale: null,
    view,
    selection: null,
  };
}

function applyMessage(state: IncidentState, m: ServerMessage): IncidentState {
  const next = { ...state, lastSeq: Math.max(state.lastSeq, m.seq) };
  switch (m.type) {
    case "clock":
      return { ...next, cursor: m.t, playing: m.playing, speed: m.speed };
    case "event":
      if (state.events.some((e) => e.id === m.event.id)) {
        return { ...next, cursor: Math.max(next.cursor, m.t), events: state.events.map((e) => (e.id === m.event.id ? m.event : e)) };
      }
      return { ...next, cursor: Math.max(next.cursor, m.t), events: [...state.events, m.event] };
    case "graph_delta":
      return {
        ...next,
        nodes: { ...state.nodes, ...Object.fromEntries(m.add_nodes.map((n) => [n.id, n])) },
        edges: { ...state.edges, ...Object.fromEntries(m.add_edges.map((e) => [e.id, e])) },
      };
    case "finding":
      return { ...next, findings: { ...state.findings, [m.finding.id]: m.finding } };
    case "stage":
      return { ...next, stage: m.state };
    case "gate":
      return { ...next, execution: m.execution };
    case "stale":
      return { ...next, stale: m.reason };
  }
}

export function incidentReducer(state: IncidentState, action: IncidentAction): IncidentState {
  switch (action.type) {
    case "server":
      return applyMessage(state, action.message);
    case "seek":
      // The server replays everything up to t after a seek, so replay-derived state starts empty.
      return { ...state, cursor: action.t, playing: false, nodes: {}, edges: {}, events: [], findings: {}, stage: null };
    case "connection":
      return { ...state, connection: action.status };
    case "reconnected":
      return { ...state, reconnects: state.reconnects + 1 };
    case "view":
      return { ...state, view: action.view };
    case "select":
      return { ...state, selection: action.id };
    case "simulated":
      return { ...state, simulated: action.value };
  }
}

interface IncidentApi {
  state: IncidentState;
  dispatch: (action: IncidentAction) => void;
  seek: (t: number) => void;
  play: (speed?: Speed) => void;
  pause: () => void;
  setView: (view: ViewId) => void;
  select: (id: string | null) => void;
}

const IncidentContext = createContext<IncidentApi | null>(null);

export interface IncidentProviderProps {
  incidentId: string;
  children: ReactNode;
  /** Open the replay WebSocket (false in unit tests). */
  connect?: boolean;
  initial?: Partial<IncidentState>;
}

export function IncidentProvider({ incidentId, children, connect = true, initial }: IncidentProviderProps) {
  const [state, dispatch] = useReducer(incidentReducer, undefined, () => ({ ...initialState(incidentId), ...initial }));
  const socket = useRef<ReplaySocket | null>(null);
  const cursor = useRef(state.cursor);
  useEffect(() => {
    cursor.current = state.cursor;
  }, [state.cursor]);

  useEffect(() => {
    if (!connect || typeof WebSocket === "undefined") return;
    const s = new ReplaySocket(incidentId, {
      onMessage: (message) => dispatch({ type: "server", message }),
      onStatus: (status) => dispatch({ type: "connection", status }),
      // The server starts a new connection at t = 0: seek back to where this client was.
      onReconnect: () => {
        dispatch({ type: "seek", t: cursor.current });
        s.send({ type: "seek", t: cursor.current });
        dispatch({ type: "reconnected" });
      },
    });
    socket.current = s;
    s.connect();
    s.send({ type: "subscribe" });
    return () => s.close();
  }, [connect, incidentId]);

  const seek = useCallback((t: number) => {
    dispatch({ type: "seek", t });
    socket.current?.send({ type: "seek", t });
  }, []);
  const play = useCallback((speed: Speed = 1) => socket.current?.send({ type: "play", speed }), []);
  const pause = useCallback(() => socket.current?.send({ type: "pause", speed: 1 }), []);
  const setView = useCallback((view: ViewId) => dispatch({ type: "view", view }), []);
  const select = useCallback((id: string | null) => dispatch({ type: "select", id }), []);

  const value = useMemo(() => ({ state, dispatch, seek, play, pause, setView, select }), [state, seek, play, pause, setView, select]);
  return <IncidentContext.Provider value={value}>{children}</IncidentContext.Provider>;
}

export function useIncident(): IncidentApi {
  const ctx = useContext(IncidentContext);
  if (!ctx) throw new Error("useIncident must be used inside <IncidentProvider>");
  return ctx;
}
