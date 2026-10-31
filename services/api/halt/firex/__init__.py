"""FireX production pipeline: streaming ingestion, detection and incident reconstruction for FortiGate-style
key=value logs (docs/FIREX_PRODUCTION_ARCHITECTURE.md).

Deterministic throughout: no language model parses, detects, scores, links or selects anything.
"""

ENGINE_VERSION = "halt.firex.engine/1.0.0"
PARSER_VERSION = "halt.firex.parser/1.0.0"
SCHEMA_VERSION = "halt.firex.canonical/1.0"
