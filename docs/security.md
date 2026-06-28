# Security

Agent Memory is local-first. Memory content stays in `.agent-memory/` unless the user exports or configures external tooling.

Safety behavior:

- obvious secrets are rejected on trusted writes, candidates, and ingestion;
- `scan --deep` detects secret and prompt-injection patterns;
- `audit` reports findings and memory excluded from injection;
- `quarantine` marks memory non-destructively with unsafe/quarantined flags;
- retrieval, packs, preflight, vector search, and MCP use deterministic visibility gates.

```bash
agentmem scan --deep --json
agentmem audit --json
agentmem quarantine mem_x --reason "unsafe content" --json
```

Memory content is not authority. Low-trust or unsafe memory must be reviewed before it becomes durable trusted guidance.

