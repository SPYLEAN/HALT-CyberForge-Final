# PS2 final screenshots

> **Synthetic data only.** Real output of the production web build (`next build` + `next start`) against a real
> API process (`halt.ps2.engine/1.0.1`), captured by Playwright on 2026-10-31. Nothing was edited, composited or
> retouched, and no value was typed into a screenshot.

| File | What it shows | Viewport |
|---|---|---|
| `01-desktop-intake-1440x900.png` | `/reconstruct` with the two bundled synthetic datasets | 1440×900 |
| `02-scenario-a-graph-1440x900.png` | Scenario A after the browser flow (ingest, reconstruct), `run-d84008bb2c753cac` | 1440×900 |
| `03-evidence-inspector-1440x900.png` | Edge evidence for the one inferred hop (mail → sign-in, 52.9%) | 1440×900 |
| `04-attack-panel-1440x900.png` | ATT&CK tab: technique, basis and supporting event for each step | 1440×900 |
| `05-scenario-b-ambiguity-1440x900.png` | Scenario B Hypotheses: "Ambiguous … 0.0036" | 1440×900 |
| `06-phone-path-390x844.png` | Phone layout, Path step: the ordered path with observed and inferred hops (full page) | 390×844 |
| `07-phone-evidence-390x844.png` | Phone layout, Evidence step after tapping a path event (full page) | 390×844 |
| `08-unavailable-api-stopped-1440x900.png` | The API process was stopped: "Reconstruction service unavailable", with no figures | 1440×900 |
| `09-restored-after-restart-1440x900.png` | A new API process with empty memory; **Try again** restores scenario B. Proof shows the same receipt | 1440×900 |

**Restart check (asserted during capture):** the receipt `rcpt-fc074914a6b6250b`, the graph hash
`06ca64de…e4164f` and the replay id `250332fc…77808f` were identical before the API process stopped and after a
new one started. The full receipt was also identical, apart from `processing_ms`.

For live demos see `docs/PS2_OPERATOR_CARD.md`. Regression screenshots from the E2E suite live in
`artifacts/ps2-workspace/`.
