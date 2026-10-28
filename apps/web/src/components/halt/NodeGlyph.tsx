import type { ReactNode, SVGProps } from "react";

export type NodeKind =
  | "user"
  | "device"
  | "session"
  | "token"
  | "application"
  | "api"
  | "service"
  | "database"
  | "process"
  | "attacker";
export type NodeState = "observed" | "forecast" | "inferred" | "held" | "verified";

type Attrs = SVGProps<SVGElement> & { stroke: string; strokeWidth: number; strokeDasharray?: string };

// Ten silhouettes on a 32 grid (3-graph.md). Shape says what a node is; outline says what is known.
export const NODE: Record<NodeKind, [string, (a: Attrs) => ReactNode]> = {
  user: ["User", (a) => <circle cx={16} cy={16} r={10} {...(a as SVGProps<SVGCircleElement>)} />],
  device: ["Device", (a) => <rect x={6} y={6} width={20} height={20} rx={2} {...(a as SVGProps<SVGRectElement>)} />],
  session: ["Session", (a) => <rect x={2.5} y={10} width={27} height={12} rx={6} {...(a as SVGProps<SVGRectElement>)} />],
  token: ["Token", (a) => <polygon points="16,3 29,16 16,29 3,16" {...(a as SVGProps<SVGPolygonElement>)} />],
  application: ["Application", (a) => <polygon points="9,6 23,6 30,16 23,26 9,26 2,16" {...(a as SVGProps<SVGPolygonElement>)} />],
  api: ["API", (a) => <polygon points="3,7 20,7 30,16 20,25 3,25" {...(a as SVGProps<SVGPolygonElement>)} />],
  service: ["Service", (a) => <path d="M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9z" {...(a as SVGProps<SVGPathElement>)} />],
  database: [
    "Database",
    (a) => (
      <g>
        <path d="M5 8a11 4 0 0 1 22 0v16a11 4 0 0 1 -22 0z" {...(a as SVGProps<SVGPathElement>)} />
        <path d="M5 8a11 4 0 0 0 22 0" fill="none" stroke={a.stroke} strokeWidth={a.strokeWidth} />
      </g>
    ),
  ],
  process: [
    "Business process",
    (a) => (
      <g>
        <rect x={2.5} y={6} width={27} height={20} rx={2} {...(a as SVGProps<SVGRectElement>)} />
        <rect x={2.5} y={21} width={27} height={5} fill="var(--business)" />
      </g>
    ),
  ],
  attacker: [
    "Attacker-controlled",
    (a) => {
      const solid = !a.strokeDasharray && a.stroke === "var(--text)";
      return (
        <polygon
          points="3,5 29,5 16,28"
          strokeLinejoin="miter"
          {...(a as SVGProps<SVGPolygonElement>)}
          fill={solid ? "var(--threat-observed)" : "var(--bg)"}
          stroke={a.stroke === "var(--threat-held)" ? "var(--threat-held)" : "var(--threat-observed)"}
        />
      );
    },
  ],
};

export interface NodeGlyphProps {
  kind: NodeKind;
  state?: NodeState;
  size?: number;
  label?: string;
  caption?: boolean | string;
}

export function nodeAttrs(state: NodeState): Attrs {
  const a: Attrs = { fill: "var(--bg)", stroke: "var(--text)", strokeWidth: 2.5, strokeLinejoin: "round" };
  if (state === "forecast") a.strokeDasharray = "3.5 3.5";
  if (state === "held") a.stroke = "var(--threat-held)";
  if (state === "inferred") Object.assign(a, { stroke: "var(--neutral-evidence)", strokeDasharray: "6 4", strokeWidth: 2 });
  return a;
}

export function NodeGlyph({ kind, state = "observed", size = 32, label, caption }: NodeGlyphProps) {
  const [name, draw] = NODE[kind];
  const svg = (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`${label ?? name} node, ${state}`} style={{ display: "block", flex: "none" }}>
      {draw(nodeAttrs(state))}
      {state === "verified" ? (
        <g>
          <circle cx={26} cy={26} r={5.5} fill="var(--bg)" stroke="var(--proof-ring)" strokeWidth={2} />
          <circle cx={26} cy={26} r={1.8} fill="var(--proof-core)" />
        </g>
      ) : null}
    </svg>
  );
  if (!caption) return svg;
  return (
    <figure style={{ margin: 0, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {svg}
      <figcaption className="label" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".09em", textAlign: "center" }}>
        {caption === true ? name : caption}
      </figcaption>
    </figure>
  );
}
