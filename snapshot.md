# Snapshot

## Product Snapshot

This repository contains a CLI-first MVP for a local-first agent memory layer. The tool stores project-scoped memory records in a SQLite database under `.agent-memory/`, retrieves the most relevant records for a task, and warns before commands that match known project policies.

## Code Structure

### `src/cli`

`main.ts` is the executable entrypoint. It parses positional arguments and `--flags`, maps them to core services, and renders either human-readable text or JSON.

### `src/core`

This layer owns the product behavior:

- `init-project.ts`: explicitly bootstraps config and the SQLite store, with opt-in Git initialization
- `create-memory.ts`: records typed memories
- `list-memories.ts`: lists filtered project memories
- `search-memories.ts`: keyword search with deterministic ranking
- `mark-memory-stale.ts`: lifecycle updates for stale records
- `explain-memory.ts`: returns a memory plus related event history
- `retrieve-memories.ts`: shared retrieval scorer for packs and preflight
- `generate-pack.ts`: builds compact markdown memory packs
- `preflight-command.ts`: evaluates a command against active project policies
- `context.ts`: shared loader for project context, repository access, and DB lifecycle

### `src/db`

- `schema.ts` defines the SQLite tables: `projects`, `memories`, `events`, `memory_links`, `schema_meta`, and baseline indexes
- `database.ts` opens the local SQLite database, applies schema creation, and records schema version metadata
- `repository.ts` maps between SQLite rows and typed domain records, wraps critical memory/event writes in transactions, and manages event persistence

### `src/domain`

This layer defines the stable shapes and defaults:

- memory enums and record interfaces
- retrieval and severity/confidence scoring defaults
- input guard helpers and runtime validators

### `src/formatters`

- `pack-markdown.ts` groups retrieved memories into human-readable sections
- `output.ts` renders plain-text list and preflight summaries for the CLI

### `tests`

The test suite verifies:

- project initialization and idempotency
- explicit initialization semantics and local Git exclude protection
- typed memory creation, search, staleness, and explainability
- memory pack generation and command preflight behavior
- CLI smoke execution
- replayable benchmark fixtures

## Data Flow

1. The CLI runs inside a project directory.
2. `agentmem init` creates `.agent-memory/`, config, database state, and the project record.
3. Other commands use `loadProject()` to load existing state and fail with a clear initialization error if missing.
4. Core services read or write typed records through `AgentMemoryRepository`.
5. Every memory mutation and retrieval/preflight action writes an event for provenance.
6. Packs use deterministic relevance signals before ranking boosts, and preflight ranks matching policies by strongest decision and specificity.

## Current MVP Gaps

- MCP transport is deferred
- no interactive memory edit command yet
- no automatic repo-state conflict detector
- only command preflight is implemented; file-edit preflight is still future work

## Verification Snapshot

The repository is validated by `pnpm test`, `pnpm typecheck`, and `pnpm build`.
