# Project Memory Pack
Project: <project>
Generated: <timestamp>
Use these memories as project context. Prefer explicit user instructions when they conflict with memory.
Safety: secrets are blocked from trusted writes and blocked/redacted memories are not injected.
## Critical Constraints
- [<mem:no-render-policy>] Do not run full render jobs during eval verification. _(why: 5 query tokens)_

## Relevant Decisions
- [<mem:deterministic-vitest-decision>] Use deterministic Vitest fixtures for V1 eval coverage. _(why: tag match, 4 query tokens)_

## Known Failed Attempts
- [<mem:no-live-llm-attempt>] Generating eval expectations from live LLM calls is disallowed. _(why: tag match, 5 query tokens, regression prevention)_

## Suggested Verification
- Prefer safe local checks before risky commands.
