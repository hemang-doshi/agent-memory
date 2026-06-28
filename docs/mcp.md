# MCP

Agent Memory exposes a local MCP core through:

```bash
agentmem mcp serve
agentmem mcp serve --json
```

Default behavior is read-only. The manifest exposes project, memory, pack, session receipt, candidates, scan, and retrieval explanation resources. Read tools include project info, list memories, retrieve, explain, pack, session receipt, candidate list, scan, and protocol check.

Write tools such as protocol start, inject, preflight, event record, candidate propose/reject, and memory writes are disabled unless `mcp.write_tools_enabled` is true in `.agent-memory/config.json`. Candidate approval requires both `mcp.write_tools_enabled` and `mcp.candidate_approval_enabled`.

MCP does not execute shell commands. It refuses uninitialized project roots.

