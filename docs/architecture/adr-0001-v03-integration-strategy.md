# ADR 0001: v0.3 Integration Strategy

Status: Accepted for v0.3 planning
Date: 2026-06-27

## Context

Agent Memory v0.2 established the local protocol primitives: sessions, packs, preflight checks, evidence events, candidates, review, receipts, and benchmarks.

The next risk is not whether the CLI can store and retrieve memory. The next risk is whether a real coding agent will actually use the protocol in a useful way.

The product should not become generic infra that looks powerful but never enters the agent workflow.

## Decision

v0.3 will be integration-first.

The integration strategy is:

```text
generic adapter model
+ AGENTS.md-managed instruction block
+ Agent Memory CLI
+ protocol compliance checker
```

The first implementation path is AGENTS.md-compatible agents. The architecture should remain portable to Codex, Claude Code, Cursor, and other coding agents, but v0.3 should not build a broad adapter framework yet.

## Integration surface

v0.3 supports this practical integration surface:

1. root `AGENTS.md` as the first instruction target
2. managed Agent Memory block inside human-authored instructions
3. CLI commands for protocol actions
4. `agentmem protocol check --session <id>` to verify behavior
5. dogfood protocol usage on real non-trivial PRs

## Adapter model

The adapter abstraction should eventually describe:

- adapter name
- instruction target file
- managed block boundaries
- session start behavior
- pack loading behavior
- preflight behavior
- evidence/candidate behavior
- final compliance instruction

v0.3 should design around this shape but only implement the AGENTS.md path unless needed.

## Why generic adapter layer?

The user workflow involves multiple possible coding agents. Optimizing only for one agent too early risks building agent-specific behavior that does not generalize.

However, implementing all adapters immediately would also be premature.

Therefore:

```text
Design generic.
Implement narrow.
Dogfood immediately.
```

## Router behavior

The installed router should be adaptive:

- every task starts memory-aware
- every task loads relevant memory
- risky commands require preflight
- meaningful evidence gets recorded
- reusable learning becomes a candidate
- uncertain memory decisions are deferred to manage-memory review

The router should not spam the user or force unnecessary interaction for tiny edits.

## Dogfood target

The `agent-memory` repo itself is the first dogfood target for non-trivial PRs.

A non-trivial PR should include evidence that the protocol was followed:

- session ID
- pack loaded
- relevant preflights when commands were risky
- events/candidates when meaningful
- session receipt or compliance output

## Consequences

Positive:

- validates product behavior in the real workflow
- keeps implementation grounded
- avoids premature MCP/vector/dashboard work
- creates a clear path for agent-specific adapters later

Negative:

- AGENTS.md behavior depends on agent instruction-following
- soft enforcement may miss skipped protocol steps until checked
- broad adapter support remains deferred

## Alternatives considered

### Retrieval-first

Rejected for v0.3. Retrieval quality matters, but without real integration there is no proof that better retrieval changes agent behavior.

### MCP-first

Rejected for v0.3 implementation. MCP may become useful later, but implementing it before dogfood proof risks building integration theater.

### Codex-only integration

Rejected as the architecture. Codex may be the first dogfood path, but the product should not be designed as Codex-only.

### Full multi-agent adapter system

Rejected for v0.3. Design the seam, but do not overbuild it.

## Follow-up work

- implement `agentmem protocol check`
- harden AGENTS.md router instructions
- add `agentmem protocol start` convenience command
- document adapter abstraction after dogfood feedback
