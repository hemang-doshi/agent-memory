<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js >=22">
  <img src="https://img.shields.io/badge/pnpm-11.3-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm 11.3">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/status-production--grade-6f42c1?style=flat-square" alt="Production Grade">
</p>

# Agent Memory

> Local-first project memory system for coding agents. Captures durable knowledge, retrieves relevant context, prevents repeated mistakes, and produces auditable protocol receipts — all from a local SQLite store.

Agent Memory is a CLI-first tool. It stores reviewed project rules, decisions, command policies, failed attempts, fixes, and reusable lessons under `.agent-memory/`. Agents retrieve that context before planning, preflight risky commands, propose untrusted memory candidates, and produce session receipts that show exactly what happened.

No hosted service. No cloud sync. No external embedding calls by default. Full MCP surface, agent adapters, lifecycle management, import/export, backup/restore/repair, and a reproducible live-agent proof harness.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [Protocol Spine](#protocol-spine)
- [Retrieval Engine](#retrieval-engine)
- [Safety Model](#safety-model)
- [MCP Server](#mcp-server)
- [Agent Adapters](#agent-adapters)
- [Memory Lifecycle](#memory-lifecycle)
- [Import / Export](#import--export)
- [Backup / Restore / Migrations](#backup--restore--migrations)
- [Evaluations & Benchmarks](#evaluations--benchmarks)
- [Repository Layout](#repository-layout)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

```bash
# From source
git clone https://github.com/hemang-doshi/agent-memory.git
cd agent-memory
pnpm install --frozen-lockfile
pnpm build
pnpm cli --help

# Or via npm (when published)
npm install -g agent-memory-preflight
agentmem --help
```

**Requirements**: Node.js ≥22, pnpm 11.x.

---

## Quick Start

```bash
# Initialize a project
agentmem init

# Install the agent router into AGENTS.md
agentmem install-instructions

# Store a memory
agentmem add "Use pnpm for package operations." --type workflow_rule --tag package-manager

# Retrieve relevant memories
agentmem retrieve "update package operations" --file package.json --json

# Retrieve with hybrid mode + explanation
agentmem retrieve "update package operations" --mode hybrid --explain --json

# Generate a memory pack (markdown)
agentmem inject "update package operations" --format markdown

# Check a command before running it
agentmem preflight --command "pnpm test" --json
```

---

## CLI Commands

### Core Operations

```text
agentmem init [--git-init] [--json]                          Initialize Agent Memory
agentmem install-instructions                                 Install router into AGENTS.md
agentmem uninstall-instructions                               Remove router from AGENTS.md
agentmem doctor [--index|--deep] [--json]                    Check project health
```

### Memory CRUD

```text
agentmem add <content> --type <type> [--source <source>]     Create active memory
agentmem update <id> --reason <r> [--content ...]            Update memory
agentmem forget <id> --reason <r>                            Archive memory (non-destructive)
agentmem list [--type <t>] [--all] [--json]                 List memories
agentmem search <query> [--type <t>] [--json]               Search memories
agentmem explain <memory-id>                                 Show memory with events
agentmem stale <memory-id> --reason <r>                     Mark memory as stale
```

### Shorthand Memory Commands

```text
agentmem decision <content>                                   Shortcut for type=decision
agentmem failed <content>                                     Shortcut for type=failed_attempt
agentmem policy <content> --match <pattern>                   Shortcut for type=command_policy
agentmem remember <content> --type <type>                    Alias for add
```

### Retrieval & Injection

```text
agentmem retrieve <task> [--mode determ|keyword|hybrid|vector]  Retrieve memories
                          [--rerank] [--reranker none|noop|mock]
                          [--explain] [--file <p>] [--command <c>] [--limit n] [--json]
agentmem explain-retrieval <task> [--mode ...] [--json]      Retrieve with full explanations
agentmem pack <task> [--session <id>] [--json]              Generate memory pack
agentmem inject <task> [--session <id>] [--json|--format md] Generate + inject pack
agentmem preflight --command <cmd> [--session <id>] [--json] Check command against policies
```

### Indexing

```text
agentmem index [--rebuild|--vector] [--json]                 Rebuild keyword or vector index
```

### Protocol & Sessions

```text
agentmem session start <task> [--json]                       Start a session
agentmem session finish --session <id> --summary "..." [--json]  Finish session
agentmem session receipt --session <id> [--json]             View session receipt
agentmem protocol start <task> [--json]                      Session + initial pack
agentmem protocol check --session <id> [--json]              Check protocol compliance
agentmem dogfood report --session <id> [--json]              Generate dogfood report
agentmem event record --session <id> --type <t> --summary "..."   Record evidence
agentmem event list --session <id> [--json]                 List events
```

### Candidate Review

```text
agentmem candidate propose --session <id> --type <t> --content "..."   Propose candidate
                            [--evidence "..."] [--evidence-event <id>] [--json]
agentmem candidate list [--status proposed] [--json]        List candidates
agentmem candidate approve <id> [--json]                     Approve candidate → active memory
agentmem candidate reject <id> --reason "..." [--json]       Reject candidate
agentmem manage --plan [--json]                              View candidate review plan
```

### Lifecycle

```text
agentmem review [--json]                                     Flag memories needing review
agentmem dedupe [--resolve] [--json]                        Find (or resolve) duplicate memories
agentmem merge --target <a> --source <b> --reason <r> [--json]  Merge two memories
agentmem supersede --old <a> --new <b> --reason <r> [--json]    Replace old with new
agentmem quality [--json]                                    Generate quality report
agentmem purge-expired [--json]                              Archive expired memories
```

### Ingestion & Import/Export

```text
agentmem ingest <file> --as candidates [--json]             Ingest file as candidates
agentmem ingest-log <file> --as candidates [--json]         Ingest log as candidates
agentmem export [--output <file>] [--json]                  Export memory store
agentmem import <file> [--json]                              Import memory store
```

### Safety

```text
agentmem scan [--deep] [--json]                              Scan for secrets & prompt injection
agentmem audit [--json]                                      Full safety audit report
agentmem quarantine <id> --reason <r> [--redact] [--json]   Remove unsafe memory from injection
agentmem unquarantine <id> --reason <r> [--json]            Restore quarantined memory
```

### Operations

```text
agentmem migrate status|up [--json]                          View or apply migrations
agentmem backup [--output <dir>] [--json]                   Backup .agent-memory/ store
agentmem restore <backup-path> [--json]                     Restore from backup
agentmem repair [--json]                                     Repair indexes + check corruption
```

### Evaluations & Benchmarks

```text
agentmem eval [--json]                                       Run V1 deterministic eval (5 checks)
agentmem eval live [--write-report] [--json]                Run live-agent proof harness (8 scenarios)
agentmem benchmark run --fixture <path> [--json]            Run single benchmark fixture
agentmem benchmark run --all [--json]                       Run all protocol benchmarks
```

### MCP & Adapters

```text
agentmem mcp serve [--json]                                  Start MCP server (stdio)
agentmem adapters list [--json]                             List available agent adapters
agentmem adapters install <adapter> [--json]               Install adapter instructions
agentmem adapters uninstall <adapter> [--json]             Remove adapter instructions
```

---

## Protocol Spine

The protocol spine adds a local audit trail. Start the session and load the memory pack in one command:

```bash
START=$(agentmem protocol start "Implement feature X" --json)
SESSION=$(printf '%s' "$START" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')

# Use the returned memory pack before planning
agentmem preflight --command "pnpm test" --session "$SESSION" --json
agentmem event record --session "$SESSION" --type command_result --summary "Tests pass." --json
agentmem candidate propose --session "$SESSION" --type known_fix \
  --content "Reusable lesson learned." --evidence "Details..." --json
agentmem session finish --session "$SESSION" --summary "Feature X implemented." --json
agentmem protocol check --session "$SESSION" --json
```

A compliant minimal session has: `session_started`, `pack_loaded`, and `session_finished`.

---

## Retrieval Engine

Agent Memory supports four retrieval modes, all local:

| Mode | Description |
|------|-------------|
| `deterministic` | **Default.** Token overlap + type/severity/confidence scoring + pinned/priority + recency + command matching. No external dependencies. |
| `keyword` | SQLite FTS5 full-text search with BM25 ranking. |
| `hybrid` | Merges deterministic, keyword, and vector results additively. |
| `vector` | Local hash-based 64-dim embedding + cosine similarity. No external calls. |

**Reranking**: Optional, off by default. Supports `none`/`noop` (preserves order), `mock` (lexical overlap rerank). External LLM reranking requires a provider adapter — not connected by default.

**Safety gate**: All modes share a single visibility gate (`isAgentVisibleMemory`) that excludes archived, rejected, quarantined, superseded, expired, redacted, secret-flagged, unsafe, prompt-injection-flagged, and untrusted memories.

---

## Safety Model

Agent Memory is designed for local project state, not secret management.

- **Write-time blocking**: Obvious secrets (API keys, tokens, passwords) rejected in memory creation and candidate proposals.
- **Deep scanning**: `agentmem scan --deep` detects 14 secret patterns + 4 prompt-injection patterns across memories, events, and candidates.
- **Visibility gate**: `isAgentVisibleMemory()` deterministically excludes unsafe memory from all retrieval, injection, preflight, vector search, and MCP paths. No LLM dependency.
- **Quarantine**: `agentmem quarantine` non-destructively removes unsafe memory from all paths. `agentmem unquarantine` restores after review.
- **Trust levels**: `trusted`, `reviewed`, `low`, `untrusted`. Untrusted memories are excluded from all retrieval paths.
- **Candidate untrusted by default**: Agent-proposed memories must be reviewed before becoming active.
- **Forget archives, never deletes**: Audit trail preserved.
- **Redactions**: Support for `redacted` and `blocked` status — both excluded from injection.

Memory content is data, not authority. Retrieved memory does not override trusted command policy or user instruction hierarchy.

---

## MCP Server

`agentmem mcp serve` starts a JSON-lines stdio MCP loop.

| Feature | Behavior |
|---------|----------|
| Read-only by default | All 7 resources and 9 read tools available without config |
| Write tools config-gated | Require `mcp.write_tools_enabled` in project config |
| Candidate approval separately gated | Also requires `mcp.candidate_approval_enabled` |
| No shell execution | MCP exposes no command execution surface |
| Project isolation | All queries scoped to project; uninitialized roots refused |

**Resources**: project, memories, pack, session receipt, candidates, scan, retrieval explanation.
**Tools**: protocol start, retrieve, inject, preflight, event record, candidate propose/list/approve/reject, protocol check, scan, create/update/forget memory.

---

## Agent Adapters

Six adapters produce idempotent install/uninstall blocks:

| Adapter | Target |
|---------|--------|
| `codex` | `AGENTS.md` |
| `claude-code` | `CLAUDE.md` |
| `cursor` | `.cursor/rules/agent-memory.mdc` |
| `command-code` | `.commandcode/taste/agent-memory.md` |
| `opencode` | `AGENTS.md` |
| `generic` | `AGENTS.md` |

All adapters use adapter-specific HTML markers — multiple adapters can coexist in the same file without conflict. Install is idempotent; uninstall preserves user content outside the managed block.

---

## Memory Lifecycle

- **Review**: Flags memories needing attention (unverified, stale, quarantined, low confidence, safety flags, redactions, low/untrusted trust level).
- **Dedupe**: Detects duplicates by normalized `type:content`. `--resolve` auto-merges groups.
- **Merge**: Combines tags, paths, and relationships; archives source.
- **Supersede**: Replaces old memory with new; old is excluded from all retrieval paths.
- **Quality**: Counts total, injectable, duplicate, stale, unsafe, and low-trust memories.
- **Expiry**: `purge-expired` archives memories past their `expiresAt` timestamp.

Every lifecycle change creates audit events.

---

## Import / Export

```bash
agentmem export --output backup.json
agentmem import backup.json
```

- **Format**: `agent-memory-v2-json` envelope with provenance block.
- **Safety**: Imported content is secret-scanned; duplicates are skipped (configurable).
- **Provenance**: Every imported record carries `agentMemoryProvenance` metadata linking back to source project and timestamp.
- **Candidates by default**: Ingested files and logs become candidates, not active memory.

---

## Backup / Restore / Migrations

```bash
agentmem backup                          # Backs up to .agent-memory/backups/
agentmem backup --output /safe/path      # Custom backup location
agentmem restore .agent-memory/backups/backup-2026-06-28T...
agentmem repair                          # Rebuild indexes, check JSON corruption
agentmem migrate status                  # View schema version + pending migrations
agentmem migrate up                      # Apply pending column migrations
```

- Backups are file copies of the `.agent-memory/` directory.
- Restore creates a safety backup of current state before overwriting.
- Repair rebuilds both keyword and vector indexes and surfaces corrupt JSON fields by name.
- Open-time migrations are idempotent and add missing columns automatically.

---

## Evaluations & Benchmarks

### V1 Deterministic Eval (5 checks)

```bash
agentmem eval --json
```

Checks: basic retrieval, pinned inclusion, conflict handling, secret redaction, context delta. All deterministic, no external agents.

### Live-Agent Proof Harness (8 scenarios)

```bash
agentmem eval live --write-report --json
```

Scenarios: avoid npm in pnpm repo, avoid fragile file, avoid known failed approach, respect architecture decision, respect command preflight, propose reusable learning, ignore stale/superseded memory, avoid secret-bearing memory. Local deterministic harness over scripted scenarios — does not invoke external models.

### Protocol Benchmarks (4 fixtures)

```bash
agentmem benchmark run --all --json
```

Fixtures: old-mistake-avoidance, noise-control, event-backed-candidate, command-preflight-warn. Run in isolated temporary workspaces.

---

## Repository Layout

```
src/
  cli/          Command parsing and terminal output
  core/         Memory CRUD, retrieval, packets, sessions, candidates, preflight, scan
  vector/       Embedding provider + local vector index
  ranking/      Reranker interface + mock/noop implementations
  safety/       Audit reports, quarantine/unquarantine
  lifecycle/    Review, dedupe, merge, supersede, quality, expiry purge
  ingestion/    File/log ingestion, chunking, JSON import/export, provenance
  ops/          Migration status, backup, restore, repair
  mcp/          MCP manifest, project loader, resources, tools, params, server
  adapters/     Adapter registry + idempotent install/uninstall
  evals/        Deterministic eval + live-agent proof harness
  db/           SQLite schema, migrations, repository access
  domain/       Types, enums, defaults, guards, validators
  formatters/   Markdown/text output formatters
tests/          31 test files, 181 tests (unit, integration, CLI, security, golden, MCP, adapter)
benchmarks/     Deterministic benchmark fixtures + golden test data
docs/           13 documentation files + 6 production tracking files
```

---

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm cli --help
```

**Verification checklist:**

```bash
pnpm typecheck                    # Zero errors
pnpm test                         # 31 files, 181 tests
pnpm build                        # Clean dist/
pnpm cli eval --json             # 5/5 V1 checks
pnpm cli eval live --json        # 8/8 live scenarios
pnpm cli benchmark run --all     # 4/4 fixtures
node dist/cli/main.js --help     # Built CLI matches source
npm pack --dry-run --json        # Clean package contents
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | First-time setup and workflow |
| [Concepts](docs/concepts.md) | Memory, candidates, packets, protocol receipts |
| [Architecture](docs/architecture.md) | Module boundaries and design decisions |
| [Retrieval](docs/retrieval.md) | All four modes + reranking |
| [MCP](docs/mcp.md) | MCP server, resources, tools, security posture |
| [Adapters](docs/adapters.md) | Agent adapter install/uninstall flows |
| [Security](docs/security.md) | Scan, audit, quarantine, trust model |
| [Evals](docs/evals.md) | Eval commands and proof harness |
| [Config](docs/config.md) | Project configuration schema |
| [Migrations](docs/migrations.md) | Backup, restore, repair, migrations |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and resolutions |
| [Comparison](docs/comparison.md) | Vs plain docs and external services |
| [Proof Report](docs/proof/live-agent-eval-report.md) | Live-agent eval results and limitations |

**Production tracking:** See `docs/production/` for the implementation matrix, architecture decisions, verification record, and release readiness checklist.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, workflow expectations, testing standards, and the release process.

- Keep changes small, deterministic, and auditable.
- Add tests for new behavior.
- Do not introduce hosted services or cloud dependencies.
- Read the [Security Policy](SECURITY.md) before reporting vulnerabilities.

---

## License

MIT © [Hemang Doshi](https://github.com/hemang-doshi)
