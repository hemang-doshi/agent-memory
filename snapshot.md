# Snapshot

## Product Snapshot

Agent Memory V2 is a production-grade local-first project memory system for coding agents. It stores typed, scoped memories in SQLite, retrieves relevant context through four retrieval modes, prevents risky commands through deterministic preflight, exposes a read-only-by-default MCP surface, and produces auditable protocol receipts — all local, no hosted services required.

## Code Structure

### `src/cli`

`main.ts` is the executable entrypoint. Parses positional arguments and `--flags`, maps them to core services, renders text or JSON. Supports `agentmem run -- <cmd>` for preflight-enforced command execution.

### `src/core`

Domain use cases: memory CRUD, retrieval orchestration, packet generation, protocol start/check, sessions, candidates, scan, preflight, doctor.

- `memory-visibility.ts`: Centralized visibility gate (`isAgentVisibleMemory`, `selectAgentVisibleMemories`). Used by every agent-facing surface.
- `retrieve-memories.ts`: Retrieval engine with four modes (deterministic, keyword, hybrid, vector) and optional reranking. Supports dry-run/non-mutating retrieval.
- `preflight-command.ts`: Command policy matching against visible memories.
- `context.ts`: Project loading with stable config-backed `project_id` — repo moves/clones/renames preserve memory continuity.

### `src/vector`, `src/ranking`, `src/safety`, `src/lifecycle`, `src/ingestion`, `src/ops`, `src/mcp`, `src/adapters`, `src/evals`

V2 focused modules: local vector index, optional reranker, audit/quarantine, lifecycle (dedupe/merge/supersede/review/quality/purge), file/log ingestion and import/export, backup/restore/repair/migrations, MCP server, agent adapters, and proof harness.

### `src/db`

SQLite schema (v4+), open-time column migrations, FTS5 keyword index, and typed repository access with transaction support.

### `src/domain`

Public record shapes, enums, defaults, guards, and validators.

### `src/formatters`

Pack markdown, text output, and protocol formatters.

### `tests`

32 test files, 184 tests covering unit, integration, CLI, security, retrieval, MCP, adapter, ingestion, migration, project identity, and golden/benchmark fixtures.

## Data Flow

1. CLI runs inside a project directory.
2. `agentmem init` creates `.agent-memory/`, config (with stable `project_id`), DB state.
3. Commands use `loadProject()` → repo access → typed records through `AgentMemoryRepository`.
4. Every memory mutation and retrieval/preflight action writes events for provenance.
5. `selectAgentVisibleMemories()` gates every agent-facing surface with deterministic safety rules.
6. Packs select memories by salience, group into sections, and truncate by configured budget.

## Current Limitations (honest)

- Local-hash vector is lexical embedding, not true semantic search.
- External embedding/LLM providers require explicit adapter configuration (not connected by default).
- `eval live` is a deterministic local harness over scripted scenarios — does not invoke external agents or claim universal agent behavior.
- MCP is stdio-only; no HTTP/SSE transport.
- No pagination on `listMemories()` — loads all records.
- Candidate approval does not yet require a reason document.

## Verification

```bash
pnpm typecheck   # Zero errors
pnpm test        # 32 files, 184 tests
pnpm build       # Clean dist/
pnpm cli eval --json   # 5/5 V1 checks
pnpm cli eval live --json  # 8/8 scenarios
pnpm cli benchmark run --all --json  # 4/4 fixtures
```
