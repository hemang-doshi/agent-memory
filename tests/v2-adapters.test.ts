import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  type AdapterName,
  installAdapter,
  listAdapters,
  uninstallAdapter
} from "../src/adapters/index.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

const EXPECTED_TARGETS: Record<AdapterName, string> = {
  codex: "AGENTS.md",
  "claude-code": "CLAUDE.md",
  cursor: ".cursor/rules/agent-memory.mdc",
  "command-code": ".commandcode/taste/agent-memory.md",
  opencode: "AGENTS.md",
  generic: "AGENTS.md"
};

const CODEX_GOLDEN = `Human header.

<!-- agent-memory:adapter:codex:start -->
## Agent Memory Router

Adapter: Codex.

This repo uses Agent Memory as a local-first behavior layer for coding agents.

Default mode: always memory-aware, rarely noisy.

For every task:

1. Start the protocol before planning or editing:

   \`agentmem protocol start "<task>" --json\`

   Use the returned memory pack before deciding what to do. Keep the returned \`sessionId\` for all later Agent Memory commands.

2. Run preflight before risky commands:
   \`agentmem preflight --command "<command>" --session <session-id> --json\`

   Risky commands include install/build/render/migration/delete/network/destructive commands. Do not preflight harmless read-only commands unless they are risky in context.

3. Record evidence only when something meaningful happens:
   \`agentmem event record --session <session-id> --type <type> --summary "..." --json\`

   Good evidence includes test results, command results, user corrections, and reusable observations. Do not record events for trivial observations.

4. Propose memory candidates only for reusable learning:
   \`agentmem candidate propose --session <session-id> --type <type> --content "..." --evidence "..." [--evidence-event <event-id>] --json\`

   Good candidates include failed approaches, successful fixes, agent mistakes, workflow rules, and command-policy candidates. Candidates are untrusted until reviewed.

5. If unsure whether something should become memory, do not interrupt constantly. Collect uncertainty and surface it in a compact manage-memory review:
   \`agentmem manage --plan\`

   Do not run manage mode on every task unless there are memory decisions to review.

6. Finish the session and check compliance before the final response:
   \`agentmem session finish --session <session-id> --summary "..." --json\`
   \`agentmem protocol check --session <session-id> --json\`

For non-trivial work, include a compact protocol compliance summary in the final response.

Safety rules:

* Do not store secrets.
* Do not propose memory for one-off task details.
* Do not record events for trivial observations.
* Do not ask the user after every possible memory.
* Do not create trusted durable memory directly unless an explicit Agent Memory command supports it.
<!-- agent-memory:adapter:codex:end -->
`;

function countMatches(content: string, pattern: RegExp): number {
  return (content.match(pattern) ?? []).length;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("v2 adapters", () => {
  test("lists supported adapters with stable target mappings", () => {
    expect(listAdapters()).toEqual([
      {
        id: "codex",
        adapter: "codex",
        displayName: "Codex",
        targetPath: "AGENTS.md",
        description: "OpenAI Codex project instructions."
      },
      {
        id: "claude-code",
        adapter: "claude-code",
        displayName: "Claude Code",
        targetPath: "CLAUDE.md",
        description: "Claude Code project instructions."
      },
      {
        id: "cursor",
        adapter: "cursor",
        displayName: "Cursor",
        targetPath: ".cursor/rules/agent-memory.mdc",
        description: "Cursor project rule for Agent Memory."
      },
      {
        id: "command-code",
        adapter: "command-code",
        displayName: "Command Code",
        targetPath: ".commandcode/taste/agent-memory.md",
        description: "Command Code taste file for Agent Memory behavior."
      },
      {
        id: "opencode",
        adapter: "opencode",
        displayName: "OpenCode",
        targetPath: "AGENTS.md",
        description: "OpenCode project instructions."
      },
      {
        id: "generic",
        adapter: "generic",
        displayName: "Generic",
        targetPath: "AGENTS.md",
        description: "Generic AGENTS.md project instructions."
      }
    ]);
  });

  test("installs every adapter idempotently with current protocol commands", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-adapters-all");
    workspaces.push(cwd);

    for (const adapter of Object.keys(EXPECTED_TARGETS) as AdapterName[]) {
      const result = await installAdapter({ cwd, adapter });
      await installAdapter({ cwd, adapter });

      expect(result).toMatchObject({
        adapter,
        targetPath: EXPECTED_TARGETS[adapter],
        routerInstalled: true
      });
      expect(result.absolutePath).toBe(join(cwd, EXPECTED_TARGETS[adapter]));

      const content = readFileSync(result.absolutePath, "utf8");
      expect(countMatches(content, new RegExp(`agent-memory:adapter:${adapter}:start`, "g"))).toBe(1);
      expect(countMatches(content, new RegExp(`agent-memory:adapter:${adapter}:end`, "g"))).toBe(1);
      expect(content).toContain('agentmem protocol start "<task>" --json');
      expect(content).toContain("agentmem protocol check --session <session-id> --json");
      expect(content).not.toContain('agentmem session start "<task>" --json');
      expect(content).not.toContain('agentmem pack "<task>" --session <session-id> --json');
    }
  });

  test("generates golden Codex instructions without replacing existing content", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-adapters-golden");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(agentsPath, "Human header.\n");

    await installAdapter({ cwd, adapter: "codex" });

    expect(readFileSync(agentsPath, "utf8")).toBe(CODEX_GOLDEN);
  });

  test("uninstalls only the selected adapter block from a shared target", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-adapters-shared");
    workspaces.push(cwd);

    await installAdapter({ cwd, adapter: "codex" });
    await installAdapter({ cwd, adapter: "generic" });
    await uninstallAdapter({ cwd, adapter: "generic" });

    const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    expect(content).toContain("agent-memory:adapter:codex:start");
    expect(content).toContain("Adapter: Codex.");
    expect(content).not.toContain("agent-memory:adapter:generic:start");
    expect(content).not.toContain("Adapter: Generic.");
  });

  test("uninstall preserves human content around the managed block", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-adapters-preserve");
    workspaces.push(cwd);
    const claudePath = join(cwd, "CLAUDE.md");
    writeFileSync(claudePath, "Human intro.");

    await installAdapter({ cwd, adapter: "claude-code" });
    writeFileSync(claudePath, `${readFileSync(claudePath, "utf8")}\n\nHuman footer.\n`);

    await uninstallAdapter({ cwd, adapter: "claude-code" });

    const content = readFileSync(claudePath, "utf8");
    expect(content).toContain("Human intro.");
    expect(content).toContain("Human footer.");
    expect(content).not.toContain("Agent Memory Router");
    expect(content).not.toContain("agent-memory:adapter:claude-code:start");
  });

  test("uninstall does not create missing adapter target files", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-adapters-missing");
    workspaces.push(cwd);
    const target = join(cwd, EXPECTED_TARGETS["command-code"]);

    const result = await uninstallAdapter({ cwd, adapter: "command-code" });

    expect(result).toMatchObject({
      adapter: "command-code",
      targetPath: EXPECTED_TARGETS["command-code"],
      routerInstalled: false
    });
    expect(existsSync(target)).toBe(false);
  });

  test("rejects unknown adapters", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-adapters-unknown");
    workspaces.push(cwd);

    await expect(installAdapter({ cwd, adapter: "unknown" })).rejects.toThrow(
      "Unknown Agent Memory adapter: unknown."
    );
  });
});
