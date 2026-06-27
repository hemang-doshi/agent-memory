# Testing And Verification

Agent Memory tests should be deterministic, local, and focused on behavior that affects agents.

## Local Checks

Run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

For CLI smoke testing:

```bash
pnpm cli help
pnpm cli doctor --json
pnpm cli eval --json
```

Do not claim a check passed unless it was actually run.

## What To Test

Add or update tests for:

- new CLI commands and aliases
- core behavior
- validation and error paths
- schema migrations and old database compatibility
- retrieval eligibility and scoring
- packet markdown and JSON shape
- preflight decisions
- candidate approval/rejection
- protocol receipts

Use isolated temporary workspaces for tests. Do not mutate the caller's real `.agent-memory` database from benchmarks or fixtures.

## Release Verification

The V1 release plan expects final hardening to record exact command results in `docs/v1-release/V1_RELEASE_VERIFICATION.md`.

Minimum final checks:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run --json
```

Release hardening should also smoke test the packed CLI from the npm tarball after package metadata and publish allowlists are finalized.

## Docs Verification

Docs should be checked against the actual CLI help and implemented behavior:

```bash
pnpm cli help
rg "MCP server|cloud sync|vector" README.md docs
```

If docs mention a command, it should exist in `pnpm cli help` unless clearly labeled as future or pending.
