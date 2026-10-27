# TimelineEvent

A timeline event places one thing on the incident's time axis using the same thread language as the graph: solid Ember for observed, dotted Ember for forecast, a thick Verdigris thread with a proof node for a HALT action.

Provide `time`, `kind` (`observed`, `forecast`, `action`), `title`, optional `description`, `meta` (the evidence ID or path and rollout count) and `last` on the final event to end the rail. Forecast events append "SIMULATED" automatically and must show N rollouts in `meta`.

Order is chronological and forecast events always sit after the last observed event. An `action` event is shown only after a recorded human approval.
