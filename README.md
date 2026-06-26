# Agent Memory Preflight

Local-first project memory and preflight CLI for coding agents.

## What It Does

`agentmem` stores project-scoped memories such as decisions, failed attempts, workflow rules, and command policies in a local SQLite database. It can then:

- generate compact markdown memory packs for a task
- search and explain stored memories
- warn before risky commands repeat known mistakes
- record protocol receipts that prove an agent started a session, loaded memory, preflighted commands, proposed candidates, and finished with an audit summary

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

## Protocol Spine v0.2-alpha

The v0.2-alpha slice adds a local audit spine around the existing memory and
preflight workflow:

```bash
pnpm cli install-instructions
pnpm cli doctor --json

SESSION=$(pnpm cli session start "Implement protocol spine smoke test" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')

pnpm cli pack "Implement protocol spine smoke test" --session "$SESSION" --json
pnpm cli preflight --command "npm run render" --session "$SESSION" --json
pnpm cli candidate propose \
  --session "$SESSION" \
  --type failed_attempt \
  --content "Reusable lesson learned." \
  --evidence "Observed during this implementation." \
  --json
pnpm cli session finish --session "$SESSION" --summary "Smoke test complete." --json
pnpm cli session receipt --session "$SESSION" --json
```

`session receipt` reads from SQLite protocol receipts, not from agent
self-reporting. Candidate proposals are stored as untrusted
`memory_candidates` records and do not create trusted durable memories.

## Candidate Review

Agents can propose memory candidates, but candidates are untrusted until
reviewed.

```bash
agentmem candidate propose --session ses_x --type failed_attempt --content "..." --evidence "..."
agentmem manage --plan
agentmem candidate approve cand_x
agentmem candidate reject cand_y --reason "Too task-specific."
```

Approved candidates become active memory and can appear in future packs.
Rejected candidates are retained for audit but are never injected.

## Commands

- `agentmem init [--git-init] [--json]`
- `agentmem install-instructions`
- `agentmem uninstall-instructions`
- `agentmem doctor [--json]`
- `agentmem session start "<task>" [--json]`
- `agentmem session finish --session <session-id> --summary "..." [--json]`
- `agentmem session receipt --session <session-id> [--json]`
- `agentmem remember "<content>" --type <type>`
- `agentmem decision "<content>"`
- `agentmem failed "<content>"`
- `agentmem policy "<content>" --match "<pattern>"`
- `agentmem pack "<task>" [--session <session-id>] [--json]`
- `agentmem search "<query>" [--json]`
- `agentmem preflight --command "<command>" [--session <session-id>] [--json]`
- `agentmem candidate propose --session <session-id> --type <type> --content "..." --evidence "..." [--json]`
- `agentmem candidate list [--status proposed] [--json]`
- `agentmem candidate approve <candidate-id> [--json]`
- `agentmem candidate reject <candidate-id> --reason "..." [--json]`
- `agentmem manage --plan [--json]`
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
- no candidate merge/supersede workflow yet
- no interactive memory management UI yet
- no automatic stale-memory conflict detection from repo state
- no path-scoped edit preflight yet
- no global shared memory database

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```
