# Agent Memory

Local-first project memory and protocol receipts for coding agents.

Agent Memory stores reviewed project rules, decisions, command policies, failed attempts, fixes, and other reusable lessons in a local SQLite database under `.agent-memory/`. Agents can retrieve that context before planning, inject a compact memory packet, preflight risky commands, propose untrusted memory candidates, and produce receipts that show what happened.

The project is CLI-first. It does not require a hosted service, cloud sync, external embeddings, or a dashboard. V2 includes local keyword/vector indexes, optional local reranking, a read-only-by-default MCP surface, agent adapters, lifecycle tools, ingestion/import/export, backup/restore/repair, and a reproducible local live-agent proof harness.

## What It Does

- Creates local project state with `agentmem init`.
- Stores typed, project-scoped memories with `add`, `decision`, `failed`, and `policy`.
- Retrieves relevant memory with deterministic local scoring.
- Builds markdown and structured JSON memory packets with `inject` or `pack`.
- Checks command policies before commands with `preflight`.
- Records sessions, protocol receipts, and evidence events.
- Lets agents propose memory candidates that must be reviewed before becoming trusted memory.
- Archives memory non-destructively with `forget`.
- Rebuilds local keyword/vector indexes with `index`.
- Explains retrieval decisions with `retrieve --explain` and `explain-retrieval`.
- Scans, audits, and quarantines unsafe memory.
- Installs adapter-specific instructions for Codex, Claude Code, Cursor, Command Code, OpenCode, and generic agents.
- Exposes a read-only-by-default MCP manifest/request surface.

Agent-generated learning is not automatically trusted. Durable memory should come from explicit user action or reviewed candidates.

## Requirements

- Node.js 22 or newer.
- pnpm.

This repository currently uses `node:sqlite`, so older Node.js versions are not supported.

## Quick Start

From this repository:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm cli init
pnpm cli install-instructions
pnpm cli add "Use pnpm for package operations." --type workflow_rule --tag package-manager
pnpm cli retrieve "update package operations workflow" --file package.json --json
pnpm cli retrieve "update package operations workflow" --mode hybrid --explain --json
pnpm cli inject "update package operations workflow" --format markdown
pnpm cli preflight --command "pnpm test" --json
```

After package installation, the binary name is `agentmem`:

```bash
agentmem init
agentmem install-instructions
agentmem add "Use pnpm for package operations." --type workflow_rule --tag package-manager
agentmem inject "update package operations workflow" --format markdown
```

## Package Name

The published package is currently `agent-memory-preflight`; the installed CLI binary is `agentmem`.

For a concrete demo, see [examples/avoid-repeated-mistake](https://github.com/hemang-doshi/agent-memory/tree/main/examples/avoid-repeated-mistake).

## Protocol Spine

The protocol spine adds a local audit trail around the existing memory and preflight workflow. The recommended agent integration path starts the session and loads the memory pack in one command:

```bash
START=$(pnpm cli protocol start "Implement protocol spine smoke test" --json)
SESSION=$(printf '%s' "$START" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')

pnpm cli preflight --command "npm run render" --session "$SESSION" --json
pnpm cli candidate propose \
  --session "$SESSION" \
  --type known_fix \
  --content "Reusable repo-specific lesson." \
  --evidence "Evidence from the command, test, or user correction." \
  --json
pnpm cli session finish --session "$SESSION" --summary "Smoke test complete." --json
pnpm cli protocol check --session "$SESSION" --json
```

`protocol check` reads from SQLite protocol receipts, not from agent self-reporting. Candidate proposals are stored as untrusted `memory_candidates` records and do not create trusted durable memories.

## Agent Workflow

Use memory at natural checkpoints:

```bash
SESSION=$(agentmem session start "Fix failing CLI tests" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')

agentmem inject "Fix failing CLI tests" --session "$SESSION" --file src/cli/main.ts --json
agentmem preflight --command "pnpm test" --session "$SESSION" --json
agentmem event record --session "$SESSION" --type test_result --summary "pnpm test passed." --json
agentmem candidate propose \
  --session "$SESSION" \
  --type known_fix \
  --content "Reusable repo-specific lesson." \
  --evidence "Evidence from the command, test, or user correction." \
  --json
agentmem session finish --session "$SESSION" --summary "Task completed." --json
agentmem session receipt --session "$SESSION" --json
```

Receipts are written by Agent Memory commands, not by agent self-report. They can show session start/finish, packet loading, preflight checks, warnings or blocks, candidate proposals, and candidate reviews.

Use `--evidence-event <event-id>` on `candidate propose` when a candidate should link directly to an event receipt from the same session.

## Agent Router Instructions

Install the Agent Memory router into `AGENTS.md`:

```bash
agentmem install-instructions
```

The managed block tells coding agents to:

- start every task with `agentmem protocol start "<task>" --json`
- use the returned memory pack before planning
- preflight risky commands
- record evidence only when meaningful
- propose candidates only for reusable learning
- finish the session and run `agentmem protocol check --session <id> --json`

The router is designed to be always memory-aware but rarely noisy. It does not
ask agents to record trivial events or propose memory for one-off task details.

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

## Dogfood Reports

Generate a local dogfood report for a memory-aware implementation session:

```bash
agentmem dogfood report --session ses_x
agentmem dogfood report --session ses_x --json
```

Dogfood reports are read-only summaries derived from protocol compliance data.
They show whether the protocol completed and whether useful dogfood signals
appeared, such as memory injection, preflight use, evidence capture, and
candidate learning.

A report does not create memory, write receipts, or judge product usefulness
automatically. It helps review real dogfood sessions.

## Dogfooding v0.3

Use the dogfood runbook for non-trivial implementation PRs:

- `docs/dogfood/runbook.md`
- `docs/dogfood/pr-checklist.md`
- `docs/dogfood/subagent-program.md`
- `docs/dogfood/v0.3-completion-plan.md`

The v0.3 completion plan uses three real feature PRs reviewed by fresh-context
sub-agents.

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

```text
agentmem init [--git-init] [--json]
agentmem install-instructions
agentmem uninstall-instructions
agentmem doctor [--index|--deep] [--json]
agentmem session start "<task>" [--json]
agentmem session finish --session <session-id> --summary "..." [--json]
agentmem session receipt --session <session-id> [--json]
agentmem protocol start "<task>" [--json]
agentmem protocol check --session <session-id> [--json]
agentmem dogfood report --session <session-id> [--json]
agentmem event record --session <session-id> --type <type> --summary "..." [--command "..."] [--exit-code 1] [--json]
agentmem event list --session <session-id> [--json]
agentmem add <content> --type <type> [--source <source>] [--path <path>] [--tags a,b]
agentmem remember <content> --type <type> [--source <source>] [--path <path>] [--tags a,b]
agentmem decision <content>
agentmem failed <content>
agentmem policy <content> --match <pattern> [--match-type substring|exact|regex] [--decision allow|warn|block]
agentmem index [--rebuild|--vector] [--json]
agentmem retrieve <task> [--mode deterministic|keyword|hybrid|vector] [--rerank] [--reranker none|noop|mock] [--file <path>] [--command <command>] [--json]
agentmem explain-retrieval <task> [--mode deterministic|keyword|hybrid|vector] [--json]
agentmem inject <task> [--session <session-id>] [--file <path>] [--command <command>] [--json|--format markdown]
agentmem pack <task> [--session <session-id>] [--json]
agentmem preflight --command <command> [--session <session-id>] [--json]
agentmem eval [--json]
agentmem eval live [--write-report] [--json]
agentmem mcp serve [--json]
agentmem adapters list|install|uninstall <adapter> [--json]
agentmem candidate propose --session <session-id> --type <type> --content "..." [--evidence "..."] [--evidence-event <event-id>] [--json]
agentmem candidate list [--status proposed] [--json]
agentmem candidate approve <candidate-id> [--json]
agentmem candidate reject <candidate-id> --reason "..." [--json]
agentmem manage --plan [--json]
agentmem benchmark run --fixture <path> [--json]
agentmem benchmark run --all [--json]
agentmem search <query> [--type <type>] [--json]
agentmem list [--type <type>] [--all] [--json]
agentmem update <memory-id> --reason <reason> [--content "..."] [--type <type>] [--status <status>] [--tags a,b] [--paths a,b] [--pinned true|false] [--priority n]
agentmem forget <memory-id> --reason <reason>
agentmem review|dedupe|quality [--json]
agentmem merge --target <memory-id> --source <memory-id> --reason <reason> [--json]
agentmem supersede --old <memory-id> --new <memory-id> --reason <reason> [--json]
agentmem ingest <file> --as candidates [--json]
agentmem ingest-log <file> --as candidates [--json]
agentmem export [--output <file>] [--json]
agentmem import <file> [--json]
agentmem migrate status|up [--json]
agentmem backup [--output <dir>] [--json]
agentmem restore <backup-path> [--json]
agentmem repair [--json]
agentmem scan [--deep] [--json]
agentmem audit [--json]
agentmem quarantine <memory-id> --reason <reason> [--redact] [--json]
agentmem stale <memory-id> --reason <reason>
agentmem explain <memory-id>
```

Compatibility aliases remain available: `remember` for `add`, and `pack` for `inject`.

## Memory Types

Current durable memory types include:

- `decision`
- `constraint`
- `preference`
- `command_policy`
- `failed_attempt`
- `known_fix`
- `agent_mistake`
- `fragile_file`
- `workflow_rule`
- `architecture_note`
- `design_rule`
- `rejected_approach`
- `pending_task`
- `tool_quirk`

Candidate proposal currently supports `failed_attempt`, `known_fix`, `agent_mistake`, `workflow_rule`, and `command_policy`.

## Retrieval

Retrieval is local. Deterministic retrieval is the default and safety baseline. Keyword retrieval uses SQLite FTS, vector retrieval uses a local hash embedding provider and local JSON index, and hybrid retrieval merges deterministic, keyword, and vector candidates after the shared visibility gate.

Deterministic retrieval scores active eligible memories using:

- task token overlap
- file path matches
- tag matches
- command policy matches
- type, confidence, and severity priority
- pinned and priority metadata
- recency and use count
- failed-attempt, mistake, known-fix, and rejected-approach boosts
- basic supersession and conflict-group handling

Archived, rejected, quarantined, superseded, blocked/redacted, expired, unsafe, prompt-injection-flagged, and secret-flagged memories are excluded from normal packets. Stale and unverified memories are controlled by project config.

The same agent-visible eligibility rules are used by command preflight, so blocked, redacted, expired, superseded, secret-flagged, and do-not-include command policies cannot affect preflight decisions.

## Safety Model

Agent Memory is designed for local project state, not secret management.

- `.agent-memory/` is local state and should not be committed.
- Obvious secrets are rejected in trusted memory writes and candidate proposals.
- Candidate memory is untrusted until approved.
- Rejected candidates stay available for audit but are not injected.
- `forget` archives memory instead of deleting it.
- `scan --deep` detects secret and prompt-injection patterns.
- `audit` reports safety findings and non-injectable memory.
- `quarantine` non-destructively removes unsafe memory from retrieval, packs, preflight, and MCP output.

Candidates can cite evidence text, linked evidence event receipts, or both. Linked events provide stronger provenance because they point back to a recorded command result, test result, user correction, or reusable observation from the session.

## MCP

`agentmem mcp serve --json` prints the MCP manifest. Plain `agentmem mcp serve` starts a JSON-lines stdio request loop. MCP is read-only by default, exposes no shell command execution, and refuses uninitialized project roots. Write tools require `mcp.write_tools_enabled`; candidate approval also requires `mcp.candidate_approval_enabled`.

## Limitations

Agent Memory remains local-first and intentionally does not:

- guarantee that a coding agent will obey injected memory;
- proxy or hard-block shell commands by default;
- prove that external live agents produce better code;
- automatically trust agent-generated memories;
- replace human review of memory candidates;
- provide hosted sync or a dashboard;
- call external embedding or LLM reranking providers by default.

The local `eval` command verifies deterministic retrieval, packet generation, filtering, and context-delta behavior. `eval live` is a deterministic local harness over scripted scenarios; it does not claim universal external agent behavior.

## Repository Layout

- `src/cli/`: command parsing and terminal output.
- `src/core/`: project use cases such as init, retrieval, packet generation, sessions, candidates, and preflight.
- `src/vector/`, `src/ranking/`, `src/safety/`, `src/lifecycle/`, `src/ingestion/`, `src/ops/`, `src/mcp/`, `src/adapters/`, `src/evals/`: V2 focused modules.
- `src/db/`: SQLite schema and repository access.
- `src/domain/`: domain enums, record shapes, defaults, guards, and validators.
- `src/formatters/`: markdown and text formatters.
- `tests/`: unit, CLI, protocol, and smoke tests.
- `benchmarks/fixtures/`: deterministic benchmark fixtures.
- `docs/`: protocol, architecture, testing, and release documentation.
- `examples/`: runnable documentation examples.

## Development

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

CLI smoke tests can use:

```bash
pnpm cli <command>
```

Run the deterministic local V1 eval harness with:

```bash
pnpm cli eval --json
```

## Production V2 Tracking

Production V2 tracking is recorded in `docs/production/`. Release status must be read from the implementation matrix, verification record, and V2 release readiness checklist.

See [docs/architecture.md](docs/architecture.md), [docs/testing.md](docs/testing.md), [docs/retrieval.md](docs/retrieval.md), [docs/mcp.md](docs/mcp.md), [docs/adapters.md](docs/adapters.md), [docs/security.md](docs/security.md), [docs/evals.md](docs/evals.md), and [docs/migrations.md](docs/migrations.md).
