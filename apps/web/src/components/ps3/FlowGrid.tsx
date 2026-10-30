"use client";

import { ZONES } from "@/lib/ps3/engine";
import { STATUS_TEXT, ZONE_TITLES, type SceneModel, type SceneNode } from "@/lib/ps3/scene";

/**
 * The complete flow as DOM: zones in pipeline order, each connector's stages in order, shared destinations last.
 * Used when WebGL is unavailable (or still loading) and as the phone's optional "Complete flow". Every node is a
 * real button whose accessible name is exactly its visible text (stage, lane, status); nothing is shrunk.
 */
export function FlowGrid({ model, selected, onSelect }: { model: SceneModel; selected: string | null; onSelect: (id: string) => void }) {
  const lanes = [...new Set(model.nodes.map((n) => n.connector).filter((c): c is string => Boolean(c)))];
  const button = (n: SceneNode) => (
    <li key={n.id}>
      <button type="button" className="ps3-grid-node" data-node={n.id} data-status={n.status} aria-pressed={n.id === selected} onClick={() => onSelect(n.id)}>
        <span className="ps3-dot" aria-hidden />
        <span className="ps3-grid-label">{n.label}</span>{" "}
        <span className="ps3-meta">{`${STATUS_TEXT[n.status]}${n.proof ? " · proof" : ""}`}</span>
      </button>
    </li>
  );
  return (
    <div className="ps3-grid" role="group" aria-label="Complete 2D flow" data-testid="flow-2d">
      {ZONES.map((z, zi) => (
        <section key={z} className="ps3-grid-zone" aria-label={`${zi + 1}. ${ZONE_TITLES[z]}`}>
          <h3 className="ps3-kicker">{`${zi + 1} · ${ZONE_TITLES[z]}`}</h3>
          {z === "destination" ? (
            <ul className="ps3-grid-list">{model.nodes.filter((n) => n.zone === z).map(button)}</ul>
          ) : (
            lanes.map((lane) => (
              <div key={lane} className="ps3-grid-lane">
                <p className="ps3-meta">{lane}</p>
                <ul className="ps3-grid-list">{model.nodes.filter((n) => n.zone === z && n.connector === lane).map(button)}</ul>
              </div>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
