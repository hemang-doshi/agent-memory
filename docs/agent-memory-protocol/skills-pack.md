# Agent Memory Skills Pack

The skills pack is the portable instruction layer that tells coding agents when to use Agent Memory. The installed router is intentionally small so it can live in repo instruction files without crowding the agent context.

## Router Behavior

Initialized projects can install managed instructions:

```bash
agentmem install-instructions
```

The managed block tells agents to:

- load a packet before planning non-trivial work
- preflight risky commands
- record meaningful evidence events
- propose candidates for reusable lessons
- finish with a compact receipt
- avoid storing secrets, one-off task details, obvious repo facts, and low-confidence guesses as trusted memory

The block can be removed with:

```bash
agentmem uninstall-instructions
```

## Suggested Agent Modules

### Memory Boot

Trigger on non-trivial implementation, debugging, migration, refactor, and review tasks.

```bash
agentmem inject "<task>" --session <session-id> --json
```

Use the packet to shape the plan. Do not paste a full packet unless the user asks.

### Command Preflight

Trigger before package installs, destructive git commands, deletion commands, deploys, expensive renders, or external-service operations.

```bash
agentmem preflight --command "<command>" --session <session-id> --json
```

Follow `warn` and `block` results. A `block` should stop the action unless the user explicitly overrides it.

### Evidence Capture

Record command results, test results, user corrections, or reusable observations:

```bash
agentmem event record --type test_result --summary "..." --session <session-id> --json
```

Events are evidence only.

### Candidate Capture

Propose memory only for reusable lessons:

```bash
agentmem candidate propose \
  --session <session-id> \
  --type failed_attempt \
  --content "..." \
  --evidence "..." \
  --json
```

Candidates remain untrusted until reviewed.

### Review

Use:

```bash
agentmem manage --plan
```

Review should be explicit. Do not approve candidates automatically just because an agent proposed them.

### Final Receipt

Use:

```bash
agentmem session receipt --session <session-id> --json
```

Report only the compact facts that matter to the user.
