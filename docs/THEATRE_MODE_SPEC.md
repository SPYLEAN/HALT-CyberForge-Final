# Theatre mode

Full-screen presentation at `/theatre/[caseId]`, built from a **case manifest** produced by the API from stored files. There are no
authored figures in Theatre and no recorded video.

## Case manifest

`POST /api/v1/ps2/cases` with a run id and either an incident id or the quality subject. The manifest holds: run id, subject, status,
ordered chapters, evidence references, camera targets, verified metrics, proof references and deterministic presenter notes.
Same inputs give the same case id and bytes. Manifests live in `results/firex-cases/` and never change a run or incident.

## Chapters

Incident: Situation, Entry point, Attack progression, Evidence, Uncertainty, Reachable next, Verification, Closing result.

Quality: 19.62 GB received (from the source size), Every byte accounted for, Valid and invalid regions separated, Timestamp collapse
discovered, Temporal reconstruction withheld, Why zero incidents does not mean zero threats, Receipt sealed, Analyst handoff.

A partial reconstruction has its own eight chapters, built from stored values: bytes received, records processed,
duplicates removed, records with usable ordering, records with collapsed time, unconfirmed incidents reconstructed, proof
receipts verified, and analyst review required. It draws a region map, not an Attack World, because it describes the
whole source. Its hand-off is the Trust Centre.

## Controls

Right and Left arrows change chapter, Space plays or pauses autoplay, Escape leaves, F toggles full screen, N toggles presenter notes.
All have visible buttons. Chapter progress is a list. Status stays on screen throughout.

## Scene

Incident chapters drive the same Attack World by camera targets. Quality chapters drive a byte map drawn from real proportions. No
attack graph is ever drawn for a quality case.

## Reduced motion and offline

Reduced motion disables autoplay and camera easing. Theatre needs only the local API. With the LLM disabled, all notes are templates.
