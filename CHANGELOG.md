# Changelog

All notable changes to Agent Memory are documented here.

This project follows the spirit of Keep a Changelog. Version numbers should be updated only by the release owner.

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
