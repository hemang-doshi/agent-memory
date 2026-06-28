# Retrieval V2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the V1.1 retrieval foundation slice from the production-grade PRD: keyword indexing, retrieval modes, retrieval explanations, and index health.

**Architecture:** Keep deterministic retrieval as the default and safety baseline. Add a local SQLite FTS-backed keyword index that can be rebuilt from existing memory rows and queried through a small repository/core surface. Hybrid retrieval is deterministic plus keyword results, deduped by memory ID; vector and LLM reranking remain unsupported and must fail clearly.

**Tech Stack:** TypeScript, Node `node:sqlite`, Vitest, existing `pnpm cli` CLI runner.

---

## Scope

Implement only the V1.1 roadmap slice:

- `agentmem index`
- `agentmem index --rebuild`
- `agentmem retrieve "<task>" --mode deterministic|keyword|hybrid`
- `agentmem retrieve "<task>" --explain`
- `agentmem explain-retrieval "<task>"`
- `agentmem doctor --index`

Do not implement vector retrieval, embeddings, LLM reranking, MCP, adapters, lifecycle commands, import/ingestion, backup/restore, or live-agent evals.

## File Structure

- Modify `src/db/schema.ts`: add an FTS5 virtual table for keyword memory content.
- Modify `src/db/database.ts`: run an idempotent migration for existing DBs.
- Modify `src/db/repository.ts`: add keyword index rebuild/upsert/delete/search/health methods.
- Create `src/core/keyword-index.ts`: rebuild/check keyword index from project context.
- Modify `src/core/retrieve-memories.ts`: support retrieval mode and explanation metadata.
- Modify `src/core/doctor.ts`: optionally include keyword index health.
- Modify `src/cli/main.ts`: parse `index`, `retrieve --mode`, `retrieve --explain`, `explain-retrieval`, and `doctor --index`.
- Modify tests in `tests/retrieval-preflight.test.ts` and `tests/cli.test.ts`, or add focused files if that keeps the tests smaller.

---

### Task 1: Keyword Index Core

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/database.ts`
- Modify: `src/db/repository.ts`
- Create: `src/core/keyword-index.ts`
- Test: `tests/retrieval-preflight.test.ts`

- [ ] **Step 1: Write failing tests for keyword index rebuild and search**

Add tests that initialize a temp workspace, create two memories, rebuild the keyword index, and assert keyword search returns the semantically matching lexical memory first. Include tags, paths, and metadata in indexed text by using a query that exists only in one of those fields.

Run:

```bash
pnpm test tests/retrieval-preflight.test.ts
```

Expected before implementation: failure because keyword index APIs do not exist.

- [ ] **Step 2: Add FTS schema and migration**

Add an FTS5 table named `memory_keyword_index` with columns:

```sql
memory_id UNINDEXED,
project_id UNINDEXED,
content,
summary,
tags,
paths,
metadata
```

Ensure `openDatabase()` creates it for new and existing DBs without destructive migration.

- [ ] **Step 3: Add repository methods**

Add methods with narrow responsibilities:

```ts
rebuildKeywordIndex(projectId: string): void
searchKeywordIndex(projectId: string, query: string, limit: number): Array<{ memoryId: string; rank: number }>
getKeywordIndexHealth(projectId: string): { indexedMemories: number; eligibleMemories: number; stale: boolean }
```

Index only memory data already present in SQLite. Include content, summary, tags, paths, and metadata JSON text.

- [ ] **Step 4: Add core wrapper**

Create `rebuildKeywordIndex({ cwd })` and `getKeywordIndexHealth({ cwd })` in `src/core/keyword-index.ts`. Both should load the current project, delegate to repository methods, and close the DB.

- [ ] **Step 5: Run targeted verification**

Run:

```bash
pnpm test tests/retrieval-preflight.test.ts
pnpm typecheck
```

Expected: targeted tests and typecheck pass.

---

### Task 2: Retrieval Modes and Explanations

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/core/retrieve-memories.ts`
- Test: `tests/retrieval-preflight.test.ts`

- [ ] **Step 1: Write failing tests for retrieval modes**

Add tests covering:

- default retrieval remains deterministic
- `mode: "keyword"` returns FTS matches and records keyword explanation metadata
- `mode: "hybrid"` merges deterministic and keyword results without duplicates
- unsupported `mode: "vector"` fails clearly

Run:

```bash
pnpm test tests/retrieval-preflight.test.ts
```

Expected before implementation: failure because retrieval mode is not typed or honored.

- [ ] **Step 2: Extend input types**

Add:

```ts
export type RetrievalMode = "deterministic" | "keyword" | "hybrid" | "vector";
```

Extend `RetrieveMemoriesInput` with:

```ts
mode?: RetrievalMode;
explain?: boolean;
```

- [ ] **Step 3: Implement keyword and hybrid retrieval**

Keep deterministic scoring as-is for default and `deterministic`. For `keyword`, rebuild or query the existing local index and return matching visible memories with metadata:

```ts
metadata.retrieval = {
  mode: "keyword",
  score,
  reason,
  signals
}
```

For `hybrid`, merge deterministic and keyword candidates by ID, preserve pinned/priority behavior, sort deterministically, and include mode/source details in retrieval metadata. Do not let keyword retrieval include invisible, stale, superseded, redacted, or unsafe memories.

- [ ] **Step 4: Record retrieval events with mode and explanations**

Extend the existing `memory_retrieved` event payload with `mode` and per-memory explanation data. Preserve existing fields for compatibility.

- [ ] **Step 5: Run targeted verification**

Run:

```bash
pnpm test tests/retrieval-preflight.test.ts
pnpm typecheck
```

Expected: targeted tests and typecheck pass.

---

### Task 3: CLI Commands and Doctor Index Health

**Files:**
- Modify: `src/core/doctor.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Add CLI tests for:

- `pnpm cli index --json`
- `pnpm cli index --rebuild --json`
- `pnpm cli retrieve "query" --mode keyword --json`
- `pnpm cli retrieve "query" --explain --json`
- `pnpm cli explain-retrieval "query" --json`
- `pnpm cli doctor --index --json`

Run:

```bash
pnpm test tests/cli.test.ts
```

Expected before implementation: failure because the command routes/options are absent.

- [ ] **Step 2: Add CLI route for `index`**

Wire `agentmem index` to `rebuildKeywordIndex`. `--rebuild` is accepted as the explicit same behavior because this slice has only one keyword index. JSON output should include `indexedMemories`, `eligibleMemories`, and `stale`.

- [ ] **Step 3: Add retrieval mode and explanation CLI support**

Parse `--mode` and `--explain` for `retrieve`. Add `explain-retrieval` as a readable alias that calls retrieval with `explain: true` and JSON-friendly explanation metadata. Invalid modes should produce a clear CLI error.

- [ ] **Step 4: Add doctor index health**

When `doctor({ includeIndex: true })` is requested, return an `index` object with keyword health. `doctor --index --json` should include that object. Non-index doctor behavior must remain unchanged.

- [ ] **Step 5: Run targeted verification**

Run:

```bash
pnpm test tests/cli.test.ts
pnpm typecheck
```

Expected: targeted tests and typecheck pass.

---

## Final Verification

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

## Self-Review Notes

- Spec coverage: covers PRD V1.1 only. Later PRD milestones remain out of scope by design.
- Placeholder scan: no task depends on TBD APIs; all new APIs are named above.
- Type consistency: `RetrievalMode`, keyword index core functions, and CLI option names are consistent across tasks.
