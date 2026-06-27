# Dogfood Runbook

## Purpose

This runbook defines how to run real implementation work through Agent Memory's v0.3 protocol.

The goal is not to produce perfect reports. The goal is to learn whether the protocol is useful, low-friction, and behavior-changing in real coding-agent sessions.

## When to use this runbook

Use for:

- non-trivial implementation PRs
- docs/design PRs that involve architecture or protocol decisions
- bug fixes where prior mistakes or fixes may matter
- benchmark/evaluation work

Do not require full dogfood reporting for:

- typo-only edits
- formatting-only edits
- mechanical dependency updates with no agent reasoning

The AGENTS.md router says every task should be memory-aware. This runbook applies stricter dogfood review rigor to non-trivial PRs.

## Quick command flow

```bash
TASK="Implement <slice name>"

START=$(agentmem protocol start "$TASK" --json)
SESSION=$(printf '%s' "$START" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).sessionId))')

# Read and use the returned memory pack before planning.
# Keep SESSION for all protocol commands.

# Only when a command is risky:
agentmem preflight --command "<risky command>" --session "$SESSION" --json

# Only when there is meaningful evidence:
agentmem event record \
  --session "$SESSION" \
  --type command_result \
  --command "<command>" \
  --exit-code 0 \
  --summary "<what happened>" \
  --json

# Only when reusable learning appears:
agentmem candidate propose \
  --session "$SESSION" \
  --type known_fix \
  --content "<reusable learning>" \
  --evidence "<evidence>" \
  --json

agentmem session finish \
  --session "$SESSION" \
  --summary "<what changed and how it was verified>" \
  --json

agentmem protocol check --session "$SESSION" --json
agentmem dogfood report --session "$SESSION" --json
```

Preflight, event, and candidate commands are conditional. Do not manufacture events or candidates just to make the report look busy.

## Step-by-step process

1. Start protocol before planning.
2. Read the returned memory pack before deciding implementation.
3. Plan the implementation.
4. Preflight risky commands.
5. Record evidence for meaningful command/test/user correction outcomes.
6. Propose candidates only for reusable learning.
7. Finish the session.
8. Run protocol check.
9. Run dogfood report.
10. Paste compact dogfood summary into final handoff or PR.

## Risky commands

Preflight before:

- install commands
- build/render commands
- migration commands
- delete/destructive commands
- network/deploy/publish commands
- commands known to be expensive/noisy in this repo

Harmless read-only commands usually do not need preflight.

## Meaningful evidence

Record events for:

- tests passing/failing
- typecheck/build results
- command failures with useful errors
- user corrections
- benchmark results
- real agent mistakes
- reusable observations discovered during implementation

Avoid:

- trivial observations
- one-off task details
- duplicate evidence for the same thing

## Reusable learning

Good candidates include:

- failed approach that should be avoided later
- successful fix that should be reused
- agent mistake that should not repeat
- workflow rule
- command policy candidate
- repo-specific implementation constraint

Avoid:

- obvious repo facts
- secrets
- one-off details
- guesses without evidence
- temporary implementation notes

## Final handoff format

```md
## Agent Memory Dogfood Summary

- Session: `ses_x`
- Protocol check: PASS / INCOMPLETE
- Dogfood report: PASS / INCOMPLETE
- Memory used: yes/no
- Preflights: N
- Events recorded: N
- Candidates proposed: N
- Useful behavior change observed: yes/no/unclear
- Friction/noise observed: none / describe
```

## How to interpret dogfood reports

- PASS means required protocol checkpoints completed. It does not prove product usefulness by itself.
- INCOMPLETE means required checkpoints are missing or the session is still active.
- No candidates is not a failure.
- No memory injected is not always a failure.
- The real question is whether the protocol helped or produced useful evidence.

## Minimum bar for v0.3 dogfood

v0.3 should collect at least three non-trivial dogfood PRs.

For each PR, capture:

- protocol check result
- dogfood report result
- whether memory affected behavior
- whether useful candidates were proposed
- whether the protocol felt noisy or helpful
