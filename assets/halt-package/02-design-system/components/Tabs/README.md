# Tabs

Tabs switch between states of the same graph or evidence set (observed, forecast, response, after cut), not between unrelated pages.

Provide `items` (`id`, `label`, optional `count`) and either uncontrolled use or `value` plus `onChange`. Labels are uppercase mono (`label` style). The selected tab is marked by a 2px `text` underline and `aria-selected`, never by colour. Arrow keys move and select; the tab list is one tab stop.

When a tab changes graph mode, the business thread must not restart or flicker: the switch uses `duration-switch` and only the hostile layer changes.
