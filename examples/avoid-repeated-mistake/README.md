# Avoid A Repeated Mistake

This example shows the core Agent Memory wedge: stop a coding agent from repeating a repo-specific mistake.

## Previous Mistake

An agent used `npm install` in a repo that uses `pnpm`. The command changed the wrong lockfile state and created package-manager drift.

## Save The Memory

```bash
agentmem add "Never use npm install in this repo. Use pnpm to avoid lockfile drift." \
  --type workflow_rule \
  --tag package-manager \
  --pinned
```

## Inject Memory Before The Next Task

```bash
agentmem inject "add a test dependency" --format markdown
```

Expected packet content includes the saved rule and its memory ID:

```md
- Never use npm install in this repo. Use pnpm to avoid lockfile drift.
```

## Add A Command Policy

```bash
agentmem policy "Block npm install because this repo uses pnpm." \
  --match "npm install" \
  --decision block \
  --suggest "Use pnpm add instead."
```

## Preflight The Risky Command

```bash
agentmem preflight --command "npm install zod" --json
```

Expected output:

```json
{
  "decision": "block",
  "reason": "Matched active command policy.",
  "message": "Block npm install because this repo uses pnpm.",
  "matchedMemoryIds": ["mem_..."],
  "suggestedAction": "Use pnpm add instead."
}
```

V1 surfaces the memory packet and preflight decision. It does not proxy the shell or guarantee that an agent obeys the result.
