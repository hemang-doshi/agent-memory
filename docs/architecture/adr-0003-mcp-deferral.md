# ADR 0003: Defer MCP Implementation in v0.3

Status: Accepted for v0.3 planning
Date: 2026-06-27

## Context

MCP could eventually be a useful integration surface for Agent Memory. It may allow agents to access memory tools through a standard tool interface instead of shelling out to the CLI.

However, v0.3's primary risk is not tool transport. The primary risk is whether real coding agents will follow a useful memory protocol at all.

If MCP is implemented too early, the project may spend effort on integration mechanics before proving that the behavior layer works in real coding tasks.

## Decision

Do not implement MCP in v0.3.

v0.3 may document MCP as a future adapter option, but the implementation milestone is:

```text
AGENTS.md + CLI + protocol compliance checker
```

MCP is deferred until after dogfood evidence shows that the protocol improves real agent behavior.

## Why defer MCP?

### 1. The protocol must prove value first

Agent Memory must first prove:

- agents load memory before planning
- agents preflight risky commands
- agents record meaningful evidence
- agents propose useful candidates
- receipts expose whether the protocol happened

MCP does not answer those questions by itself.

### 2. CLI is already portable

The CLI works across agents that can run shell commands or follow AGENTS.md instructions.

This is enough for v0.3 dogfood.

### 3. MCP can hide protocol clarity

A tool server can make actions easier to call, but it can also obscure the explicit protocol sequence.

For v0.3, the sequence should stay visible:

```text
session start
pack
preflight
event record
candidate propose
session finish
protocol check
```

### 4. Avoid adapter sprawl

MCP plus agent-specific rules plus CLI wrappers would create multiple integration paths before the product has enough evidence to choose the right one.

## What is allowed in v0.3?

Allowed:

- mention MCP in future-work docs
- design adapter seams that could support MCP later
- ensure core commands are reusable enough for a future MCP server

Not allowed:

- MCP server implementation
- MCP-specific protocol behavior
- MCP as the required integration path
- MCP-driven automatic memory writes

## Reconsideration criteria

MCP should be reconsidered after v0.3 if at least one of these is true:

1. AGENTS.md + CLI dogfood works but is too verbose for agents.
2. Agents repeatedly fail to call shell commands correctly.
3. A target agent workflow strongly prefers MCP tools over shell commands.
4. Protocol check shows compliance friction caused by CLI ergonomics, not product behavior.

## Consequences

Positive:

- keeps v0.3 focused
- reduces implementation risk
- keeps the protocol visible and auditable
- avoids building integration theater

Negative:

- some agents may have a less ergonomic integration path
- MCP users cannot try a native tool server yet
- future MCP design may require refactoring command/core boundaries

## Future MCP shape

When revisited, MCP should expose the existing protocol primitives rather than invent a separate memory model:

- `session_start`
- `pack_generate`
- `preflight_command`
- `event_record`
- `candidate_propose`
- `candidate_list`
- `protocol_check`

MCP should remain a transport layer over the Agent Memory protocol, not a new product architecture.
