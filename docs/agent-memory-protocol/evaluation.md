# Agent Memory Evaluation

Agent Memory should be evaluated by whether memory changes agent behavior, not only by whether records are stored.

Current tests cover storage, CLI routing, candidate lifecycle, protocol receipts, package build smoke, and retrieval/preflight behavior. V1 release hardening should keep those tests deterministic and local.

## Evaluation Layers

| Layer | Question |
|---|---|
| Storage | Can local project state be created, read, and migrated without data loss? |
| Retrieval | Are the right active memories selected for the task, file, tag, or command? |
| Packet assembly | Are selected memories grouped with IDs and reasons? |
| Preflight | Do command policies return the intended decision? |
| Candidate review | Are agent proposals kept untrusted until approval? |
| Hygiene | Are obvious secrets rejected and blocked records excluded? |
| Receipts | Can the session receipt prove what the tool did? |

## V1 Fixture Categories

The release plan calls for deterministic fixtures in these categories:

- basic retrieval
- project scoping
- pinned memory inclusion
- mistake or regression retrieval
- secret redaction or rejection
- packet markdown and JSON goldens
- stale or superseded conflict handling
- with-memory vs without-memory context deltas

The fixture runner should not call external services or live LLMs. Failed expectations should be reported as failed checks, not process crashes, unless the fixture itself is invalid.

## Pass Criteria

For V1 release verification:

- expected memory recall is 100% for release fixtures
- stale, rejected, archived, superseded, blocked, and secret-flagged memories do not leak into default packets
- packet output includes memory IDs and retrieval reasons
- command preflight decisions match policy metadata
- candidate approval is the only path from agent-proposed candidate to active memory
- session receipts reflect actual command behavior

## Current Gap

The V1 CLI includes `agentmem eval`, a deterministic local harness that checks retrieval, pinned memory inclusion, conflict handling, secret redaction, and context-delta behavior without live LLM calls.
