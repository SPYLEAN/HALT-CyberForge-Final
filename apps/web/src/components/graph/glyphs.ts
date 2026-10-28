// NodeGlyph rendered to SVG data URIs for Cytoscape, which cannot read CSS variables: the same
// silhouettes as the React component, with token variables replaced by the resolved theme colours.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NodeGlyph, type NodeKind, type NodeState } from "@/components/halt";
import { color, type Theme } from "@/styles/tokens";

const cache = new Map<string, string>();

export function resolveVars(svg: string, theme: Theme): string {
  return svg.replace(/var\(--([a-z0-9-]+)\)/g, (match, name: string) => (color[theme] as Record<string, string>)[name] ?? match);
}

export function glyphUri(kind: NodeKind, state: NodeState, theme: Theme = "dark"): string {
  const key = `${kind}:${state}:${theme}`;
  let uri = cache.get(key);
  if (!uri) {
    const markup = renderToStaticMarkup(createElement(NodeGlyph, { kind, state, size: 64 }))
      .replace(/ role="img"| aria-label="[^"]*"| style="[^"]*"/g, "")
      .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    uri = `data:image/svg+xml;utf8,${encodeURIComponent(resolveVars(markup, theme))}`;
    cache.set(key, uri);
  }
  return uri;
}
