# Dialog

A dialog interrupts the user for one decision that cannot be undone silently, and it states what changes and what does not before asking.

Provide `title` (a plain question), `kicker`, `children` that list the consequences as StatusChips or short sentences, and `footer` with the cancel action first (`ghost`) and the single confirming action (`primary`) last. It is `role="alertdialog"`, 560px (`max-dialog`), over `scrim`, and must trap focus and close on Escape in the consuming app. Use `inline` for layout previews.

Do not use a dialog to ask for a critical action's first approval: approvals live in ApprovalControl so approver, impact, reversibility and policy stay on the page.
