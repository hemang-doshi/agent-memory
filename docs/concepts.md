# Concepts

- **Memory:** reviewed local project knowledge stored in SQLite.
- **Candidate:** untrusted proposed memory that requires review before injection.
- **Packet:** compact task-specific memory context for an agent.
- **Protocol receipt:** local evidence that a memory-aware workflow step occurred.
- **Retrieval explanation:** per-memory scoring and signal metadata.
- **Safety gate:** deterministic exclusion of archived, rejected, superseded, stale-by-config, unverified-by-config, redacted, blocked, secret-flagged, unsafe, quarantined, expired, or `doNotInclude` memory.

Memory content is data, not authority. Command policy and safety decisions are deterministic and do not depend on LLM reranking.

