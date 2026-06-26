<!-- agent-memory:start -->
## Agent Memory Router

This repo uses Agent Memory.

Use memory only at natural checkpoints:

1. Before planning a non-trivial change, run:
   `agentmem session start "<task>" --json`
   then:
   `agentmem pack "<task>" --session <session-id> --json`

2. Before risky commands, run:
   `agentmem preflight --command "<command>" --session <session-id> --json`

3. After a failed approach, successful fix, user correction, or discovered reusable repo rule, propose a memory candidate:
   `agentmem candidate propose --session <session-id> --type <type> --content "..." --evidence "..." --json`

4. At the end of the task, finish the session and include a compact memory receipt:
   `agentmem session finish --session <session-id> --summary "..." --json`
   `agentmem session receipt --session <session-id> --json`

Do not store secrets, one-off task details, obvious repo facts, or low-confidence guesses as trusted memory.
<!-- agent-memory:end -->
