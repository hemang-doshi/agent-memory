# Agent Memory Preflight MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI-first local project memory layer with SQLite-backed storage, task-specific memory pack generation, and command preflight warnings.

**Architecture:** Use a small TypeScript/Node application with a manual CLI, a synchronous SQLite store via `node:sqlite`, and deterministic retrieval/preflight logic implemented in core services. Keep storage, domain rules, formatting, and command dispatch separate so MCP can be added later without reworking the database or retrieval layer.

**Tech Stack:** TypeScript, Node.js 26, pnpm, Vitest, SQLite (`node:sqlite`)

---

### Task 1: Repository And Storage Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/config/project-context.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/database.ts`
- Create: `src/db/repository.ts`
- Test: `tests/init-project.test.ts`

- [x] Write the failing initialization tests first.
- [x] Create the TypeScript and Vitest project baseline.
- [x] Implement Git-aware project initialization, config generation, SQLite schema creation, and project persistence.
- [x] Verify `initProject()` creates `.agent-memory/memory.db` and `.agent-memory/config.json`.

### Task 2: Memory CRUD And Lifecycle

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/defaults.ts`
- Create: `src/core/create-memory.ts`
- Create: `src/core/list-memories.ts`
- Create: `src/core/search-memories.ts`
- Create: `src/core/mark-memory-stale.ts`
- Create: `src/core/explain-memory.ts`
- Test: `tests/memory-crud.test.ts`

- [x] Write failing CRUD and stale-memory tests first.
- [x] Implement typed memory creation, listing, search filters, stale updates, and explainability event lookup.
- [x] Persist memory create/update events for provenance.
- [x] Verify active-only filtering and stale metadata behavior.

### Task 3: Retrieval, Pack Generation, And Preflight

**Files:**
- Create: `src/core/retrieve-memories.ts`
- Create: `src/core/generate-pack.ts`
- Create: `src/core/preflight-command.ts`
- Create: `src/formatters/pack-markdown.ts`
- Test: `tests/retrieval-preflight.test.ts`

- [x] Write failing retrieval and preflight tests first.
- [x] Implement deterministic ranking using type, severity, confidence, activity, and token overlap.
- [x] Render compact markdown packs with priority sections.
- [x] Implement advisory command preflight with exact, substring, and regex policy matching.

### Task 4: CLI And Benchmarks

**Files:**
- Create: `src/cli/main.ts`
- Create: `src/formatters/output.ts`
- Create: `benchmarks/fixtures/*.json`
- Test: `tests/cli.test.ts`
- Test: `tests/benchmark-fixtures.test.ts`

- [x] Write failing CLI smoke and benchmark replay tests first.
- [x] Implement the CLI command surface for init, memory capture, pack, search, list, stale, explain, and preflight.
- [x] Add replayable benchmark fixtures for render guards, failed attempts, design continuity, and stale-memory exclusion.
- [x] Verify JSON output mode works for pack and preflight.

### Task 5: Documentation And Release Snapshot

**Files:**
- Create: `README.md`
- Create: `snapshot.md`
- Create: `diffchanges.md`

- [x] Document the command surface and repository layout.
- [x] Capture a full architecture snapshot for future agents and maintainers.
- [x] Record the current diff as a subsystem-oriented change log.
