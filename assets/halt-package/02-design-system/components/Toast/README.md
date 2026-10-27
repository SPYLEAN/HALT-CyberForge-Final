# Toast

A toast reports that something finished or changed, in one title and one sentence, and never asks for a decision.

Provide `kind` (`neutral`, `success`, `caution`, `threat`), `title` and children, plus `onDismiss`. Success uses the check glyph and Verdigris border, caution uses a triangle and dashed border, threat uses a solid Ember square and is announced as an alert. It is 400px (`max-toast`), enters over `duration-evidence`, and stays until dismissed when it reports a failure or a stale seal.

Do not auto-dismiss anything that changes what the approver should do. Do not use toasts for approvals or confirmations of irreversible actions.
