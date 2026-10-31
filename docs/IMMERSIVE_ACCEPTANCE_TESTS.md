# Immersive acceptance tests

| Id | Check | Where |
|---|---|---|
| IM-1 | 10G health: source and processing Verified, 11 incidents, overall Unconfirmed, ground truth Not measured | backend, E2E real run |
| IM-2 | 30G health: Degraded, withheld, 78.11% quarantined, latency Not applicable | backend, E2E real run |
| IM-3 | The strings "No threats found", "safe" and "0 ms" never describe a withheld run | unit |
| IM-4 | Health and manifests are generic: no run or incident id in production code | backend test |
| IM-5 | Case manifests are deterministic and leave the run's files byte-identical | backend |
| IM-6 | Quality case exists only for withheld runs, and has no graph | backend |
| IM-7 | Scene model: entity form by kind, floor placement without stage, no invented height | unit |
| IM-8 | Investigator shows only the five controls; advanced controls need Analyst | unit |
| IM-9 | Evidence Lens: node, edge and statement open it; closing returns focus | unit, E2E |
| IM-10 | World renders for web attack, fan-out, DNS and flood in real data | E2E real run |
| IM-11 | WebGL-unavailable falls back to 2D; phone gets guided steps; reduced motion has no easing | E2E |
| IM-12 | Theatre: keyboard, autoplay, notes, Escape, both case types | unit, E2E |
| IM-13 | Landing: eight scenes, no three.js loaded, handoff to `/firex`, works with no stored run | E2E |
| IM-14 | Landing figures come from the API and are labelled as recorded on that machine | unit |
| IM-15 | Previous routes do not regress | full E2E |
| IM-16 | Sealed receipts unchanged: hashes before and after | release check |

Real-run checks read stored results through a read-only API. They never touch raw datasets.
