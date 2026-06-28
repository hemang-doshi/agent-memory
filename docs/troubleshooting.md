# Troubleshooting

- Not initialized: run `agentmem init`.
- Keyword/vector results look stale: run `agentmem index --rebuild` and `agentmem index --vector`.
- MCP write tool rejected: enable `mcp.write_tools_enabled` in `.agent-memory/config.json`.
- Candidate approval over MCP rejected: also enable `mcp.candidate_approval_enabled`.
- Import rejected: inspect the file for secret-like content and use redacted examples.
- Pack missing memory: check status, redaction status, safety flags, expiry, and project retrieval config.

