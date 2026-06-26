# Agent Memory Skills Pack

The skills pack is the portable behavior layer that teaches different coding agents how to use Agent Memory without making memory the center of the workflow.

`/manage-mem` is only one skill. It belongs inside a broader skills pack that supports recall, preflight, candidate capture, review, and receipts.

## Design goal

The skills pack should make memory feel invisible.

The agent should not constantly talk about memory. It should simply use memory at the correct checkpoints and surface only the parts that affect the task.

## Router-first design

Every initialized repo should get a tiny memory router.

The router says:

```text
When X happens, call Y.
```

It should be small enough to live inside repo instruction files without creating context bloat.

Example managed block:

```md
<!-- agent-memory:start -->
## Agent Memory Router

This repo uses Agent Memory.

Use memory only at natural checkpoints:

1. Before planning a non-trivial change, run:
   `agentmem pack "<task>" --files <known files> --json`

2. Before risky commands, run:
   `agentmem preflight --command "<command>" --json`

3. After a failed approach, successful fix, user correction, or discovered reusable repo rule, propose a memory candidate.

4. At the end of the task, include a one-line memory receipt if memory was used or candidates were proposed.

Do not store secrets, one-off task details, obvious repo facts, or low-confidence guesses as trusted memory.
<!-- agent-memory:end -->
```

## Managed instruction targets

`agentmem install` or `agentmem install-instructions` should eventually support:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agent-memory.mdc`
- `.agent-memory/protocol.md`
- `.agent-memory/skills/*`
- future harness-specific adapters

The installer must use managed blocks:

```md
<!-- agent-memory:start -->
...
<!-- agent-memory:end -->
```

This makes updates and uninstall safe.

## Skill modules

### 1. `memory-boot`

Purpose:

- Load relevant memory before planning.
- Avoid over-explaining memory to the user.

Trigger:

- new coding task
- debugging task
- refactor/migration/review task

Tool:

```bash
agentmem pack "<task>" --files <known-files> --json
```

Agent behavior:

- Use the pack to shape the plan.
- Surface only memory that changes the plan.
- Never paste large memory packs unless asked.

### 2. `memory-aware-planning`

Purpose:

- Turn retrieved memories into planning constraints.

Behavior:

- Treat user-confirmed repo rules as hard constraints.
- Treat failed attempts as approaches to avoid.
- Treat known fixes as candidates, not guaranteed solutions.
- Treat test observations as evidence.
- Ignore stale/conflicted memory unless debugging memory itself.

### 3. `command-preflight`

Purpose:

- Check risky commands before running them.

Tool:

```bash
agentmem preflight --command "<command>" --json
```

Behavior:

- `allow`: proceed silently.
- `warn`: choose safer path or explain why proceeding is needed.
- `block`: stop unless the user explicitly overrides.

Risky commands include:

- package installs/removals
- lockfile changes
- full renders
- builds with heavy side effects
- deploy commands
- git destructive commands
- deletion commands
- external service calls

### 4. `failure-capture`

Purpose:

- Capture reusable failed attempts.

Trigger:

- implementation approach fails
- command/test failure reveals a repo-specific gotcha
- agent follows stale memory and fails

Tool shape:

```bash
agentmem candidate propose --type failed_attempt --content "..." --evidence "..."
```

Behavior:

- Do not capture random transient failures.
- Capture only lessons likely to matter in future sessions.

### 5. `fix-capture`

Purpose:

- Capture successful fixes that can help future agents.

Trigger:

- a previously failing test/build passes after a specific fix
- repo-specific workaround discovered
- command/tool quirk solved

Tool shape:

```bash
agentmem candidate propose --type known_fix --content "..." --evidence "..."
```

Behavior:

- Include before/after evidence.
- Prefer concrete fixes over vague summaries.

### 6. `agent-mistake-capture`

Purpose:

- Capture behavioral agent mistakes, not just technical failures.

Examples:

- agent edited a forbidden file
- agent ignored explicit user instruction
- agent ran a warned command anyway
- agent repeated a known failed attempt
- agent failed to load memory before planning

Tool shape:

```bash
agentmem candidate propose --type agent_mistake --content "..." --evidence "..."
```

### 7. `stale-memory-scan`

Purpose:

- Detect memory that may no longer be true.

Triggers:

- file path no longer exists
- dependency removed
- package manager changed
- test command changed
- newer memory contradicts older memory
- user correction invalidates old memory
- PR/commit changes architecture

Tool shape:

```bash
agentmem stale scan --json
```

### 8. `manage-memory-review`

Purpose:

- Review, approve, reject, merge, or supersede memory candidates.

Trigger:

- user invokes `/manage-mem`
- end of session
- many candidates accumulate
- conflicts detected

Tool:

```bash
agentmem manage --plan
```

Behavior:

- Ask concise questions.
- Do not overwhelm user with every event.
- Show only actionable candidates/conflicts/stale items.

### 9. `final-memory-receipt`

Purpose:

- Produce a compact audit trail at the end of the run.

Tool:

```bash
agentmem session receipt --session <id>
```

Default response shape:

```text
Memory: used 3 memories, triggered 1 warning, proposed 1 candidate.
```

Detailed receipts should be available when requested.

## Harness compatibility

Different harnesses have different powers.

| Harness capability | Agent Memory behavior |
|---|---|
| Reads repo docs only | router instructions only |
| Can run shell commands | CLI tools + receipts |
| Supports skills | modular skills pack |
| Supports MCP | structured tool API |
| Supports hooks | automatic recall/preflight/receipts |
| Supports command proxy | hard command blocking |
| Supports sandbox policy | stronger enforcement |

The system should degrade gracefully:

```text
No hooks? Use instructions + CLI.
No MCP? Use shell commands.
No shell? Use router docs only.
Full control? Enable hard gates.
```

## Anti-goals

The skills pack must not:

- dump all memory into context
- make the agent ask about memory constantly
- make every action require manual approval
- save everything the agent learns
- trust agent guesses as durable memory
- turn the coding workflow into a memory-management workflow
