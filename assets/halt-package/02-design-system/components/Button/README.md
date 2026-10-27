# Button

Every HALT action is a 44px, 4px-radius, mono-label button, and there is exactly one `primary` per view: the Bone fill that means "this is the decision".

Provide a verb-first uppercase label, an optional `trailing` glyph (`→` to advance, `↺` for rollback) and `variant`: `primary`, `secondary` (default), `quiet` for reversals and secondary paths, `ghost` for cancel, `done` for a recorded approval. Do not build an Ember button: Ember is hostile only, and a destructive-looking button would hide that every HALT action is reversible.

A disabled `primary` must carry `reason`, shown beneath it in `telemetry` type ("Disabled until both approvals are recorded."). Never disable silently. Focus is the `focus-ring` token, never removed.

Critical actions (execute, roll back) are not triggered by Button alone: place them behind ApprovalControl so no code path runs without a recorded human approval.
