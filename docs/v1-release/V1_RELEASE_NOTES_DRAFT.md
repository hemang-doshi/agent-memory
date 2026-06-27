# Agent Memory V1.0 Release Notes Draft

Status: ready for release review after final verification is recorded in `V1_RELEASE_VERIFICATION.md`.

## Highlights

- Local-first project memory stored under `.agent-memory/`.
- Deterministic memory retrieval with task, path, tag, command, priority, recency, and use-count signals.
- Structured memory packets with markdown and JSON output.
- Session and protocol receipts for auditable agent workflows.
- Command preflight against explicit command policies.
- Candidate proposal and review flow so agent-generated learning is not trusted automatically.
- Non-destructive memory update, stale marking, and archive/forget commands.
- Secret hygiene for trusted writes and candidate proposals.

## Primary Workflow

```bash
agentmem init
agentmem install-instructions
agentmem add "Use pnpm for package operations." --type workflow_rule --tag package-manager
agentmem session start "update package operations workflow" --json
agentmem retrieve "update package operations workflow" --file package.json --json
agentmem inject "update package operations workflow" --format markdown
agentmem preflight --command "pnpm test" --json
agentmem eval --json
agentmem session receipt --session <session-id> --json
```

## Compatibility

- `remember` remains available for direct memory creation.
- `pack` remains available as the compatibility name for packet generation.
- `stale` remains available for marking stale memory.
- `manage --plan` remains the non-interactive review planner.

## Not Included

V1 does not ship hosted sync, a dashboard, an MCP server, default vector search, default LLM reranking, or hard command blocking.

## Release Blockers To Confirm

- Final test/typecheck/build results are recorded.
- Package dry run is reviewed by the packaging owner.
- The package version is intentionally set to `1.0.0`.
- CI and package metadata changes are landed and verified.
- The `eval` CLI is present in help and passes locally.
