# PS3 acceptance tests

IDs are referenced in test names. U = Vitest unit, E = Playwright E2E.

| ID | Requirement | Test |
|---|---|---|
| PS3-1 | The compiler accepts the fixture connectors and rejects invalid configs with a stated reason | U `ps3-engine` |
| PS3-2 | Dry run is deterministic: two runs give the same trace digest; hashes match SHA-256 of canonical JSON | U `ps3-engine` |
| PS3-3 | Recorded 429 produces exactly one retry in the history; pagination follows the cursor to the end | U `ps3-engine` |
| PS3-4 | Duplicate records are marked `duplicate`, not delivered twice | U `ps3-engine` |
| PS3-5 | Drift "rename detected_at" fails `val.schema` for every record, breaks all destinations, proposes the rename repair; applying it restores delivery | U `ps3-drift` |
| PS3-6 | Drift "remove host.name" breaks only the Case API; no repair is proposed and the reason is stated | U `ps3-drift` |
| PS3-7 | Scene model is deterministic and maps statuses (passed/active/failed/drift/receded) from the trace | U `ps3-scene` |
| PS3-8 | URL state round-trips (connector, node, panel, t, record, drift) | U `ps3-url`, E `atlas` |
| PS3-9 | Selecting in the object list selects in the 2D flow and vice versa | U `ps3-atlas` |
| PS3-10 | WebGL unavailable → 2D flow, every panel still works | U `ps3-atlas`, E `atlas` |
| PS3-11 | Reduced motion → camera transitions immediate, no flight animation | U `ps3-scene` |
| PS3-12 | No secret: the fixture canary never appears in the DOM or the URL | U `ps3-atlas`, E `atlas` |
| PS3-13 | No invented metrics: every count in the receipt equals the engine's count | U `ps3-engine` |
| PS3-14 | Keyboard: `]`/`[` move selection along the pipeline; Tab reaches every control; canvas does not trap focus | E `atlas` |
| PS3-15 | Mobile (< 960 px) shows the guided tour and "View complete 2D flow"; no horizontal overflow at 390 px | E `atlas` |
| PS3-16 | Theatre: 12 steps on the keys; never advances on its own | E `atlas` |
| PS3-17 | axe: no serious/critical violations on `/atlas` (each panel) and `/atlas/theatre` | E `atlas` |
| PS3-18 | Loading, empty (no connector), and compile-error states render with reasons | U `ps3-atlas` |
| PS3-19 | Activation stays blocked while a drift is unrepaired or a destination rejects; approval is labelled SIMULATED | U `ps3-atlas` |
| PS3-20 | Existing suites unchanged and passing; production build succeeds | `npm run check`, `npm run test:e2e` |
