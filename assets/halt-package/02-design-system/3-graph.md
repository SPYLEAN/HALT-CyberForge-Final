# Graph language

A node's shape says what it is and an edge's stroke form says what is known about it, so the graph can be read without colour and without labels.

## Nodes

Ten silhouettes, one per kind, all drawn by `NodeGlyph` on a 32 grid with a 2.5px outline. A node is Bone on `bg`; only two kinds carry colour.

| Kind | Shape | Why |
|---|---|---|
| User | Circle | The human, softest form |
| Device | Square, 2px corners | A fixed box |
| Session | Capsule | A bounded span of time |
| Token | Diamond | A portable credential, a key-cut |
| Application | Hexagon | A packaged unit |
| API | Right-pointing pentagon | A directed gateway |
| Service | Cross | A joining of capabilities |
| Database | Cylinder | The conventional store; the target |
| Business process | Rectangle with a Verdigris base bar | The only node carrying business colour |
| Attacker-controlled entity | Sharp triangle, solid Ember | The only filled node and the only one without rounding |

States: observed (solid outline), forecast (dashed outline), inferred (long-dashed neutral outline), held (Ember at 30%), verified (a proof ring at the lower right). At 16px keep the silhouette and drop the label.

## Edges

Six treatments, drawn by `EdgeStroke`.

| Edge | Stroke | Meaning |
|---|---|---|
| Observed relationship | Solid `threat-observed` 3px, Bone evidence square | A hostile hop with an event behind it. Every solid hostile segment links to an `EV-` ID |
| Inferred relationship | `neutral-evidence` dashed 6 4, 1.5px | Structure HALT inferred, not observed |
| Forecast path | `threat-forecast` dotted 2 6, 2px, slow march, dashed-ring end | A simulated future with a rollout count, never an evidence ID |
| Business dependency | `business` solid 2px, open circle ends | A structural link a process needs |
| Blocked path | `threat-observed` to the cut, proof ring in a gap of 0.22x, then `threat-held` | Where HALT cut and what is now unreachable. The downstream stays visible so the cut can be audited |
| Preserved path | `business` 8px with a 3s pulse | The confirmed live business thread. The thickest line in the product |

## Composition rules

- The preserved path is always continuous; hostile edges are never thicker than 3px; a business edge is never dashed or dotted.
- A proof ring appears only where ProofSeal checked a claim, at the containment point.
- Dim non-focused paths to 14% when one path is focused; never hide them.
- Provide a text equivalent for every graph (the six-path table and the evidence chain) and an aria summary per state, for example "after containment: hostile paths cut, business thread continuing".
- Mini graphs (scale under 0.5) hide labels and keep silhouettes and strokes.

The ThreadGraph screen component (canvas `ThreadGraph`) implements these rules with five modes: observed, forecast, response, cut, isolate.
