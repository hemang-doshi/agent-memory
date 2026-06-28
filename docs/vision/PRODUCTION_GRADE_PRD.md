# Agent Memory V2 Production-Grade PRD

## 1. Vision

Agent Memory V2 is a local-first project memory system for coding agents. It captures durable project knowledge, retrieves relevant memories with explainable behavior, prevents repeated mistakes through deterministic preflight checks, exposes safe MCP resources/tools, and provides reproducible proof that memory-enabled workflows can improve agent behavior in defined scenarios.

The product is production-ready only when code, tests, documentation, proof artifacts, and release-readiness records demonstrate that every requirement in this PRD is implemented or has a documented external blocker.

## 2. Non-Negotiable Principles

- Local-first by default: memory content does not leave the local machine unless a user explicitly enables an external provider.
- Memory content is data, not authority: retrieved memory must not override trusted command policy or user instruction hierarchy.
- Deterministic safety: command policies, preflight block/warn behavior, redaction, quarantine, unsafe-memory exclusion, and trust enforcement must not depend on LLM judgment.
- Optional intelligence: vector search and LLM reranking are optional, off by default, and must fail safely.
- Backward compatibility: V1 behavior remains available unless replaced by a documented migration path.
- No unsupported claims: docs and proof reports must describe evidence and limitations honestly.

## 3. Functional Requirements

### 3.1 Architecture

- Define clear boundaries for domain, store, retrieval, indexing, ranking, safety, policy, protocol, MCP, adapters, evals, CLI, and docs.
- Avoid monolithic CLI/core sprawl by moving reusable behavior into focused modules.
- Preserve V1 CLI commands and storage compatibility.
- Record architecture decisions in `docs/production/ARCHITECTURE_DECISIONS.md`.

### 3.2 Retrieval V2

- Preserve deterministic retrieval as the default.
- Add keyword retrieval.
- Add hybrid retrieval.
- Add vector retrieval as an optional mode.
- Add retrieval explanations with per-memory reasons and signals.
- Handle conflicts, supersession, pinned/priority behavior, safety/trust filtering, stale state, and redaction deterministically.
- Provide `agentmem retrieve --mode deterministic|keyword|hybrid|vector`.
- Provide `agentmem explain-retrieval`.
- Provide retrieval golden tests and docs.

### 3.3 Vector Memory

- Provide an embedding provider abstraction.
- Provide local/mock vector providers for tests and local-first operation.
- Store vector index data locally.
- Track index freshness and stale embedding invalidation.
- Integrate vector retrieval into hybrid retrieval.
- Provide `agentmem index --vector` and `agentmem retrieve --mode vector`.
- Make vector retrieval optional and avoid external calls by default.

### 3.4 LLM Reranking

- Provide a reranker interface.
- Provide no-op and mock rerankers.
- Support optional provider adapters.
- Parse structured JSON output.
- Enforce timeout, cost, cache, invalid-output, and fallback behavior.
- Provide `--rerank` CLI support and explanation receipts.
- Keep reranking off by default and subordinate to deterministic safety.

### 3.5 MCP Server

- Provide `agentmem mcp serve`.
- Expose MCP resources: project, memory, pack, session receipt, candidates, scan, retrieval explanation.
- Expose MCP tools: protocol start, retrieve, inject, preflight, event record, candidate propose, candidate list, protocol check, scan.
- Default to read-only operation.
- Config-gate write tools and disable candidate approval over MCP by default.
- Refuse uninitialized project roots.
- Never execute shell commands through MCP.
- Add MCP tests and docs.

### 3.6 Agent Adapters

- Provide adapters for Codex, Claude Code, Cursor, Command Code, OpenCode, and generic `AGENTS.md`.
- Provide `agentmem install <adapter>`, `agentmem uninstall <adapter>`, and `agentmem adapters list`.
- Install idempotently, preserve user content, and avoid destructive overwrites.
- Keep generated instructions aligned with current CLI behavior.
- Add golden tests and docs.

### 3.7 Safety and Security

- Scan memory content, metadata, events, and candidates for secrets.
- Treat prompt injection as unsafe memory content.
- Represent trust levels and low-trust labels visibly.
- Support quarantine and redaction.
- Exclude unsafe, quarantined, redacted, stale, and superseded memory from injection unless policy explicitly allows it.
- Provide `agentmem scan --deep`, `agentmem audit`, and `agentmem quarantine`.
- Add prompt-injection tests, MCP permission tests, and security docs.

### 3.8 Memory Lifecycle

- Prevent memory rot with review and quality reports.
- Detect duplicates deterministically.
- Support merge and supersede workflows.
- Exclude superseded memories from retrieval and preflight.
- Audit every lifecycle change.
- Provide `agentmem review`, `agentmem dedupe`, `agentmem merge`, `agentmem supersede`, and `agentmem quality`.

### 3.9 Import, Ingestion, Export

- Ingest project docs such as `AGENTS.md`, `CLAUDE.md`, `README`, docs, and logs.
- Import content as candidates by default.
- Preserve provenance.
- Secret-scan imported content.
- Chunk large files safely.
- Provide `agentmem ingest <file> --as candidates`, `agentmem ingest-log <file> --as candidates`, `agentmem export --format json`, and `agentmem import <file>`.

### 3.10 Storage, Migration, Backup, Restore, Repair

- Provide explicit versioned migrations.
- Provide migration status and apply commands.
- Back up before destructive migrations.
- Provide backup, restore, repair, and deep doctor commands.
- Rebuild indexes during repair.
- Report corrupt JSON fields clearly.
- Provide `agentmem migrate status`, `agentmem migrate up`, `agentmem backup`, `agentmem restore`, `agentmem repair`, and `agentmem doctor --deep`.

### 3.11 Live-Agent Proof Harness

- Provide `agentmem eval live`.
- Define reproducible scenarios for no-memory vs memory-enabled runs.
- Generate baseline-vs-memory reports.
- Store scenario fixtures under `benchmarks/live-agent/`.
- Generate `docs/proof/live-agent-eval-report.md`.
- Required scenarios: avoid `npm install` in a `pnpm` repo, avoid fragile file, avoid known failed approach, respect architecture decision, respect command preflight, propose reusable learning, ignore stale/superseded memory, avoid secret-bearing memory.
- Acknowledge nondeterminism and avoid unsupported claims.

### 3.12 Testing and CI

- Add unit, integration, golden, security, CLI E2E, package install, benchmark, eval, MCP, adapter, migration, and proof tests.
- Keep CI green and package contents controlled.
- Ensure docs and CLI help do not drift.

### 3.13 Documentation and Release

- Provide or update README, getting started, concepts, retrieval, MCP, adapters, security, evals, config, migrations, troubleshooting, comparison, proof report, changelog, architecture docs, and release readiness docs.
- Document limitations and external blockers honestly.
- Complete release-readiness checklist before claiming V2 production readiness.

## 4. Required Tracking Files

- `docs/production/IMPLEMENTATION_MATRIX.md`
- `docs/production/ARCHITECTURE_DECISIONS.md`
- `docs/production/OPEN_QUESTIONS.md`
- `docs/production/UNRESOLVED_EXTERNAL_BLOCKERS.md`
- `docs/production/VERIFICATION_RECORD.md`
- `docs/production/V2_RELEASE_READINESS.md`

## 5. Final Verification Commands

At minimum:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm cli --help
pnpm cli eval --json
pnpm cli benchmark run --all --json
node dist/cli/main.js --help
node dist/cli/main.js eval --json
node dist/cli/main.js scan --json || true
npm pack --dry-run --json
git diff --check
```

Smoke tests must also cover new commands such as:

```bash
agentmem index --help
agentmem retrieve --help
agentmem mcp serve --help
agentmem adapters list --help
agentmem backup --help
agentmem migrate status --help
agentmem eval live --help
```

