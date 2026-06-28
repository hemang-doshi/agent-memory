# Config

Project config lives at `.agent-memory/config.json`.

Important V2 defaults:

```json
{
  "vector": { "enabled": false, "provider": "local" },
  "rerank": { "enabled": false, "provider": "noop", "timeout_ms": 750 },
  "mcp": { "write_tools_enabled": false, "candidate_approval_enabled": false }
}
```

External embedding or reranking providers are not called by default.

