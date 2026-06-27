# Quickstart Example

This example uses the repository development entrypoint. In an installed package, replace the `node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts"` prefix with `agentmem`.

Run from a temporary project directory:

```bash
AGENT_MEMORY_REPO=/path/to/agent-memory

node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" init
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" install-instructions
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" add "Use pnpm for package operations." --type workflow_rule --tag package-manager
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" policy "Warn before running full render commands." \
  --match "pnpm render" \
  --decision warn \
  --suggest "Run tests first."
```

Start a session and load memory:

```bash
SESSION=$(node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" session start "Try the quickstart workflow" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')

node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" inject "Try the quickstart workflow" --session "$SESSION" --json
```

Preflight a command and record evidence:

```bash
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" preflight --command "pnpm render" --session "$SESSION" --json
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" event record \
  --session "$SESSION" \
  --type reusable_observation \
  --summary "Quickstart preflight returned the expected warning." \
  --json
```

Propose a candidate and finish:

```bash
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" candidate propose \
  --session "$SESSION" \
  --type workflow_rule \
  --content "Run command preflight before full render commands." \
  --evidence "The quickstart policy warned on pnpm render." \
  --json

node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" session finish --session "$SESSION" --summary "Quickstart complete." --json
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" session receipt --session "$SESSION" --json
```

The candidate remains untrusted until reviewed:

```bash
node --import tsx "$AGENT_MEMORY_REPO/src/cli/main.ts" manage --plan
```
