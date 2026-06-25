import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";

import { initProject } from "../src/core/init-project.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("initProject", () => {
  test("creates a git-backed local store and project config", async () => {
    const cwd = await createTempWorkspace("agentmem-init");
    workspaces.push(cwd);

    const result = await initProject({ cwd });

    expect(result.projectId).toMatch(/^proj_/);
    expect(result.gitRoot).toBe(cwd);
    expect(existsSync(`${cwd}/.git`)).toBe(true);
    expect(existsSync(`${cwd}/.agent-memory/memory.db`)).toBe(true);
    expect(existsSync(`${cwd}/.agent-memory/config.json`)).toBe(true);

    const config = JSON.parse(
      readFileSync(`${cwd}/.agent-memory/config.json`, "utf8")
    ) as { memory_pack_token_budget: number };

    expect(config.memory_pack_token_budget).toBe(1200);
  });

  test("is idempotent when run repeatedly in the same workspace", async () => {
    const cwd = await createTempWorkspace("agentmem-init-repeat");
    workspaces.push(cwd);

    const first = await initProject({ cwd });
    const second = await initProject({ cwd });

    expect(second.projectId).toBe(first.projectId);
    expect(second.storePath).toBe(first.storePath);
  });
});
