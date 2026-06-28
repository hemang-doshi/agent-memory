# Agent Memory

> Local-first project memory system for coding agents.

## Overview

Agent Memory captures durable project knowledge (decisions, constraints, command policies, failed approaches, fixes, workflow rules) in a local SQLite store and retrieves relevant memories before each coding task.

**Tech Stack**: TypeScript, Node.js, SQLite
**CLI**: `agentmem`

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
pnpm cli --help
```

## Agent Workflow

For every coding task, follow the Agent Memory protocol:

1. Start the protocol: `agentmem protocol start "<task>" --json`
2. Use the returned memory pack before planning or editing
3. Run preflight before risky commands: `agentmem preflight --command "<cmd>" --session <id> --json`
4. Record evidence when meaningful things happen: `agentmem event record ...`
5. Propose candidates for reusable learning
6. Finish the session: `agentmem session finish --session <id> --summary "..." --json`
7. Check compliance: `agentmem protocol check --session <id> --json`

## Commands

See `agentmem --help` for the full command reference.
