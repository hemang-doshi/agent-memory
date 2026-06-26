# Agent Memory Protocol

This folder captures the product and architecture decisions for the next phase of Agent Memory.

The current CLI baseline is treated as a scaffold. The next phase is not about making a generic notes database or adding embeddings immediately. The next phase is about turning memory into a lightweight, portable execution protocol that coding agents can actually follow.

## Core product thesis

Agent Memory is an agent behavior layer backed by local memory.

It should help coding agents:

- recall relevant repo memory before planning
- respect repo rules and user preferences
- avoid repeated failed attempts and agent mistakes
- preflight risky commands and operations
- capture successful fixes and meaningful test results
- propose durable memory candidates only when the lesson is reusable
- produce receipts so memory usage is auditable

The product is not:

- Obsidian for agents
- generic RAG over notes
- an embeddings-first memory store
- a second workflow that distracts the agent from coding

The desired user experience is power steering: the user should barely feel it, but the agent should behave noticeably better because it is there.

## Finalized decisions

### Memory categories

The next phase focuses on these durable memory categories:

- repo rules
- user preferences
- failed attempts
- successful fixes
- tool and command policies
- agent mistakes
- test results that change future behavior

These should be represented as typed, scoped, auditable records. One memory should contain one reusable behavioral fact.

### Memory writer model

Agents may explicitly propose memory through tool calls, but proposed memory is not automatically trusted.

The intended flow is:

1. Agent observes a reusable lesson.
2. Agent proposes a memory candidate.
3. System performs validation, duplicate checks, conflict checks, and hygiene checks.
4. User or review mode approves, edits, merges, rejects, or supersedes the candidate.
5. Approved memory becomes active durable memory.

### Retrieval direction

The next retrieval milestone is not embeddings-first.

Preferred sequence:

1. SQLite records as source of truth.
2. SQLite FTS5 or BM25-style lexical retrieval for commands, file paths, error strings, package names, and repo-specific terms.
3. Deterministic filters by scope, type, status, confidence, severity, path, command, and source.
4. Optional vector sidecar later.
5. Hybrid reranking only after real benchmark failures prove the need.

### Staleness signals

The system should eventually detect or propose stale memory when:

- file path no longer exists
- package manager lockfile changed
- test command changed
- dependency removed
- newer memory contradicts older memory
- user correction invalidates old memory
- commit or PR changes architecture
- agent fails after following old memory

### Memory hygiene rules

The system should avoid pollution by enforcing:

- do not store one-off task details as long-term memory
- do not store secrets
- do not store obvious facts that are already directly available in repo files
- do not store low-confidence agent guesses as trusted memory without approval
- consolidate duplicates
- expire weak memories
- separate observed memory from user-confirmed memory

## Biggest architectural principle

Memory must have accountability.

It is not enough for memory to exist or be retrievable. The system must be able to answer:

- which memories were retrieved
- which memories were injected into the agent context
- which memories were referenced or followed
- which preflight checks ran
- which warnings or blocks were triggered
- which memory candidates were proposed
- which stale or conflicting memories were detected

This is the difference between memory storage and a working agent memory protocol.

## Documents

- [Protocol](./protocol.md): portable protocol checkpoints, enforcement levels, and receipts.
- [Skills Pack](./skills-pack.md): modular agent skills and router instructions.
- [v0.2 Roadmap](./v0.2-roadmap.md): next implementation milestone and non-goals.
- [Evaluation](./evaluation.md): behavior-level evaluation plan and benchmark matrix.
