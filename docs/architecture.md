# Architecture

Agent Memory is a local-first TypeScript CLI backed by SQLite. Its main responsibility is to make project memory auditable and useful to coding agents without requiring external services.

## Runtime Shape

```text
agentmem CLI
  -> src/cli/main.ts
  -> src/core/* use cases
  -> src/db/* SQLite repository
  -> .agent-memory/memory.db
```

Project initialization creates local state under `.agent-memory/`:

- `config.json`
- `memory.db`

`agentmem init` uses the Git root when run inside a repository and adds `.agent-memory/` to `.git/info/exclude`. It does not modify `.gitignore`.

## Source Layout

- `src/cli/`: argument parsing, command dispatch, and terminal rendering.
- `src/core/`: use cases such as project init, memory creation, retrieval, packet generation, sessions, events, candidates, update, forget, and preflight.
- `src/db/`: SQLite schema and repository mapping.
- `src/domain/`: shared types, allowed enum values, defaults, guards, and validators.
- `src/formatters/`: markdown and text output.

Keep CLI routing thin. Core behavior belongs in `src/core/`; persistent record shape and validation belong in `src/domain/` and `src/db/`.

## Storage Model

SQLite is the source of truth. Current tables include:

- `projects`
- `memories`
- `events`
- `memory_links`
- `schema_meta`
- `sessions`
- `protocol_receipts`
- `memory_candidates`

Durable memory records include:

- type, scope, status, confidence, source, severity
- content and optional summary
- paths and tags
- pinned, priority, use count, retrieval timestamps, injection timestamps
- expiry, related IDs, supersession, and conflict group
- safety flags and redaction status
- metadata JSON

The database is local project state. Do not delete or rewrite user memory by default. Schema changes should be additive and migration-safe.

## Retrieval Pipeline

Retrieval is deterministic and local. It does not require embeddings or network calls.

Current steps:

1. Load project config and memories.
2. Apply shared agent-visible eligibility.
3. Exclude archived, rejected, superseded, blocked/redacted, expired, secret-flagged, and do-not-include records.
4. Respect config for stale and unverified records.
5. Exclude memories superseded by another memory.
6. Score by type priority, severity, confidence, priority, active status, and pinned status.
7. Add relevance signals from task tokens, paths, tags, and command policy matching.
8. Add recency and use-count boosts.
9. Boost failed attempts, known fixes, agent mistakes, and rejected approaches when relevant.
10. Resolve conflict groups by keeping the highest-scoring grouped memory.
11. Attach retrieval metadata with score, signals, and reason.
12. Record retrieval events and update retrieval timestamps/use count.

This is a basic hybrid scorer, not semantic contradiction detection. Conflict handling is metadata-driven through `conflictGroup` and supersession fields.

## Packet Format

`agentmem inject` and `agentmem pack` return an `agent-memory.packet.v1` JSON shape when `--json` is used:

```json
{
  "schemaVersion": "agent-memory.packet.v1",
  "project": "agent-memory",
  "task": "fix failing CLI tests",
  "generatedAt": "2026-06-27T00:00:00.000Z",
  "scope": "project",
  "safety": "Secrets are blocked from trusted writes and blocked/redacted memories are not injected.",
  "sections": [],
  "markdown": "# Project Memory Pack...",
  "matchedMemoryIds": [],
  "sessionId": "ses_optional"
}
```

Sections group memories by type and include IDs, content, reason, score, paths, tags, confidence, and source.

Markdown output is compact and intended for direct agent context injection. It includes memory IDs and retrieval reasons so the agent can cite or audit why a memory appeared.

## Review Model

Memory has two write paths:

- Trusted CLI writes such as `add`, `decision`, `failed`, and `policy`.
- Untrusted candidate proposals through `candidate propose`.

Candidates require evidence and remain untrusted until approved. Evidence can be human-readable text, linked evidence event IDs, or both. Linked event IDs preserve provenance to recorded command results, test results, user corrections, or reusable observations from the session. Approval creates active memory. Rejection preserves the candidate for audit but prevents injection.

This review model is deliberate: agents can observe and propose, but they should not silently create durable trusted memory from their own guesses.

## Safety Model

- Obvious secrets are rejected in trusted memory writes and candidate proposals.
- Blocked/redacted memories are excluded from packets.
- Preflight uses the same agent-visible eligibility gate as retrieval before matching command policies.
- `.agent-memory/` should remain local and uncommitted.
- `forget` archives memory instead of deleting it.
- Hard command blocking is not a dependency of the current CLI; preflight returns decisions for agents to obey.

## Deferred Architecture

These are outside the current V1 branch unless a future plan explicitly adds them:

- hosted service or sync
- vector database
- default LLM reranking
- MCP server
- dashboard or TUI
- hard command proxy
- cross-repo/global memory database
