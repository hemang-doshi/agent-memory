# Diff Changes

## Repository Bootstrap

- initialized a new Git repository on `main`
- added a TypeScript + pnpm + Vitest project baseline
- configured build, typecheck, test, and CLI scripts

## Product Implementation

- added SQLite-backed project initialization using Node 26 `node:sqlite`
- added typed memory storage for decisions, failed attempts, workflow rules, and command policies
- added project event logging for create, retrieve, pack, preflight, and stale-memory updates
- added deterministic retrieval scoring and markdown memory pack generation
- added advisory command preflight with exact, substring, and regex matching

## CLI Surface

- implemented `init`, `remember`, `decision`, `failed`, `policy`, `pack`, `search`, `preflight`, `list`, `stale`, and `explain`
- added plain-text and JSON rendering paths

## Quality And Benchmarking

- added unit tests for initialization, CRUD, retrieval, staleness, explainability, and preflight
- added CLI smoke coverage
- added replayable benchmark fixtures for render guard, failed attempt recall, design continuity, and stale-memory exclusion

## Documentation

- added `README.md`
- added the saved implementation plan under `docs/superpowers/plans/`
- added `snapshot.md` and this diff summary
