# Agent Adapters

Supported adapters:

```bash
agentmem adapters list
agentmem adapters install codex
agentmem adapters install claude-code
agentmem adapters install cursor
agentmem adapters install command-code
agentmem adapters install opencode
agentmem adapters install generic
agentmem adapters uninstall codex
```

Installs are idempotent and use adapter-specific managed markers. Uninstall removes only the managed Agent Memory block and preserves user content.

