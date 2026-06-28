# Contributing

Agent Memory is infrastructure for agent behavior. Keep changes small, deterministic, and easy to audit.

## Development Setup

```bash
git clone https://github.com/hemang-doshi/agent-memory.git
cd agent-memory
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm cli --help
```

**Requirements**: Node.js ≥22, pnpm 11.x.

## Development Workflow

1. Read the relevant source and tests before editing.
2. Keep CLI routing in `src/cli/main.ts`.
3. Keep core behavior in `src/core/`.
4. Keep shared record shapes and enums in `src/domain/`.
5. Keep SQLite schema and repository access in `src/db/`.
6. V2 modules go in focused directories: `src/vector/`, `src/ranking/`, `src/safety/`, `src/lifecycle/`, `src/ingestion/`, `src/ops/`, `src/mcp/`, `src/adapters/`, `src/evals/`.
7. Add or update tests for behavior changes.
8. Run the full verification sequence before claiming work is done.

Prefer small changes over broad refactors. Do not introduce hosted services, cloud sync, or hard command blocking unless the task explicitly asks for it.

## Repository Conventions

- **Module boundaries**: Each `src/<module>/` directory is self-contained with clear public interfaces.
- **Project loading**: Use `loadProject(cwd)` / `initProject(cwd)` from `src/core/context.js`. Always call `loaded.close()` in a `finally` block.
- **Transactions**: Use the repository's `transaction()` wrapper for multi-statement operations.
- **CLI parsing**: Manual arg parsing in `src/cli/main.ts` — no Commander or Yargs dependency.
- **IDs**: Use the `shortId()` helper or `randomUUID`.
- **Types**: All public types in `src/domain/types.ts`.

## Testing

Add tests under `tests/`. Tests use Vitest. Run with:

```bash
pnpm test           # Full suite
pnpm test:watch     # Watch mode
```

Test categories:
- **Unit tests**: Call `src/core/` functions directly with temporary DBs.
- **CLI tests**: Spawn `node --import tsx src/cli/main.ts` with isolated temporary workspaces.
- **Golden tests**: Compare output against committed fixtures in `benchmarks/goldens/`.
- **Security tests**: Verify secret rejection, scan accuracy, quarantine/unquarantine, MCP gating.

Tests must be deterministic and local. No network access, no external agent invocation.

## Memory & Safety Expectations

- Candidate memory is untrusted until approved.
- Do not automatically convert agent observations into active memory.
- Do not store secrets or one-off task details.
- Command policy memory must include command metadata before it can be active.
- Protocol receipts should come from actual tool behavior.
- Every lifecycle change must create an audit event.
- New modules must follow the visibility gate pattern — all retrieval/injection/preflight/MCP paths must call `isAgentVisibleMemory()`.

## Release Process

Before a release, the release owner must run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm cli eval --json
pnpm cli eval live --json
pnpm cli benchmark run --all --json
node dist/cli/main.js --help
node dist/cli/main.js eval --json
npm pack --dry-run --json
git diff --check
```

Record results in `docs/production/VERIFICATION_RECORD.md` and update the implementation matrix and release readiness checklist in `docs/production/`.

## Pull Requests

Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Include verification output in the PR description.

## Issue Tracking

Use the issue templates in `.github/ISSUE_TEMPLATE/`:
- [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md)
- [Security Report](.github/ISSUE_TEMPLATE/security_report.md)

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

All contributions are licensed under MIT. See [LICENSE](LICENSE).
