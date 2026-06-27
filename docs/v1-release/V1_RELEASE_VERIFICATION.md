# V1 Release Verification

Status: verified locally on 2026-06-27 from `/Users/hemangdoshi/Developer/agent-memory`.

## Environment

- Package: `agent-memory-preflight@1.0.0`
- Package manager: pnpm 11.7.0
- Node.js: local workspace Node runtime with `node:sqlite` support
- Branch: `codex/v1-release-agent-memory`

## Final Checks

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed. Lockfile was up to date. |
| `pnpm typecheck` | Passed: `tsc -p tsconfig.json --noEmit`. |
| `pnpm test` | Passed: 16 test files, 84 tests. |
| `pnpm build` | Passed: `tsc -p tsconfig.build.json`. |
| `pnpm cli --help` | Passed. Help includes `add`, `retrieve`, `inject`, `event record`, `eval`, `update`, and `forget`. |
| `pnpm cli eval --json` | Passed: 5 local deterministic eval checks. |
| `node dist/cli/main.js --help` | Passed. |
| `node dist/cli/main.js eval --json` | Passed. |
| `npm pack --dry-run --json` | Passed: `agent-memory-preflight@1.0.0`, 45 files, required release docs and `dist/**` only. |
| Packed CLI smoke | Passed. Installed packed tarball in a clean npm project, ran `npx agentmem --help`, and ran `npx agentmem eval --json` with 5 passing checks. |
| README quickstart smoke | Passed from a clean temporary workspace using built `dist/cli/main.js`; `init`, `install-instructions`, `add`, `retrieve`, `inject`, and `preflight` completed, and retrieval matched 1 memory. |
| Avoid repeated mistake smoke | Passed from a clean temporary workspace using built `dist/cli/main.js`; saved the pnpm rule, injected it before a dependency task, added an `npm install` command policy, and preflight returned `block` with `Use pnpm add instead.` |
| Docs deferred-feature scan | Passed. Mentions of hosted sync, MCP, vector search, and cloud sync are labeled as not included or deferred. |
| `git diff --check` | Passed. |

## Eval Coverage

`agentmem eval --json` passed these deterministic local checks:

- basic retrieval
- pinned inclusion
- conflict handling
- secret redaction
- context delta

The Vitest V1 eval suite also covers:

- basic retrieval
- project scoping
- pinned memory inclusion
- mistake/regression retrieval
- secret-like write rejection and blocked-memory exclusion
- packet markdown/JSON goldens
- superseded/conflict-group handling
- with-memory vs without-memory context delta

## Package Contents

The final dry-run tarball contains:

- `package.json`
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- built `dist/**`

The package validation rejects source, tests, benchmark fixtures, docs, GitHub configuration, local agent files, and untracked local workspace files.

## Notes

- The package version is intentionally set to `1.0.0` after release gates passed.
- The package name remains `agent-memory-preflight`; the CLI binary remains `agentmem`.
- V1 remains local-first and deterministic. Hosted sync, MCP server, dashboard, default vector search, default LLM reranking, and hard command blocking are intentionally not included.
- The worktree still has pre-existing untracked local files `.commandcode/` and `AGENTS.md`; they are not part of the V1 release changes.
