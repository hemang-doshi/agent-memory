import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];
const run = promisify(execFile);

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("initProject", () => {
  test("creates a local store and project config without running git init by default", async () => {
    const cwd = await createTempWorkspace("agentmem-init");
    workspaces.push(cwd);

    const result = await initProject({ cwd });

    expect(result.projectId).toMatch(/^proj_/);
    expect(result.gitRoot).toBe(cwd);
    expect(existsSync(`${cwd}/.git`)).toBe(false);
    expect(existsSync(`${cwd}/.agent-memory/memory.db`)).toBe(true);
    expect(existsSync(`${cwd}/.agent-memory/config.json`)).toBe(true);
    expect(result.warning).toContain("not inside a Git repository");

    const config = JSON.parse(
      readFileSync(`${cwd}/.agent-memory/config.json`, "utf8")
    ) as { memory_pack_token_budget: number };

    expect(config.memory_pack_token_budget).toBe(1200);
  });

  test("runs git init only when requested", async () => {
    const cwd = await createTempWorkspace("agentmem-init-git");
    workspaces.push(cwd);

    await initProject({ cwd, gitInit: true });

    expect(existsSync(`${cwd}/.git`)).toBe(true);
    expect(readFileSync(`${cwd}/.git/info/exclude`, "utf8")).toContain(".agent-memory/");
  });

  test("is idempotent when run repeatedly in the same workspace", async () => {
    const cwd = await createTempWorkspace("agentmem-init-repeat");
    workspaces.push(cwd);

    const first = await initProject({ cwd });
    const second = await initProject({ cwd });

    expect(second.projectId).toBe(first.projectId);
    expect(second.storePath).toBe(first.storePath);
  });

  test("does not create project memory state from non-init operations", async () => {
    const cwd = await createTempWorkspace("agentmem-not-init");
    workspaces.push(cwd);

    await expect(generatePack({ cwd, task: "anything" })).rejects.toThrow(
      "Agent Memory is not initialized for this project. Run `agentmem init` first."
    );
    await expect(
      createMemory({ cwd, content: "Use pnpm.", type: "decision", source: "cli" })
    ).rejects.toThrow("Agent Memory is not initialized for this project. Run `agentmem init` first.");
    expect(existsSync(`${cwd}/.agent-memory`)).toBe(false);
    expect(existsSync(`${cwd}/.git`)).toBe(false);
  });

  test("adds agent memory to local git exclude without duplicates", async () => {
    const cwd = await createTempWorkspace("agentmem-git-exclude");
    workspaces.push(cwd);
    await run("git", ["init", "-b", "main"], { cwd });

    await initProject({ cwd });
    await initProject({ cwd });

    const exclude = readFileSync(`${cwd}/.git/info/exclude`, "utf8");
    expect(exclude.match(/^\.agent-memory\/$/gm)).toHaveLength(1);
  });
});
