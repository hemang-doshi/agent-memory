# Agent Memory Infrastructure V1.0 Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. This release plan is the source of truth for V1.0 scope, ownership, verification, and deferrals.

**Goal:** Ship Agent Memory as a production-grade, local-first CLI and protocol layer that lets coding agents retrieve, explain, and inject persistent project memory with deterministic tests proving the agent-facing context changes.

**Architecture:** Keep the existing TypeScript CLI, core/domain/db split, and local SQLite storage. Add a deterministic hybrid retrieval pipeline, structured agent packets, safe memory mutation paths, and local eval fixtures before release packaging/docs hardening.

**Tech Stack:** TypeScript ESM, Node.js, `node:sqlite`, pnpm, Vitest, GitHub Actions.

---

## Wave 1 Findings

Wave 1 ran six read-only research agents: repository baseline, retrieval architecture, agent workflow integration, eval harness, production hardening, and CLI/API UX. No sub-agent edited files.

### Current State

- The package is `agent-memory-preflight@0.1.0` with a `agentmem` bin built from `dist/cli/main.js`.
- The implementation is CLI-first and local-first. Project state lives under `.agent-memory/` with `config.json` and `memory.db`.
- The codebase already has a clean split across `src/cli/`, `src/core/`, `src/domain/`, `src/db/`, `src/config/`, and `src/formatters/`.
- Implemented commands include `init`, `doctor`, `session`, `remember`, `decision`, `failed`, `policy`, `pack`, `preflight`, `candidate`, `manage --plan`, `search`, `list`, `stale`, and `explain`.
- The existing protocol spine is closer to v0.2-alpha than V0.3. No V0.3 protocol document was found.
- Baseline verification from the parent passed: `pnpm test` (15 files, 61 tests), `pnpm typecheck`, and `pnpm build`.

### Key Gaps

- No first-class V1 release plan or verification artifact existed before this file.
- The CLI documents `event record` in protocol docs, but the command is not implemented.
- Retrieval is deterministic lexical scoring with path/tag/command signals, but not yet a full hybrid pipeline with pinned memory, frequency, conflict handling, or structured explanations.
- Pack JSON returns markdown and matched IDs, but not structured packet sections/items suitable for adapters.
- Pack CLI does not expose file/path/command signals even though core retrieval supports them.
- Direct memory creation lacks the same secret hygiene expected of candidate proposals.
- No memory update command, no non-destructive forget/archive command, and no explicit V1 `add`, `retrieve`, or `inject` verbs.
- No deterministic V1 eval suite proving with-memory context differs from without-memory context.
- Release docs and package metadata still present the project as a pre-V1 MVP.
- Package contents are uncontrolled. `npm pack --dry-run --json` includes source/tests/docs/GitHub files and untracked local files.
- Missing release artifacts: `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, PR/issue templates, examples, release notes, and V1 verification docs.
- Schema evolution currently relies on `CREATE TABLE IF NOT EXISTS` plus `schema_meta`, which is not enough for V1 migrations.

---

## V1.0 Scope Decision

### Must Ship In V1.0

- Project initialization remains local-first and safe, with clear `AGENTS.md` instructions.
- Durable memory schema supports pinned/priority/use-count retrieval metadata through additive migration.
- Manual write path supports `add` alias, direct secret redaction/rejection, list/search, update, and non-destructive forget/archive.
- Hybrid retrieval uses multiple local deterministic signals:
  - project/scope/status eligibility
  - pinned/priority guaranteed includes with caps
  - lexical token matching
  - tag/path/command exact signals
  - type-aware boosts
  - recency and use-count boosts
  - mistake/regression boosts
  - stale/superseded/archived/rejected exclusion
  - basic conflict grouping and explanation
- Packet/injection supports markdown and structured JSON, including memory IDs, sections, reasons, score signals, project scope, timestamp, and redaction note.
- CLI exposes V1 verbs while preserving existing commands:
  - `add` as alias/new primary for `remember`
  - `retrieve` over core retrieval
  - `inject` as primary alias for `pack`
  - `update`
  - `forget`
  - `eval` wrapping deterministic local fixtures
  - `event record` if needed for protocol consistency
- Explain/debug output shows why a memory was retrieved.
- Deterministic V1 eval harness covers retrieval correctness, pinned inclusion, project scoping, regression/mistake retrieval, secret redaction, packet goldens, and with-memory vs without-memory context deltas.
- CI verifies install, typecheck, tests, build, package dry run, and CLI smoke.
- Docs are rewritten for actual V1 behavior, with no overclaiming.
- Release artifacts are present: README, LICENSE, CONTRIBUTING, SECURITY, CHANGELOG, PR/issue templates, examples, architecture docs, release notes, V1 release plan, and V1 verification.

### Should Ship If Easy

- `boot` convenience command returning session plus packet.
- `install-instructions --target agents|claude|cursor|all`.
- Markdown mode for `session receipt`.
- `review` alias for `manage --plan`.
- Better npm package metadata including repository, bugs, homepage, files allowlist, and keywords.
- Basic docs link validation.
- Dependabot configuration.

### Deferred Past V1.0

- Hosted service, cloud sync, or remote database.
- Required vector embeddings.
- LLM reranking or LLM compression in the default path.
- Full semantic contradiction detection.
- MCP server.
- Hard command blocking/proxy enforcement.
- Interactive TUI/dashboard.
- Cross-repo/global memory database.
- Broad adapter implementation beyond Codex-first docs and portable packet contract.
- Heavy search dependencies.
- Import/export merge workflow unless it falls out naturally from the eval fixture runner.

---

## Implementation Phases And Ownership

Do not spawn more than six sub-agents concurrently. Each implementation agent must read this file before editing. Agents are not alone in the codebase and must not revert unrelated edits.

### Wave 2: Architecture And Skeleton Implementation

1. **Storage/schema agent**
   - Owns: `src/domain/types.ts`, `src/domain/validators.ts`, `src/db/schema.ts`, `src/db/database.ts`, `src/db/repository.ts`, focused DB tests.
   - Adds additive migration support and retrieval metadata fields such as pinned, priority, use count, last retrieved/injected timestamps, conflict group, and safety/redaction metadata.
   - Verifies old DB opening/upgrading with migration tests.

2. **Retrieval engine agent**
   - Owns: `src/core/retrieve-memories.ts`, `src/core/search-memories.ts`, new retrieval helper files under `src/core/`, retrieval tests.
   - Implements deterministic hybrid ranking, score signals, pinned inclusion, recency/use-count boosts, mistake boosts, and basic conflict/supersession handling.
   - Avoids heavy dependencies and keeps fallback lexical matching portable.

3. **CLI/API surface agent**
   - Owns: `src/cli/main.ts`, CLI-focused tests.
   - Adds `add`, `retrieve`, `inject`, `update`, `forget`, `event record`, `eval` where scoped, `--format` support where practical, and preserves existing command aliases.
   - Keeps errors clear and stable.

4. **Packet/injection agent**
   - Owns: `src/core/generate-pack.ts`, `src/formatters/pack-markdown.ts`, new packet formatter/types, packet tests.
   - Produces compact markdown plus structured JSON sections with IDs, reasons, signals, scope, timestamp, and redaction note.
   - Ensures truncation does not cut items incoherently.

5. **Eval/test harness agent**
   - Owns: `benchmarks/fixtures/v1/`, `benchmarks/goldens/v1/`, `tests/evals/`, eval runner core if needed.
   - Adds deterministic fixtures for basic retrieval, scope isolation, pinned memory, mistake retrieval, secret redaction, packet goldens, conflict handling, and context delta.
   - Does not require network or live LLM calls.

6. **Docs/release hardening agent**
   - Owns: `README.md`, `docs/`, `examples/`, `.github/`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, package metadata/package allowlist.
   - Rewrites docs to match actual implementation and avoids V1 overclaims.
   - Adds release notes draft and CI/package validation.

### Wave 3: Integration, End-To-End Tests, And Repair

After Wave 2 is consolidated, spawn up to six verification agents:

1. End-to-end CLI tester.
2. Retrieval correctness tester.
3. Safety/redaction tester.
4. Agent packet UX reviewer.
5. Docs quickstart tester.
6. CI/release checklist reviewer.

The parent must fix all valid findings before final hardening.

### Wave 4: Final Release Hardening

The parent runs and records:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `npm pack --dry-run --json`
- packed CLI smoke test from the tarball if package metadata supports it
- README quickstart from a clean temporary fixture

The parent also verifies:

- no secrets or local machine paths are committed
- docs match actual CLI behavior
- release notes are accurate
- package versioning is intentional
- README does not overclaim
- `docs/v1-release/V1_RELEASE_VERIFICATION.md` records exact results

---

## Retrieval Architecture Decision

V1.0 retrieval will be deterministic and local. It will not require embeddings.

Pipeline:

1. **Eligibility:** filter by project, scope, status, expiration, safety, supersession, and requested context.
2. **Guaranteed includes:** include applicable pinned/high-priority memories under a separate cap.
3. **Lexical scoring:** use in-process token scoring and field boosts. Add SQLite FTS only if it remains low-risk and migration-safe.
4. **Domain scoring:** combine type priority, source authority, confidence, severity, path/tag/command matches, recency, use count, and mistake/regression boosts.
5. **Conflict pass:** suppress superseded memories and surface unresolved same-cluster conflicts with an explanation.
6. **Packet assembly:** group by priority/type, include reasons, and keep the packet compact.
7. **Receipts:** record selected IDs, reasons, warnings, and score signals where session-bound.

---

## CLI/API Decision

V1.0 docs should teach this primary workflow:

```bash
agentmem init
agentmem install-instructions
agentmem add "Use pnpm for package operations." --type workflow_rule --tag package-manager
agentmem retrieve "update package operations workflow" --file package.json --json
agentmem inject "update package operations workflow" --format markdown
agentmem preflight --command "pnpm test" --json
agentmem session receipt --session <session-id>
```

Compatibility aliases must remain:

- `remember` remains valid for `add`.
- `pack` remains valid for `inject`.
- `stale` remains valid for legacy stale marking.
- `manage --plan` remains valid if `review` is added.
- Existing JSON shapes should not be broken without updating tests and docs.

---

## Evaluation Strategy

V1.0 evals must be deterministic local tests. They should prove not only that memory is retrieved, but that generated agent context changes.

Required fixture categories:

- basic retrieval
- project scoping
- pinned memory inclusion
- mistake/regression retrieval
- secret redaction
- packet markdown/JSON golden output
- active/stale or superseded conflict handling
- with-memory vs without-memory context delta

Minimum passing bar:

- expected memory recall is 100% for V1 fixtures
- stale/rejected/archived leakage is 0
- secret leakage into packets is 0
- every context-delta fixture shows expected memory-aware text absent from no-memory context
- all normal CI checks pass without network or live LLM calls

---

## Release Readiness Checklist

- [ ] `README.md` describes V1 actual behavior and quickstart.
- [ ] `LICENSE` exists and matches MIT metadata.
- [ ] `CHANGELOG.md` includes V1.0 entry.
- [ ] `SECURITY.md` explains local storage and vulnerability reporting.
- [ ] `CONTRIBUTING.md` explains setup, tests, and release process.
- [ ] PR and issue templates exist.
- [ ] `examples/quickstart/` demonstrates an initialized local project workflow.
- [ ] Architecture docs explain storage, retrieval, packet format, and review model.
- [ ] CI runs install, typecheck, tests, build, package dry run, and CLI smoke.
- [ ] Package metadata includes controlled publish files.
- [ ] `docs/v1-release/V1_RELEASE_VERIFICATION.md` records final commands and results.
- [ ] Package version is bumped to `1.0.0` only after criteria pass.

---

## Known Risks

- Node runtime compatibility must be confirmed because `node:sqlite` is newer than common Node LTS installs.
- Additive DB migrations need careful tests against pre-V1 DBs.
- Pinned memories can create noise if not capped.
- Conflict detection must be basic and metadata-driven in V1; semantic contradiction detection is deferred.
- Pack truncation can undermine explainability if it cuts item details.
- Docs must separate implemented V1 behavior from protocol roadmap ideas.
- Package contents must be locked down before any release claim.
