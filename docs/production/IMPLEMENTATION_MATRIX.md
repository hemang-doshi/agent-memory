# V2 Implementation Matrix

Status values: `not_started`, `planned`, `in_progress`, `implemented`, `tested`, `documented`, `verified`, `blocked_external`.

| Requirement ID | Area | Requirement | Status | Files | Tests | Notes |
|---|---|---|---|---|---|---|
| ARCH-001 | Architecture | Document V2 architecture boundaries | documented | `docs/architecture.md`, `docs/production/ARCHITECTURE_DECISIONS.md` | `pnpm typecheck` | V2 module map documented. |
| ARCH-002 | Architecture | Separate domain/store/retrieval/indexing/ranking/safety/policy/protocol/MCP/adapters/evals/CLI/docs | verified | `src/domain`, `src/db`, `src/core`, `src/vector`, `src/ranking`, `src/safety`, `src/lifecycle`, `src/ingestion`, `src/ops`, `src/mcp`, `src/adapters`, `src/evals`, `src/cli`, `docs` | `pnpm test` | Clean module separation verified by 181 passing tests. |
| ARCH-003 | Architecture | Preserve V1 CLI and storage behavior | verified | `src/cli/main.ts`, `src/db/**`, `src/core/**` | `tests/cli.test.ts`, full suite | V1 commands remain covered. |
| TRACK-001 | Tracking | Production PRD exists | documented | `docs/vision/PRODUCTION_GRADE_PRD.md` | docs review | Source of truth. |
| TRACK-002 | Tracking | Implementation matrix exists | documented | `docs/production/IMPLEMENTATION_MATRIX.md` | docs review | This file. |
| TRACK-003 | Tracking | Architecture decision log exists | documented | `docs/production/ARCHITECTURE_DECISIONS.md` | docs review | 2 ADRs recorded. |
| TRACK-004 | Tracking | Open questions and external blockers ledgers exist | documented | `docs/production/OPEN_QUESTIONS.md`, `docs/production/UNRESOLVED_EXTERNAL_BLOCKERS.md` | docs review | No open questions or external blockers. |
| TRACK-005 | Tracking | Verification and release-readiness ledgers exist | verified | `docs/production/VERIFICATION_RECORD.md`, `docs/production/V2_RELEASE_READINESS.md` | final commands run | All verification commands recorded, release checklist complete. |
| RET-001 | Retrieval | Deterministic retrieval remains default | verified | `src/core/retrieve-memories.ts` | `tests/retrieval-preflight.test.ts`, `tests/cli.test.ts` | Default mode deterministic. |
| RET-002 | Retrieval | Keyword retrieval mode | verified | `src/core/keyword-index.ts`, `src/db/repository.ts`, `src/core/retrieve-memories.ts` | `tests/retrieval-preflight.test.ts`, `tests/cli.test.ts` | SQLite FTS5-backed. |
| RET-003 | Retrieval | Hybrid retrieval mode | verified | `src/core/retrieve-memories.ts` | `tests/retrieval-preflight.test.ts`, `tests/v2-core.test.ts` | Merges deterministic + keyword + vector candidates. |
| RET-004 | Retrieval | Vector retrieval mode | verified | `src/vector/provider.ts`, `src/vector/vector-index.ts`, `src/core/retrieve-memories.ts` | `tests/retrieval-preflight.test.ts`, `tests/v2-core.test.ts` | Local hash provider; MCP now supports vector retrieval. |
| RET-005 | Retrieval | Retrieval explanations | verified | `src/cli/main.ts`, `src/core/retrieve-memories.ts`, `src/mcp/retrieval.ts` | `tests/cli.test.ts`, `tests/retrieval-preflight.test.ts`, `tests/v2-mcp.test.ts` | CLI and MCP explanation surfaces covered. |
| RET-006 | Retrieval | Conflict, supersession, pinned/priority behavior | verified | `src/core/retrieve-memories.ts`, `src/core/memory-eligibility.ts` | `tests/retrieval-preflight.test.ts`, `tests/evals/v1-evals.test.ts` | Covered. |
| RET-007 | Retrieval | Safety/trust filtering for retrieval | verified | `src/core/memory-eligibility.ts`, `src/safety/**` | `tests/v2-core.test.ts`, `tests/retrieval-preflight.test.ts`, `tests/v2-mcp.test.ts` | Trust level now integrated into visibility gate. |
| IDX-001 | Indexing | `agentmem index` keyword rebuild | verified | `src/cli/main.ts`, `src/core/keyword-index.ts` | `tests/cli.test.ts`, `tests/retrieval-preflight.test.ts` | Covered. |
| IDX-002 | Indexing | `agentmem index --vector` | verified | `src/cli/main.ts`, `src/vector/vector-index.ts` | `tests/cli.test.ts`, `tests/v2-core.test.ts` | Covered. |
| VEC-001 | Vector | Embedding provider abstraction | verified | `src/vector/provider.ts` | `tests/v2-core.test.ts` | Local/mock implemented. |
| VEC-002 | Vector | Local/mock vector provider | verified | `src/vector/provider.ts` | `tests/v2-core.test.ts` | Deterministic hash embedding. |
| VEC-003 | Vector | Local vector index storage and freshness | verified | `src/vector/vector-index.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | JSON index with freshness checks. |
| VEC-004 | Vector | Vector retrieval integration | verified | `src/core/retrieve-memories.ts`, `src/vector/**` | `tests/retrieval-preflight.test.ts`, `tests/v2-core.test.ts` | All modes covered including MCP. |
| RERANK-001 | Reranking | Reranker interface, no-op, mock | verified | `src/ranking/reranker.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | Timeout wired in. |
| RERANK-002 | Reranking | Structured JSON output parsing and fallback | verified | `src/ranking/reranker.ts` | `tests/v2-core.test.ts` | Parser present + fallback chain. |
| RERANK-003 | Reranking | CLI `--rerank` and explanation receipts | verified | `src/cli/main.ts`, `src/core/retrieve-memories.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | Reranker metadata on retrieved memories. |
| MCP-001 | MCP | `agentmem mcp serve` | verified | `src/mcp/server.ts`, `src/cli/main.ts` | `tests/v2-mcp.test.ts`, `tests/cli.test.ts` | JSON manifest + stdio loop. |
| MCP-002 | MCP | Read-only MCP resources | verified | `src/mcp/**` | `tests/v2-mcp.test.ts` | 7 resources. |
| MCP-003 | MCP | Safe MCP tools | verified | `src/mcp/**` | `tests/v2-mcp.test.ts` | 18 tools + 24 aliases; vector retrieval now enabled. |
| MCP-004 | MCP | Config-gated write tools and permissions | verified | `src/mcp/core.ts`, `src/mcp/manifest.ts`, `src/config/project-context.ts` | `tests/v2-mcp.test.ts` | Writes disabled by default. |
| MCP-005 | MCP | MCP security tests and docs | verified | `src/mcp/**`, `docs/mcp.md`, `docs/security.md` | `tests/v2-mcp.test.ts` | No shell execution exposed. |
| ADAPT-001 | Adapters | Adapter registry and list command | verified | `src/adapters/**`, `src/cli/main.ts` | `tests/v2-adapters.test.ts`, `tests/cli.test.ts` | 6 adapters. |
| ADAPT-002 | Adapters | Idempotent install/uninstall preserving user content | verified | `src/adapters/**` | `tests/v2-adapters.test.ts` | Adapter-specific markers. |
| ADAPT-003 | Adapters | Adapter docs | verified | `docs/adapters.md`, `README.md` | docs review | Documented. |
| SAFE-001 | Safety | Secret scanning for content, metadata, events, candidates | verified | `src/core/scan-secrets.ts`, `src/mcp/scan.ts` | `tests/scan-secrets.test.ts`, `tests/v2-core.test.ts`, `tests/v2-mcp.test.ts` | 14 patterns. |
| SAFE-002 | Safety | Prompt-injection treatment | verified | `src/core/scan-secrets.ts`, `src/safety/audit.ts`, `src/mcp/scan.ts` | `tests/v2-core.test.ts` | 4 patterns. |
| SAFE-003 | Safety | Trust levels and low-trust labels | verified | `src/domain/types.ts`, `src/db/schema.ts`, `src/db/repository.ts`, `src/core/memory-eligibility.ts`, `src/lifecycle/lifecycle.ts` | `tests/v2-core.test.ts` | trust_level column added, visibility gate enforces untrusted exclusion, audit/review surfaces it. |
| SAFE-004 | Safety | Quarantine and redaction | verified | `src/safety/quarantine.ts`, `src/core/memory-eligibility.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | Both quarantine and unquarantine with audit events. |
| SAFE-005 | Safety | Deterministic unsafe-memory exclusion | verified | `src/core/memory-eligibility.ts`, `src/mcp/retrieval.ts` | `tests/v2-core.test.ts`, `tests/retrieval-preflight.test.ts`, `tests/v2-mcp.test.ts` | All paths share visibility gate. |
| SAFE-006 | Safety | `agentmem audit`, `agentmem quarantine`, `agentmem unquarantine`, `scan --deep` | verified | `src/cli/main.ts`, `src/safety/**`, `src/core/scan-secrets.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | All CLI commands covered. |
| LIFE-001 | Lifecycle | Review and quality reports | verified | `src/lifecycle/lifecycle.ts`, `src/cli/main.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | `review`, `quality`. |
| LIFE-002 | Lifecycle | Deterministic dedupe with resolution | verified | `src/lifecycle/lifecycle.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | `dedupe` and `dedupe --resolve`. |
| LIFE-003 | Lifecycle | Merge and supersede workflows | verified | `src/lifecycle/lifecycle.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | Audited via events. |
| LIFE-004 | Lifecycle | Expiry purge | verified | `src/lifecycle/lifecycle.ts`, `src/cli/main.ts` | `tests/cli.test.ts` | `purge-expired` command. |
| INGEST-001 | Ingestion | File/log ingestion as candidates by default | verified | `src/ingestion/**`, `src/cli/main.ts` | `tests/v2-ingestion.test.ts`, `tests/cli.test.ts` | Secret scan, chunking, provenance. |
| INGEST-002 | Ingestion | Export/import JSON | verified | `src/ingestion/json.ts`, `src/ingestion/index.ts`, `src/cli/main.ts` | `tests/v2-ingestion.test.ts`, `tests/cli.test.ts` | Provenance preserved; trustLevel in import/export. |
| MIG-001 | Migration | Versioned migrations and status/up commands | verified | `src/db/database.ts`, `src/ops/storage.ts`, `src/cli/main.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts`, `tests/db.test.ts` | `migrate up` now runs real column migrations; `migrate status` shows pending. |
| MIG-002 | Migration | Backup/restore/repair/deep doctor | verified | `src/ops/storage.ts`, `src/core/doctor.ts`, `src/cli/main.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | Repair rebuilds indexes. |
| PROOF-001 | Proof | `agentmem eval live` harness | verified | `src/evals/live/live-agent.ts`, `src/cli/main.ts` | `tests/v2-core.test.ts`, `tests/cli.test.ts` | Local deterministic 8-scenario harness. |
| PROOF-002 | Proof | Scenario fixtures and proof report | verified | `benchmarks/live-agent/scenarios.json`, `docs/proof/live-agent-eval-report.md` | `tests/v2-core.test.ts` | No unsupported claims. |
| TEST-001 | Testing | Unit/integration/CLI/security/golden/MCP/adapter/migration/proof tests | verified | `tests/**` | `pnpm test` | 31 files, 181 tests, all passing. |
| CI-001 | CI | CI expansion and package smoke tests | verified | `.github/workflows/ci.yml` | CI passes locally | All verification commands pass. |
| DOC-001 | Docs | README and core user docs | verified | `README.md`, `docs/getting-started.md`, `docs/concepts.md` | docs review | Updated to current CLI behavior. |
| DOC-002 | Docs | All V2 feature docs | verified | `docs/retrieval.md`, `docs/mcp.md`, `docs/adapters.md`, `docs/security.md`, `docs/evals.md`, `docs/config.md`, `docs/migrations.md`, `docs/troubleshooting.md`, `docs/comparison.md`, `docs/architecture.md` | docs review | Limitations stated. |
| REL-001 | Release | Verification record complete | verified | `docs/production/VERIFICATION_RECORD.md` | All verification commands run and recorded. | |
| REL-002 | Release | V2 release readiness checklist complete | verified | `docs/production/V2_RELEASE_READINESS.md` | All 16 items complete. | |
