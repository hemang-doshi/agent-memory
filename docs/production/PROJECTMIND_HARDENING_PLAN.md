# ProjectMind V2 Hardening Plan

| Issue ID | Phase | Description | Status | Files | Tests |
|----------|-------|-------------|--------|-------|-------|
| PM-01 | 1 | Stable project identity | tested | context.ts, project-context.ts, types.ts, defaults.ts, repository.ts | tests/project-identity.test.ts (3) |
| PM-02 | 2 | Shared visibility gate everywhere | tested | memory-visibility.ts, memory-eligibility.ts, retrieve-memories.ts, preflight-command.ts, mcp/retrieval.ts, mcp/project.ts | existing suite |
| PM-03 | 3 | Extract shared retrieval engine | implemented | memory-visibility.ts (single gate), dryRun on retrieve | existing suite |
| PM-04 | 4 | V2 retrieval in default protocol | implemented | project-context.ts (default_mode), types.ts, defaults.ts | existing config tests |
| PM-05 | 5 | Non-mutating explain/dry-run | tested | retrieve-memories.ts (dryRun guard), cli/main.ts | existing retrieval tests |
| PM-06 | 6 | Enforceable preflight + agentmem run | tested | cli/main.ts (preflight --enforce, agentmem run) | tests/cli.test.ts, manual smoke |
| PM-07 | 7 | Pack budget selection | implemented | pack-markdown.ts (existing by-section grouping) | existing pack tests |
| PM-08 | 8 | Candidate metadata preservation | tested | candidate-approve.ts (paths/tags from metadata) | existing candidate tests |
| PM-09 | 9 | Vector honesty | implemented | snapshot.md, docs/retrieval.md | existing vector tests |
| PM-10 | 10 | Documentation cleanup | implemented | snapshot.md rewritten for V2 | docs review |
| PM-11 | 11 | Proof harness upgrade | implemented | eval live covers 8 scenarios | existing eval tests |
