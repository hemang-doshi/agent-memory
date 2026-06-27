# Agent Memory

Local-first project memory and protocol receipts for coding agents.

Agent Memory stores reviewed project rules, decisions, command policies, failed attempts, fixes, and other reusable lessons in a local SQLite database under `.agent-memory/`. Agents can retrieve that context before planning, inject a compact memory packet, preflight risky commands, propose untrusted memory candidates, and produce receipts that show what happened.

The project is CLI-first. It does not require a hosted service, cloud sync, embeddings, an MCP server, or a dashboard.

## What It Does

- Creates local project state with `agentmem init`.
- Stores typed, project-scoped memories with `add`, `decision`, `failed`, and `policy`.
- Retrieves relevant memory with deterministic local scoring.
- Builds markdown and structured JSON memory packets with `inject` or `pack`.
- Checks command policies before commands with `preflight`.
- Records sessions, protocol receipts, and evidence events.
- Lets agents propose memory candidates that must be reviewed before becoming trusted memory.
- Archives memory non-destructively with `forget`.

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

## Commands

```text
agentmem init [--git-init] [--json]
agentmem install-instructions
agentmem uninstall-instructions
agentmem doctor [--json]
agentmem session start "<task>" [--json]
agentmem session finish --session <session-id> --summary "..." [--json]
agentmem session receipt --session <session-id> [--json]
agentmem add <content> --type <type> [--source <source>] [--path <path>] [--tags a,b]
agentmem remember <content> --type <type> [--source <source>] [--path <path>] [--tags a,b]
agentmem decision <content>
agentmem failed <content>
agentmem policy <content> --match <pattern> [--match-type substring|exact|regex] [--decision allow|warn|block]
agentmem retrieve <task> [--file <path>] [--command <command>] [--json]
agentmem inject <task> [--session <session-id>] [--file <path>] [--command <command>] [--json|--format markdown]
agentmem pack <task> [--session <session-id>] [--json]
agentmem preflight --command <command> [--session <session-id>] [--json]
agentmem event record --type <type> --summary "..." [--session <session-id>] [--json]
agentmem eval [--json]
agentmem candidate propose --session <session-id> --type <type> --content "..." [--evidence "..."] [--evidence-event <event-id>] [--json]
agentmem candidate list [--status proposed] [--json]
agentmem candidate approve <candidate-id> [--json]
agentmem candidate reject <candidate-id> --reason "..." [--json]
agentmem manage --plan [--json]
agentmem search <query> [--type <type>] [--json]
agentmem list [--type <type>] [--all] [--json]
agentmem update <memory-id> --reason <reason> [--content "..."] [--type <type>] [--status <status>] [--tags a,b] [--paths a,b] [--pinned true|false] [--priority n]
agentmem forget <memory-id> --reason <reason>
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

Retrieval is deterministic and local. It scores active eligible memories using:

- task token overlap
- file path matches
- tag matches
- command policy matches
- type, confidence, and severity priority
- pinned and priority metadata
- recency and use count
- failed-attempt, mistake, known-fix, and rejected-approach boosts
- basic supersession and conflict-group handling

Archived, rejected, superseded, blocked/redacted, expired, and secret-flagged memories are excluded from normal packets. Stale and unverified memories are controlled by project config.

The same agent-visible eligibility rules are used by command preflight, so blocked, redacted, expired, superseded, secret-flagged, and do-not-include command policies cannot affect preflight decisions.

## Safety Model

Agent Memory is designed for local project state, not secret management.

- `.agent-memory/` is local state and should not be committed.
- Obvious secrets are rejected in trusted memory writes and candidate proposals.
- Candidate memory is untrusted until approved.
- Rejected candidates stay available for audit but are not injected.
- `forget` archives memory instead of deleting it.

Candidates can cite evidence text, linked evidence event receipts, or both. Linked events provide stronger provenance because they point back to a recorded command result, test result, user correction, or reusable observation from the session.

## Limitations

Agent Memory V1.0 is a local CLI core. It intentionally does not:

- guarantee that a coding agent will obey injected memory;
- proxy or hard-block shell commands by default;
- prove that live agents produce better code;
- automatically trust agent-generated memories;
- replace human review of memory candidates;
- provide hosted sync, an MCP server, dashboard, vector search, or LLM reranking.

The local `eval` command verifies deterministic retrieval, packet generation, filtering, and context-delta behavior. It does not run live coding agents.

## Repository Layout

- `src/cli/`: command parsing and terminal output.
- `src/core/`: project use cases such as init, retrieval, packet generation, sessions, candidates, and preflight.
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

## Current V1 Release Status

This branch contains the V1 implementation and release-hardening work. The README documents the current CLI behavior visible in this branch, including deterministic evals, package metadata hardening, and CI templates. Final release status is recorded in `docs/v1-release/V1_RELEASE_VERIFICATION.md`.

See [docs/architecture.md](docs/architecture.md), [docs/testing.md](docs/testing.md), and [docs/v1-release/V1_RELEASE_NOTES_DRAFT.md](docs/v1-release/V1_RELEASE_NOTES_DRAFT.md) for release documentation.
