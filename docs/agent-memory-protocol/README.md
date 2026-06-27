# Agent Memory Protocol

The Agent Memory protocol is the small set of checkpoints that make local memory useful to coding agents without turning memory into the whole workflow.

The protocol is implemented through:

- repo instructions installed by `agentmem install-instructions`
- local CLI calls
- deterministic retrieval and packet assembly
- command preflight checks
- evidence events, candidate proposals, and review
- receipts written by Agent Memory commands

## Current Checkpoints

1. Start a session for non-trivial work.
2. Retrieve or inject relevant memory before planning.
3. Run preflight before risky commands.
4. Record meaningful evidence events.
5. Propose reusable lessons as candidates instead of trusted memory.
6. Review candidates before approval.
7. Finish the session and read the receipt.

## Documents

- [Protocol](./protocol.md): implemented checkpoint behavior and receipt model.
- [Skills Pack](./skills-pack.md): portable router instructions for agents.
- [Evaluation](./evaluation.md): deterministic evaluation goals and fixture categories.
- [v0.2 Roadmap Archive](./v0.2-roadmap.md): historical roadmap retained for context.

For the current release architecture, see [../architecture.md](../architecture.md).
