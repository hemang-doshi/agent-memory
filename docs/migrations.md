# Migrations, Backup, Restore, Repair

```bash
agentmem migrate status --json
agentmem migrate up --json
agentmem backup --json
agentmem restore <backup-path> --json
agentmem repair --json
agentmem doctor --index --json
```

Current migrations are idempotent schema migrations applied at database open. Backup copies local `.agent-memory` files. Restore creates a safety backup before copying files back. Repair validates local JSON fields through repository reads and rebuilds keyword/vector indexes.

