# ConstraintIndicator

A constraint indicator states one hard rule of a response (block every path, keep the business running, stay under the disruption cap) and whether the proposed response meets it.

Provide `name`, `rule` (the exact measured condition), `value` as a count ("0 of 6 open"), `state` (`met`, `binding` when exactly at the limit, `violated`) and optionally `fill` and `limit` (both 0 to 1) for the bar. State is carried by a glyph and a word, then colour: `met` is Verdigris ring and check, `binding` is a Bone ring and bar, `violated` is an Ember triangle.

Violated is reserved for a response that would harm the business or leave a path open. Never use it for a low score or a warning about data quality; use a `caution` StatusChip for that.
