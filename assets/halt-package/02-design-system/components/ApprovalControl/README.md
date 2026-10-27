# ApprovalControl

An approval control is where a named human accepts responsibility for a critical action, and it always shows the three things HALT owes the approver: impact, reversibility and authorisation.

Provide `name`, `role`, `policy`, `authorises` (the action IDs this person signs off), `impact` (counts), `reversibility` (rollback plan ID and time), `authorisation` (the policy), `state` (`pending`, `approved`, `held`), `at` (UTC time of approval) and `onApprove`. The control is a real toggle button (`aria-pressed`), 44px high; an approved control turns its border Verdigris and cannot be undone from here.

Execute (a Button) stays disabled until every required ApprovalControl is `approved`. Never auto-approve, never pre-check, never move approval into a toast or an inline link.
