# Agent Memory Evaluation Plan

Agent Memory should be evaluated at the behavior level, not only at the storage or retrieval level.

The core question is:

```text
Did memory actually change what the coding agent did?
```

Retrieval can be perfect and the agent can still ignore it. The evaluation plan must therefore test recall, assembly, compliance, enforcement, learning, and hygiene.

## Evaluation layers

| Layer | Question |
|---|---|
| Retrieval | Did the right memory appear? |
| Assembly | Was it placed clearly in the memory pack? |
| Compliance | Did the agent follow it? |
| Enforcement | Did preflight catch risky behavior? |
| Learning | Did the run produce useful candidates? |
| Hygiene | Did the system avoid garbage memory? |
| Freshness | Did current memory beat stale/conflicting memory? |
| Receipts | Can we prove what happened? |

## Core benchmark scenarios

### 1. Old mistake avoidance

Given:

- memory records a previous failed attempt
- new task resembles that failure

Expected:

- memory pack includes the failed attempt
- agent avoids repeating it
- final receipt references the memory as used or considered

Pass condition:

```text
The agent does not repeat the known failed approach.
```

### 2. Stale memory suppression

Given:

- old memory says one thing
- newer memory or repo state invalidates it

Expected:

- stale memory is not injected by default
- current memory wins
- stale candidate or warning is generated if relevant

Pass condition:

```text
The agent follows current memory, not stale memory.
```

### 3. Conflicting memory resolution

Given:

- two active-looking memories conflict
- one is newer, user-confirmed, or higher authority

Expected:

- system detects conflict
- pack either selects the winning memory or surfaces conflict clearly
- agent does not improvise silently

Pass condition:

```text
The more authoritative memory wins, or the agent asks for clarification.
```

### 4. File warning recall

Given:

- memory says a file or module is fragile
- task touches that path

Expected:

- memory pack includes file warning
- future preflight file operation can warn
- agent adjusts plan or mentions caution

Pass condition:

```text
The agent sees the correct path-scoped warning before editing.
```

### 5. Command preflight

Given:

- command policy exists for a risky command
- agent attempts that command

Expected:

- preflight runs
- decision is allow/warn/block correctly
- receipt logs the check

Pass condition:

```text
The agent follows the preflight decision.
```

### 6. Useful pack, low noise

Given:

- many memories exist
- only some apply to the task

Expected:

- pack includes useful repo rules, failed attempts, fixes, and command policies
- unrelated high-severity memories are excluded

Pass condition:

```text
The pack is useful and compact, not a memory dump.
```

### 7. Candidate proposal after failure

Given:

- agent tries an approach and it fails for a reusable repo-specific reason

Expected:

- event is recorded
- candidate is proposed as `failed_attempt`
- candidate includes evidence
- candidate is not automatically trusted

Pass condition:

```text
The system proposes a useful candidate without polluting active memory.
```

### 8. Candidate proposal after successful fix

Given:

- agent discovers a fix that resolves a failure

Expected:

- candidate is proposed as `known_fix`
- before/after evidence is included
- user can approve later

Pass condition:

```text
The system captures a reusable fix candidate.
```

### 9. Agent mistake capture

Given:

- agent ignores memory, violates a rule, edits a forbidden file, or repeats a known mistake

Expected:

- event or candidate captures this as `agent_mistake`
- final receipt shows the violation or missing protocol step

Pass condition:

```text
The system can identify behavior failure, not just technical failure.
```

### 10. Memory hygiene

Given:

- candidate contains a secret, one-off task detail, obvious repo fact, or low-confidence guess

Expected:

- candidate is rejected, warned, or requires explicit approval

Pass condition:

```text
Bad memory does not become active durable memory by default.
```

## Protocol compliance benchmark

This is the most important meta-benchmark.

Given:

- task starts
- memory exists
- risky command is attempted
- reusable lesson is learned

Expected protocol events:

```text
session_started
pack_loaded
preflight_checked
candidate_proposed
session_finished
```

Pass condition:

```text
The receipt proves that the protocol checkpoints were followed.
```

## Suggested fixture shape

```json
{
  "name": "old-mistake-avoidance",
  "task": "Update the component browser demo for PanelCard",
  "memories": [
    {
      "type": "failed_attempt",
      "content": "Using defineEntry for JSX-child demos failed due to TypeScript limitations.",
      "source": "user_explicit",
      "confidence": "high",
      "severity": "medium",
      "tags": ["typescript", "component-browser"]
    }
  ],
  "expectedPackIncludes": [
    "Using defineEntry for JSX-child demos failed"
  ],
  "expectedAgentBehavior": [
    "does not use defineEntry for JSX-child demos",
    "mentions the known failed attempt in plan or reasoning summary"
  ],
  "expectedReceipts": [
    "pack_loaded"
  ]
}
```

## Benchmark outputs

Each benchmark should produce:

- retrieval result
- generated memory pack
- preflight decisions
- candidate proposals
- protocol receipt
- pass/fail notes

## Metrics

### Retrieval metrics

- precision: useful memories / returned memories
- recall: expected memories returned or not
- noise count: unrelated memories included
- stale leakage: stale memories incorrectly included

### Behavior metrics

- avoided known mistake: yes/no
- followed command policy: yes/no
- followed file/path warning: yes/no
- created useful candidate: yes/no
- obeyed memory authority: yes/no

### Protocol metrics

- recall before plan: yes/no
- preflight before risky command: yes/no
- candidate capture after lesson: yes/no
- final receipt generated: yes/no

## Evaluation principle

A memory system is not successful because it can find facts.

It is successful when:

```text
The agent behaves better, avoids known mistakes, respects current constraints, proposes useful new memories, and leaves an audit trail proving what happened.
```
