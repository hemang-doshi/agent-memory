import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("retrieval and preflight", () => {
  test("builds a compact memory pack with prioritized sections", async () => {
    const cwd = await createTempWorkspace("agentmem-pack");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Do not run full renders unless explicitly requested.",
      type: "command_policy",
      source: "user_explicit",
      severity: "high",
      metadata: {
        decision: "warn",
        commandPattern: "render",
        matchType: "substring",
        suggestedAction: "Run pnpm test instead."
      }
    });

    await createMemory({
      cwd,
      content: "Using defineEntry for JSX-child demos failed due to TS limitations.",
      type: "failed_attempt",
      source: "cli",
      tags: ["typescript", "component-browser"]
    });

    await createMemory({
      cwd,
      content: "Use reusable component library for reel scenes.",
      type: "decision",
      source: "user_explicit"
    });

    const pack = await generatePack({
      cwd,
      task: "Implement a reel scene with the component browser"
    });

    expect(pack.markdown).toContain("# Project Memory Pack");
    expect(pack.markdown).toContain("## Relevant Constraints");
    expect(pack.markdown).toContain("## Relevant Decisions");
    expect(pack.markdown).toContain("## Known Failed Attempts");
    expect(pack.markdown.length).toBeLessThan(4000);
  });

  test("warns when a risky command matches project memory", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Do not run npm run render unless explicitly asked.",
      type: "command_policy",
      source: "user_explicit",
      severity: "high",
      metadata: {
        decision: "warn",
        commandPattern: "npm run render",
        matchType: "exact",
        suggestedAction: "Run pnpm test instead."
      }
    });

    const result = await preflightCommand({
      cwd,
      command: "npm run render"
    });

    expect(result.decision).toBe("warn");
    expect(result.message).toContain("Do not run npm run render");
    expect(result.suggestedAction).toBe("Run pnpm test instead.");
  });
});
