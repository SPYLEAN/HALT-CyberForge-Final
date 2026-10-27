# NodeGlyph

Each kind of thing in the graph has its own silhouette, so a node can be identified without colour or a label, even at 16px.

Provide `kind`: `user` (circle), `device` (square), `session` (capsule), `token` (diamond), `application` (hexagon), `api` (right-pointing pentagon), `service` (cross), `database` (cylinder), `process` (rectangle with a Verdigris base bar, the only node that carries business colour), `attacker` (a sharp-cornered Ember triangle, the only filled node and the only one without rounding). Provide `state`: `observed` (solid Bone outline), `forecast` (dashed outline), `inferred` (long-dashed neutral outline), `held` (Ember at 30%), `verified` (a proof ring at the lower right). `size` defaults to 32; `caption` prints the name.

An attacker-controlled entity is always an `attacker` node, whatever it impersonates. Never fill a node with Ember or Verdigris except those two, and never use a shape for two kinds.
