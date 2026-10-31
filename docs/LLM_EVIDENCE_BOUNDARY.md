# LLM evidence boundary

The product works fully with the LLM disabled, which is the default.

```
HALT_LLM_PROVIDER=disabled|groq|xai
HALT_LLM_BASE_URL=          # optional override
HALT_LLM_MODEL=             # required when a provider is enabled
GROQ_API_KEY=               # read from the environment by the API only
XAI_API_KEY=
```

## Allowed

Explaining an incident, executive and analyst summaries, explaining uncertainty, drafting a report, and
answering a question from the evidence bundle.

## Not allowed

Reading raw logs, detecting attacks, computing risk, selecting paths, creating evidence, changing graphs,
inventing observations, or executing anything. The LLM's output is never fed back into the engine.

## Evidence bundle

Compact and size-limited: incident summary, selected path, cited canonical events, alternates, ATT&CK and
kill-chain labels, uncertainty, reachability and proof metadata. No raw lines.

## Defences against prompt injection

Log strings are untrusted:

1. System instructions are separate and say that everything in the bundle is data.
2. The bundle is serialised as JSON with control characters stripped and strings truncated.
3. Structured JSON output is required; anything else is rejected.
4. Every statement must cite evidence ids from the bundle. A statement citing no valid id is dropped and counted
   in `unsupported_claims`.
5. If nothing valid remains, or on timeout, rate limit, missing key or provider error, the deterministic Attack
   Story is returned with `fallback_used: true`.

## Caching and labelling

Results are cached by proof receipt hash + provider + model + prompt version + audience + question. The UI labels
results "AI-assisted explanation — evidence validated". Keys never reach the frontend, Git, logs, screenshots or
receipts.
