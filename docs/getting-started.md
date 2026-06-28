# Getting Started

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm cli init
pnpm cli add "Use pnpm for package operations." --type workflow_rule --tag package-manager
pnpm cli index --rebuild --json
pnpm cli retrieve "package operations" --mode hybrid --explain --json
```

For an agent workflow, start with:

```bash
pnpm cli protocol start "Implement feature" --json
```

Use the returned memory pack before planning, run `preflight` before risky commands, record meaningful evidence, propose reusable candidates, then finish the session and run `protocol check`.

