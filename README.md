# Agent Memory Preflight

Local-first project memory and preflight CLI for coding agents.

## What It Does

`agentmem` stores project-scoped memories such as decisions, failed attempts, workflow rules, and command policies in a local SQLite database. It can then:

- generate compact markdown memory packs for a task
- search and explain stored memories
- warn before risky commands repeat known mistakes

The current MVP is CLI-first. MCP integration is intentionally deferred.

Project memory state is created only by `agentmem init`. Other commands require an
existing `.agent-memory/config.json` and `.agent-memory/memory.db`.

## Quick Start

```bash
pnpm install
pnpm test
pnpm cli init
pnpm cli decision "Use reusable component library for reel scenes."
pnpm cli policy "Do not run npm run render unless explicitly requested." \
  --match "npm run render" \
  --decision warn \
  --suggest "Run pnpm test instead."
pnpm cli pack "Implement the next reel scene"
pnpm cli preflight --command "npm run render"
```

## Commands

- `agentmem init [--git-init]`
- `agentmem remember "<content>" --type <type>`
- `agentmem decision "<content>"`
- `agentmem failed "<content>"`
- `agentmem policy "<content>" --match "<pattern>"`
- `agentmem pack "<task>" [--json]`
- `agentmem search "<query>" [--json]`
- `agentmem preflight --command "<command>" [--json]`
- `agentmem list [--type <type>] [--all]`
- `agentmem stale <memory-id> --reason "<reason>"`
- `agentmem explain <memory-id> [--json]`

`agentmem init` uses the Git root when run inside a repository and adds
`.agent-memory/` to `.git/info/exclude` without changing `.gitignore`. Outside
Git, it initializes in the current directory and prints a warning. It runs
`git init -b main` only when `--git-init` is passed.

## Repository Layout

- `src/cli/`: command parsing and terminal output
- `src/core/`: use cases such as init, create-memory, retrieval, pack generation, and preflight
- `src/db/`: SQLite schema and repository
- `src/domain/`: shared enums, record shapes, defaults, and guards
- `src/formatters/`: markdown and text renderers
- `tests/`: unit and smoke tests
- `benchmarks/fixtures/`: replayable seeded scenarios

## Current Limitations

- no MCP server yet
- no `edit` command yet
- no automatic stale-memory conflict detection from repo state
- no path-scoped edit preflight yet
- no global shared memory database

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```
