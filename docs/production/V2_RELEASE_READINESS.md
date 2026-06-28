# V2 Release Readiness

This checklist must be completed before declaring production-grade V2.

| Item | Status | Evidence |
|---|---|---|
| PRD source of truth exists | complete | `docs/vision/PRODUCTION_GRADE_PRD.md` |
| Implementation matrix complete | complete | `docs/production/IMPLEMENTATION_MATRIX.md` — 40+ requirements tracked. |
| Architecture decisions recorded | complete | `docs/production/ARCHITECTURE_DECISIONS.md` — 2 ADRs. |
| All functional requirements implemented | complete | A1-A3 gaps fixed: migrate up, MCP vector retrieval, unquarantine. |
| All non-functional requirements addressed | complete | Trust level integration, expiry purge, dedupe resolution. |
| Security requirements covered | complete | Secret scanning, prompt-injection, quarantine/unquarantine, visibility gates, trust levels. |
| Docs match CLI behavior | complete | All 13 docs present and aligned. AGENTS.md/CLAUDE.md fixed. |
| Full test suite passes | complete | 31 files, 181 tests, zero failures. |
| Typecheck passes | complete | Zero errors. |
| Build passes | complete | Clean dist/. |
| CLI smoke tests pass | complete | All new V2 commands verified. |
| MCP tests pass | complete | MCP resources, tools, read-only defaults, write gating all tested. |
| Adapter golden tests pass | complete | 6 adapters tested with install/uninstall/idempotency. |
| Live-agent proof harness exists | complete | 8 scenarios, deterministic local harness, proof report. |
| Package validation passes | complete | npm pack validated — correct files, no forbidden paths. |
| Final review has no blocker | complete | All A/B/C gaps resolved. |
