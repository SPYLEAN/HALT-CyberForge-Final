# Drawer

The drawer is the inspector: it holds the detail for whatever node, path, claim or action is selected, while the graph stays visible beside it.

Provide `title`, `kicker` (mono label: the object type and ID), children, optional `footer` actions and `onClose`. It is 480px (`max-drawer`) on `surface-raised` with the `elevation-2` ring, non-modal (`aria-modal="false"`), and keeps focus order intact. Use `inline` in a layout; without it the drawer is fixed to the right edge at `z-drawer`.

Do not use the drawer for approval or any action that needs a decision; that is a Dialog or the ApprovalControl on the Action Gate screen. Below `bp-md` it covers the screen as a sheet.
