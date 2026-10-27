# EvidenceRow

An evidence row is one telemetry fact, with an ID that opens its source, so every recommendation can be traced back to something that happened.

Provide `id` (EV-nn), `source`, `text` (the event, set in `evidence-text`), `time` (UTC, `telemetry`), `supports` (the claims or paths it backs) and `href` to the raw event. Render a column header row with the class `halt-ev halt-ev-head`. Pass `inferred` for relationships HALT inferred rather than observed: the square marker becomes a dashed outline and the ID keeps an INF prefix.

Never summarise two events in one row, and never show a claim without at least one linked row. The ID is a real link with an underline, 44px target through row padding.
