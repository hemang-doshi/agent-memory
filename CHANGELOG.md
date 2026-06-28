# Changelog

All notable changes to Agent Memory are documented here.

This project follows the spirit of Keep a Changelog. Version numbers should be updated only by the release owner.

## [2.0.0] — Production-Grade V2

### Added

- **Retrieval V2**: Four retrieval modes — deterministic (default), keyword (SQLite FTS5), hybrid, and vector (local hash embeddings). All modes share a single deterministic visibility gate.
- **Vector memory**: Local hash-based 64-dim embedding provider with JSON index storage and freshness tracking. No external embedding calls by default.
- **Optional reranking**: `none`/`noop`/`mock` reranker with timeout, fallback chain, and explanation receipts. Off by default.
- **MCP server**: `agentmem mcp serve` with 7 read-only resources, 18 tools, config-gated writes, no shell execution, and project isolation.
- **Agent adapters**: Idempotent install/uninstall for Codex, Claude Code, Cursor, Command Code, OpenCode, and generic agents.
- **Memory lifecycle**: `review`, `dedupe` (with `--resolve`), `merge`, `supersede`, `quality`, `purge-expired`.
- **Ingestion**: `ingest` and `ingest-log` with chunking, secret scanning, and provenance. Content becomes candidates by default.
- **Export/Import**: `agent-memory-v2-json` format with full provenance tracking.
- **Operations**: `backup`, `restore`, `repair`, `migrate status`, `migrate up` (versioned column migrations).
- **Safety**: `scan --deep` (14 secret + 4 prompt-injection patterns), `audit`, `quarantine`, `unquarantine`, trust level enforcement.
- **Proof harness**: `eval live` with 8 reproducible scenarios. Local deterministic harness, no external model invocation.
- **Production tracking**: Implementation matrix, architecture decision log, verification record, and release readiness checklist in `docs/production/`.

### Changed

- `migrate up` now runs real version-gated column migrations.
- MCP retrieval now supports all four modes including vector.
- `trust_level` column added to schema, enforced in visibility gate.
- `reranker.timeout_ms` config now consumed by reranker.
- AGENTS.md and CLAUDE.md replaced with actual Agent Memory router instructions.

### Security

- Trust levels integrated into visibility gate — `untrusted` memories excluded.
- Quarantine/unquarantine preserves audit trail.
- Expiry purge archives expired memories deterministically.
- Dedupe `--resolve` auto-merges duplicates with audit events.

## [1.0.0] - 2026-06-27

### Added

- Local-first Agent Memory CLI workflow with project initialization, managed instructions, sessions, retrieval, packet injection, command preflight, evidence events, candidate review, and receipts.
- V1 memory metadata for pinned memories, priority, use counts, retrieval/injection timestamps, expiry, supersession, conflict groups, safety flags, and redaction status.
- Deterministic retrieval scoring across task tokens, paths, tags, command policies, type priority, confidence, severity, recency, and use count.
- Structured `agent-memory.packet.v1` JSON output plus compact markdown packet output.
- `add`, `retrieve`, `inject`, `update`, `forget`, `event record`, and `eval` CLI surfaces while preserving compatibility commands such as `remember` and `pack`.
- Candidate proposal, approval, rejection, and review planning so agent-generated learning stays untrusted until reviewed.
- Release documentation, architecture notes, testing guidance, security policy, contributing guide, license, and quickstart example.

### Security

- Trusted memory writes and candidate proposals reject obvious secrets.
- Blocked, redacted, archived, rejected, and superseded memories are excluded from default injection.

## [0.1.0] - Initial local CLI baseline

### Added

- Initial local project memory CLI.
- SQLite-backed memory storage under `.agent-memory/`.
- Basic memory creation, search, packet generation, preflight, candidate review, and session receipts.
