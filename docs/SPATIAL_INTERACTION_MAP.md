# Spatial interaction map

Every 3D interaction has a DOM equivalent. The DOM is the source of truth for selection; the scene reflects it.

| Intent | 3D | DOM equivalent | URL |
|---|---|---|---|
| Select a stage / source / destination | click the object | object list button; 2D flow node (minimap or fallback) | `node=` |
| Open a panel | — | drawer tabs | `panel=` |
| Focus camera | double-click, or "Focus" | "Focus" button | — |
| Whole atlas | "Home" | "Home" button | — |
| Step the payload | — | timeline slider, ← → keys in the timeline, Play/Pause | `t=` |
| Follow payload | "Payload follow" toggle | same toggle (no-op without WebGL) | — |
| Choose the record | — | record selector in Payload Flight | `record=` |
| Trigger drift | — | scenario buttons in Drift Shockwave | `drift=` |
| Apply repair draft | — | "Apply draft as v+1 (dry run)" | `repair=1` |
| Approve activation | — | Activation Gate button (named approver) | — (session only, A-5) |
| Switch connector | — | connector selector in the top bar | `connector=` |

## Keyboard

- Object list: a `listbox`-free plain list of buttons; Tab moves through it, Enter/Space selects.
  `[` and `]` (when focus is in the Atlas) select the previous/next stage along the pipeline.
- Timeline: native range input (← → by one step); Space toggles play when the play button has focus.
- The canvas is not a focus trap: it has `tabIndex=-1`; all controls are outside it.
- Theatre: ← → / PageUp PageDown / Space move steps; Esc exits.

## Selection synchronisation

`selection` lives in one store (`useAtlas`), mirrored to the URL with `router.replace` (no history spam) and
read back on load and on `popstate`. The 3D scene, object list and 2D flow subscribe to it; none of them
owns selection.

## Theatre script (12 steps)

| # | Step | State it sets (and requires) |
|---|---|---|
| 1 | An unsupported tool appears | connector = northwind; no plan shown (zones dark) |
| 2 | Its API configuration is imported | Source Lens on the source; config JSON shown |
| 3 | HALT compiles a connector plan | plan stages listed; compile result (0 errors) |
| 4 | The Atlas materialises the path | all stages shown, idle |
| 5 | A dry-run payload begins | t = 0, flight panel |
| 6 | Authentication and pagination | t at `acq.paginate`; retry history visible |
| 7 | The Mapping Chamber normalises the event | t at `xf.normalize`; mapping panel |
| 8 | A schema change: Drift Shockwave | drift = rename detected_at |
| 9 | HALT identifies affected mappings | drift panel, affected list |
| 10 | A reviewed correction restores delivery | repair draft applied as a new draft version; re-run delivered |
| 11 | Proof Corridor verifies provenance | proof panel on the delivered record |
| 12 | Activation Gate requests approval | gate panel; nothing approved for the presenter |

A step is derived state, not a timer: the presentation never advances on its own.
