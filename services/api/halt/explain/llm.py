"""Optional LLM phrasing of an explanation.

Off by default (HALT_LLM_ENABLED=false). No provider is wired into the MVP: a client implementing
`LlmClient` can be attached to app.state.llm. The model only rewords the deterministic template; its
output is rejected (422) if it cites any id that does not exist. It never scores risk or picks actions.
"""

from __future__ import annotations

from typing import Protocol


class LlmClient(Protocol):
    def complete(self, prompt: str) -> str: ...


def prompt_for(subject_id: str, template_text: str) -> str:
    return (
        "Rephrase this incident-response evidence for an analyst in two sentences. Keep every id exactly as "
        "written, add no new facts, ids, numbers or recommendations.\n"
        f"Subject: {subject_id}\nEvidence: {template_text}"
    )
