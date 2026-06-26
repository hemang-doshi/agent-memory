import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";

import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("project config validation", () => {
  test("malformed JSON fails with a clear error", async () => {
    const cwd = await createTempWorkspace("agentmem-config-malformed");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(`${cwd}/.agent-memory/config.json`, "{");

    await expect(listMemories({ cwd })).rejects.toThrow(
      `Invalid Agent Memory config at ${cwd}/.agent-memory/config.json: malformed JSON.`
    );
  });

  test("partial config merges with defaults", async () => {
    const cwd = await createTempWorkspace("agentmem-config-partial");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(`${cwd}/.agent-memory/config.json`, JSON.stringify({ project_name: "partial" }));

    await expect(listMemories({ cwd })).resolves.toEqual([]);
    expect(existsSync(`${cwd}/.agent-memory/memory.db`)).toBe(true);
    expect(readFileSync(`${cwd}/.agent-memory/config.json`, "utf8")).toContain("partial");
  });

  test("invalid default scope is rejected", async () => {
    const cwd = await createTempWorkspace("agentmem-config-scope");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(
      `${cwd}/.agent-memory/config.json`,
      JSON.stringify({ default_scope: "banana" })
    );

    await expect(listMemories({ cwd })).rejects.toThrow("Invalid memory scope");
  });

  test("invalid preflight default decision is rejected", async () => {
    const cwd = await createTempWorkspace("agentmem-config-decision");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(
      `${cwd}/.agent-memory/config.json`,
      JSON.stringify({ preflight: { default_decision: "block" } })
    );

    await expect(listMemories({ cwd })).rejects.toThrow("Invalid preflight.default_decision");
  });

  test("invalid retrieval max results is rejected", async () => {
    const cwd = await createTempWorkspace("agentmem-config-retrieval");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(
      `${cwd}/.agent-memory/config.json`,
      JSON.stringify({ retrieval: { max_results: 0 } })
    );

    await expect(listMemories({ cwd })).rejects.toThrow("Invalid retrieval.max_results");
  });
});
