# MetricBlock

A metric block shows one counted number with the derivation that produced it, because HALT never shows a bare risk score.

Provide `label`, `value` (a count, a ratio like "0 of 6", or a likelihood with its N), `derivation` (required: what was counted, over what, from which snapshot) and, for demonstration data, `simulated`. `tone` is `threat` only for hostile counts, `business` only for business-continuity counts, and omitted otherwise. The value uses `data-value`, the derivation uses `telemetry`.

Do not pass a unitless severity such as "87" or a gauge. If a number has no derivation, it does not belong on the screen.
