# Contributing

Agent Memory is infrastructure for agent behavior. Keep changes small, deterministic, and easy to audit.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Use Node.js 22 or newer.

## Development Workflow

1. Read the relevant source and tests before editing.
2. Keep CLI routing in `src/cli/main.ts`.
3. Keep core behavior in `src/core/`.
4. Keep shared record shapes and enums in `src/domain/`.
5. Keep SQLite schema and repository access in `src/db/`.
6. Add or update tests for behavior changes.
7. Run verification before reporting completion.

Prefer small changes over broad refactors. Do not introduce hosted services, cloud sync, vector search, dashboard UI, MCP server behavior, or hard command blocking unless the task explicitly asks for it.

## Testing Expectations

Add tests for:

- new CLI commands and aliases
- core behavior
- validation and error paths
- schema migrations
- packet and receipt correctness
- candidate review behavior
- retrieval and preflight changes

Tests should be deterministic and local. Avoid network access and live agent execution.

## Memory And Safety Expectations

- Candidate memory is untrusted until approved.
- Do not automatically convert agent observations into active memory.
- Do not store secrets or one-off task details.
- Command policy memory must include command metadata before it can be active.
- Protocol receipts should come from actual tool behavior.

## Release Process

Before a V1 release, the release owner should run and record:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run --json
```

Also verify README quickstart commands from a clean temporary project, review package contents, and update `docs/v1-release/V1_RELEASE_VERIFICATION.md`.
