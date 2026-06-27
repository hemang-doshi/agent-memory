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

## Protocol Compliance

Check whether a memory-aware session followed the required protocol:

```bash
agentmem protocol check --session ses_x
agentmem protocol check --session ses_x --json
```

A compliant minimal session has:

- `session_started`
- `pack_loaded`
- `session_finished`

Preflights, events, and candidates are reported as activity but are not
required for every task.

## Protocol Start

Start a memory-aware agent session and load the initial memory pack in one step:

```bash
agentmem protocol start "Implement feature X"
agentmem protocol start "Implement feature X" --json
```

This is equivalent to starting a session and immediately generating a
session-aware memory pack.

A typical agent flow is:

```bash
START=$(agentmem protocol start "Implement feature X" --json)
SESSION=$(printf '%s' "$START" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')
# use returned memory pack before planning
agentmem preflight --command "..." --session "$SESSION"
agentmem event record --session "$SESSION" --type command_result --summary "..."
agentmem candidate propose --session "$SESSION" --type failed_attempt --content "..." --evidence "..."
agentmem session finish --session "$SESSION" --summary "..."
agentmem protocol check --session "$SESSION"
```

`protocol start` does not finish the session, run preflights, record events, or
propose candidates automatically.

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

## Evidence Events

Events provide auditable source material for memory candidates.

```bash
agentmem event record \
  --session ses_x \
  --type command_result \
  --command "pnpm typecheck" \
  --exit-code 1 \
  --summary "Typecheck failed when JSX children were stored in defineEntry props."

agentmem candidate propose \
  --session ses_x \
  --type failed_attempt \
  --content "Using defineEntry for JSX-child demos fails with JSX children." \
  --evidence-event evt_x
```

Candidates can still use `--evidence "..."`, but `--evidence-event`
preserves stronger provenance.

## Protocol Benchmarks

Protocol benchmarks run deterministic local fixtures that check memory pack
recall, preflight behavior, candidate proposal, evidence receipts, and protocol
receipts.

```bash
agentmem benchmark run --fixture benchmarks/fixtures/protocol/old-mistake-avoidance.json
agentmem benchmark run --all --json
```

Benchmarks run in isolated temporary workspaces and do not mutate the current
project's `.agent-memory` database.

## Commands

- `agentmem init [--git-init] [--json]`
- `agentmem install-instructions`
- `agentmem uninstall-instructions`
- `agentmem doctor [--json]`
- `agentmem session start "<task>" [--json]`
- `agentmem session finish --session <session-id> --summary "..." [--json]`
- `agentmem session receipt --session <session-id> [--json]`
- `agentmem protocol start "<task>" [--json]`
- `agentmem protocol check --session <session-id> [--json]`
- `agentmem event record --session <session-id> --type <type> --summary "..." [--command "..."] [--exit-code 1] [--json]`
- `agentmem event list --session <session-id> [--json]`
- `agentmem remember "<content>" --type <type>`
- `agentmem decision "<content>"`
- `agentmem failed "<content>"`
- `agentmem policy "<content>" --match "<pattern>"`
- `agentmem pack "<task>" [--session <session-id>] [--json]`
- `agentmem search "<query>" [--json]`
- `agentmem preflight --command "<command>" [--session <session-id>] [--json]`
- `agentmem candidate propose --session <session-id> --type <type> --content "..." [--evidence "..."] [--evidence-event <event-id>] [--json]`
- `agentmem candidate list [--status proposed] [--json]`
- `agentmem candidate approve <candidate-id> [--json]`
- `agentmem candidate reject <candidate-id> --reason "..." [--json]`
- `agentmem manage --plan [--json]`
- `agentmem benchmark run --fixture <path> [--json]`
- `agentmem benchmark run --all [--json]`
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
