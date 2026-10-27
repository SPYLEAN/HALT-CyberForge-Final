# StatusChip

A status chip says what state a thing is in with a glyph and a word together, so no state is told apart by colour alone.

Provide `kind`: `observed` (solid square), `forecast` (dashed ring), `blocked` (broken line), `preserved` (thick line), `verified` (proof ring), `success` (check, APPLIED), `caution` (triangle, dashed border, no new hue), `pending`, `simulated` (hatch, dotted border), `neutral` (inferred, dashed line). The default word can be replaced with `children`; keep it to three words or fewer and uppercase.

Use `preserved` only for business operations, `observed`, `forecast` and `blocked` only for hostile paths, and `verified` only where ProofSeal checked a claim. Show `simulated` beside every forecast figure and in the top bar while demonstration data is on.
