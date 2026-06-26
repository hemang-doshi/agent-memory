import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("database hygiene", () => {
  test("initializes schema metadata and indexes", async () => {
    const cwd = await createTempWorkspace("agentmem-db-schema");
    workspaces.push(cwd);
    await initProject({ cwd });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    const version = db
      .prepare("SELECT value FROM schema_meta WHERE key = ?")
      .get("schema_version") as { value: string } | undefined;
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as { name: string }[];
    db.close();

    expect(version?.value).toBe("1");
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "idx_memories_project_created",
        "idx_events_project_timestamp",
        "idx_projects_git_root"
      ])
    );
  });

  test("corrupt JSON fields fail with a clear error", async () => {
    const cwd = await createTempWorkspace("agentmem-db-corrupt");
    workspaces.push(cwd);
    await initProject({ cwd });
    const memory = await createMemory({
      cwd,
      content: "Use pnpm.",
      type: "decision",
      source: "cli"
    });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    db.prepare("UPDATE memories SET tags_json = ? WHERE id = ?").run("{", memory.id);
    db.close();

    await expect(listMemories({ cwd })).rejects.toThrow(
      "Corrupt Agent Memory database JSON field: memories.tags_json"
    );
  });
});
