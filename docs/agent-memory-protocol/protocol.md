# Portable Agent Memory Protocol

The protocol exists to make memory part of the agent execution loop without making memory the main workflow.

The agent's main job remains:

1. understand the task
2. plan the change
3. edit code
4. run checks
5. ship a working result

Agent Memory only appears at natural checkpoints where memory materially improves behavior.

## Core answer

Enforce the protocol through layered, portable obedience:

```text
repo instruction router
+ skills pack
+ CLI/MCP tools
+ receipts
+ soft gates
+ optional hard gates where supported
```

The product should not ask the agent to think about memory constantly. Instead:

```text
At the few moments where memory matters, the agent has an obvious tool to call, a tiny router telling it when to call it, and a receipt proving whether it did.
```

## Protocol checkpoints

### 1. Recall before planning

Trigger:

- task starts
- non-trivial code change begins
- user asks for implementation, debugging, refactor, migration, or review

Tool:

```bash
agentmem pack "<task>" --files <known-files> --json
```

Expected behavior:

- Agent uses memory to shape the plan.
- Agent does not dump the full pack unless the user asks.
- Agent mentions only memories that materially affect the plan.
- Receipt records that recall happened and which memory IDs were included.

### 2. Preflight before risky action

Trigger:

- shell command that installs packages, changes git state, deletes files, runs expensive checks, runs deploys, runs full renders, modifies environment, or touches external services
- later: file/path operations involving fragile files or protected modules

Tool:

```bash
agentmem preflight --command "<command>" --json
```

Future tool:

```bash
agentmem preflight --file "<path>" --operation edit --json
```

Expected behavior:

- `allow`: proceed silently.
- `warn`: adapt to safer path, explain briefly, or ask the user.
- `block`: stop unless the user explicitly overrides.

### 3. Observe outcomes

Trigger:

- command succeeds or fails
- test result appears
- build/lint/typecheck result appears
- user correction happens
- agent discovers a repo rule
- agent repeats or avoids a known mistake

Tool shape:

```bash
agentmem event record --type <event_type> --json ...
```

Observation events are evidence, not durable memory. They can later produce candidates.

### 4. Propose candidates

Trigger:

- reusable failed attempt discovered
- successful fix discovered
- agent mistake occurred
- user explicitly corrected the agent
- new command/tool policy discovered
- test result changes future workflow

Tool shape:

```bash
agentmem candidate propose --type failed_attempt ...
agentmem candidate propose --type known_fix ...
agentmem candidate propose --type agent_mistake ...
```

Expected behavior:

- Agent proposes memory candidates, not trusted memory.
- Candidates include source evidence, confidence, scope, and reason.
- Candidates stay untrusted until reviewed or approved.

### 5. Review and manage

Trigger:

- user invokes `/manage-mem`
- end of session
- many candidates accumulate
- conflicts are detected
- stale memory is detected

Tool:

```bash
agentmem manage --plan
```

Expected behavior:

- show candidates
- show conflicts
- show possible stale memories
- ask concise approval questions
- promote, reject, merge, supersede, or mark stale

## Enforcement levels

Different coding agents and harnesses provide different levels of control. Agent Memory must degrade gracefully.

### Level 1: Instruction router

Installed into repo instruction files such as:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agent-memory.mdc`
- agent-specific skill files

This layer tells agents when to use memory.

It is universal but advisory.

### Level 2: Tool receipts

Every memory tool call writes a receipt or event:

- pack generated
- preflight checked
- warning triggered
- candidate proposed
- session completed

This does not force obedience, but it makes memory usage visible.

### Level 3: Soft gates

The system can return warnings and blocks. Agents are instructed to obey them.

This works even when the tool cannot intercept shell execution directly.

### Level 4: Hard gates

Only possible when the host allows it:

- command proxy
- MCP server
- hooks
- sandbox policy engine
- wrapper CLI

Hard gates should be optional. The product should not depend on them.

## Receipt model

Memory usage needs receipts.

A final memory receipt should be able to say:

```text
Memory receipt:
- session: ses_123
- pack_loaded: yes
- memories_injected: mem_12, mem_44, mem_91
- preflight_checks: 2
- warnings_triggered: 1
- blocks_triggered: 0
- candidates_proposed: 1
- stale_candidates_detected: 1
```

Receipts should be generated from tool logs, not the agent's self-report.

## Authority model

Memory types should not all have the same authority.

| Memory type | Authority |
|---|---|
| user-confirmed repo rule | hard constraint |
| command policy block | enforced where possible |
| command policy warn | soft gate |
| failed attempt | advisory, high priority |
| successful fix | advisory |
| test result observation | evidence only |
| agent-proposed candidate | untrusted until approved |
| stale/conflicted memory | not injected by default |

## Invisible UX rule

If the memory system has nothing important to say, it should stay quiet.

- Allow preflight result: no need to mention.
- Empty or low-value pack: no need to mention.
- Candidate captured for later review: no immediate interruption unless important.
- Warnings, blocks, conflicts, and meaningful candidates should surface.
