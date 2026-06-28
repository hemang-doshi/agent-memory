## Summary

<!-- What does this PR do? One or two sentences. -->

## Motivation

<!-- Why is this change needed? Link related issues with "Fixes #123" or "Refs #123". -->

## Changes

<!-- Bullet points of what changed. -->

## Verification

<!-- Paste the output from running the verification sequence: -->

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm cli --help
pnpm cli eval --json
pnpm cli eval live --json
pnpm cli benchmark run --all --json
node dist/cli/main.js --help
node dist/cli/main.js eval --json
npm pack --dry-run --json
```

- [ ] Typecheck passes
- [ ] All tests pass (31 files, 181 tests)
- [ ] Build passes
- [ ] V1 eval passes (5/5)
- [ ] Live eval passes (8/8)
- [ ] Benchmarks pass (4/4)
- [ ] Package contents valid
- [ ] CLI help matches behavior

## Breaking Changes

<!-- If this PR breaks existing behavior, list what breaks and the migration path. Otherwise "None." -->

## Checklist

- [ ] Tests added or updated for new behavior
- [ ] Documentation updated if behavior changed
- [ ] No hosted services or cloud dependencies introduced
- [ ] No external embedding/LLM calls added by default
- [ ] Security model preserved (visibility gate, secret scanning, MCP read-only default)

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
