# Response Handoff

The primary flow is: Add logs → Analyse → Investigate → SourceTrace → Verify → Response Handoff → Theatre.

## Two separate things

| | Log analysis | Synthetic Response Lab |
|---|---|---|
| Source | Analysed FireX and new logs | The authored incident INC-2417 |
| Where | `/firex`, `/firex/incidents`, `/trust` | `/incidents`, `/incidents/INC-2417`, `/response-demo`, a labelled section of `/mission` |
| Response | Response Handoff: not executed | SafeCut, EchoLab, ProofSeal and Action Gate, in simulation |

The lab is unchanged and keeps its tests. Wherever it opens, it says: "Synthetic Response Lab — separate demonstration, not derived from the selected FireX run." Its global action no longer appears in the platform bar outside it, and Incident Rooms in the primary navigation now lists analysed incidents.

## The handoff

`GET /ps2/incidents/{id}/handoff?run_id=` reads only that incident's stored files. It is deterministic and uses no language model.

It shows investigation actions, missing evidence, identities and assets to validate, reachable systems to monitor, containment considerations, approval requirements and the state `NOT EXECUTED`, which is the only value the contract allows.

- A containment consideration appears only when the rule's stored evidence names the entity it concerns. It is worded for discussion, and it requires analyst confirmation and owner approval.
- An analyst's Confirmed review is shown as met for that one requirement. It starts nothing.
- There is no control that executes, simulates, approves or sends anything.

## The boundary

No backend path converts a FireX incident to the SafeCut or Action Gate contract, which needs business topology and control context these logs do not contain. The tab says so and lists what is missing. Connecting them would be new work: a converter plus that context.
