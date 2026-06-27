# Sub-Agent Dogfood Program

## Purpose

Use fresh-context sub-agents to implement, verify, review, and evaluate v0.3 dogfood PRs.

The goal is to reduce bias. Review and verification agents must not rely on the implementation agent's claims.

## Concurrency limit

Do not run more than six concurrent sub-agents.

Recommended per PR:

1. Implementation Agent
2. Verification Agent
3. Code Review Agent
4. Protocol Audit Agent
5. Dogfood Evaluation Agent

## Isolation rules

- Give each sub-agent a fresh context.
- Give each sub-agent only the task, branch/PR URL, acceptance criteria, and relevant docs.
- Do not include implementation-agent reasoning in reviewer prompts.
- Review agents must inspect diffs directly.
- Verification agents must run commands directly.
- Protocol audit agents must inspect protocol check and dogfood report output.
- Dogfood evaluation agents must report product signal honestly.

## Learning loop

1. Implementation Agent opens draft PR.
2. Verification Agent runs tests and smoke checks.
3. Code Review Agent inspects implementation quality.
4. Protocol Audit Agent checks Agent Memory protocol compliance.
5. Dogfood Evaluation Agent assesses usefulness/noise.
6. Coordinator records issues and sends fixes back to Implementation Agent.
7. Repeat until no blockers remain.

## Required final evidence per dogfood PR

- session ID
- protocol check result
- dogfood report result
- validation commands
- whether memory was injected
- whether evidence was recorded
- whether candidates were proposed
- whether protocol changed behavior
- friction/noise notes
