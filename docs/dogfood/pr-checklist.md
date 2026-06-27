# Dogfood PR Checklist

## Purpose

This checklist reviews whether a PR produced useful dogfood evidence. It is not meant to block every tiny edit.

## Protocol usage

- [ ] Was `agentmem protocol start "<task>" --json` run before planning/editing?
- [ ] Was the returned memory pack actually considered?
- [ ] Was the same `sessionId` used for later protocol commands?
- [ ] Was `agentmem session finish --session <id> --summary "..." --json` run?
- [ ] Was `agentmem protocol check --session <id> --json` run?
- [ ] Did protocol check pass?

## Risk and evidence

- [ ] Were risky commands preflighted?
- [ ] Were meaningful command/test results recorded as events?
- [ ] Were user corrections or agent mistakes recorded when relevant?
- [ ] Were benchmark/evaluation results recorded when relevant?

## Learning

- [ ] Were candidates proposed only for reusable learning?
- [ ] Were one-off task details avoided?
- [ ] Were secrets avoided?
- [ ] Were low-confidence guesses avoided?
- [ ] Were useful candidates reviewed or left clearly pending?

## Dogfood quality

- [ ] Was `agentmem dogfood report --session <id> --json` run?
- [ ] Did dogfood report show PASS or explain why INCOMPLETE?
- [ ] Did memory affect agent behavior? If yes, how?
- [ ] Did the protocol prevent or catch a mistake?
- [ ] Did the protocol produce useful evidence?
- [ ] Did the protocol feel noisy or intrusive?

## Final handoff

- [ ] Final response or PR includes session ID.
- [ ] Final response or PR includes compact protocol/dogfood summary.
- [ ] Any deferred memory decisions are called out.
- [ ] Any protocol misses are called out honestly.

## Review Notes

- Session:
- Protocol check:
- Dogfood report:
- Memory used:
- Candidates proposed:
- Useful behavior change:
- Friction/noise:
- Follow-up:

## Review Outcome

- `dogfood-pass`: protocol completed and produced useful review evidence.
- `dogfood-incomplete`: protocol was attempted but missing checkpoints or session still active.
- `dogfood-no-signal`: protocol completed but produced no meaningful product signal.
- `dogfood-regression`: protocol was confusing, noisy, or failed to guide the agent.
