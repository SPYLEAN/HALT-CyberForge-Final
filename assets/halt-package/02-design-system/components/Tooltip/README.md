# Tooltip

A tooltip explains one number or term on hover and keyboard focus, using a derivation or an ID, never information the user needs to proceed.

Wrap exactly one focusable child and provide `content` and an optional `title` (mono label above it). The tooltip is a `role="tooltip"` linked with `aria-describedby`, appears above the target on `surface-raised` with the `elevation-2` ring, and fades in over `duration-fast`. `open` forces it visible for documentation only.

Put every likelihood derivation ("4,912 of 6,000 rollouts") in a tooltip or beside the figure, never only in a tooltip on touch devices: below `bp-md` show the derivation inline.
