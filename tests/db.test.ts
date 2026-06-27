import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
import { openDatabase } from "../src/db/database.js";
import { AgentMemoryRepository } from "../src/db/repository.js";
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

    expect(version?.value).toBe("2");
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "idx_memories_project_created",
        "idx_events_project_timestamp",
        "idx_projects_git_root"
      ])
    );
  });

  test("migrates existing v1 memory tables with additive retrieval metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-db-migrate");
    workspaces.push(cwd);
    const dbPath = `${cwd}/memory.db`;
    const oldDb = new DatabaseSync(dbPath);
    oldDb.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        scope TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL,
        confidence TEXT NOT NULL,
        source TEXT NOT NULL,
        paths_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        severity TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        expires_at TEXT,
        related_memory_ids_json TEXT NOT NULL,
        supersedes_memory_id TEXT,
        metadata_json TEXT NOT NULL
      );
      INSERT INTO memories (
        id, project_id, scope, type, content, summary, status, confidence, source,
        paths_json, tags_json, severity, created_at, updated_at, last_used_at,
        expires_at, related_memory_ids_json, supersedes_memory_id, metadata_json
      ) VALUES (
        'mem_old', 'proj_old', 'project', 'decision', 'Preserve old memory.',
        NULL, 'active', 'high', 'cli', '[]', '[]', 'medium',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
        NULL, NULL, '[]', NULL, '{}'
      );
    `);
    oldDb.close();

    const migrated = openDatabase(dbPath);
    const version = migrated
      .prepare("SELECT value FROM schema_meta WHERE key = ?")
      .get("schema_version") as { value: string } | undefined;
    const columns = migrated
      .prepare("PRAGMA table_info(memories)")
      .all() as { name: string }[];
    const repo = new AgentMemoryRepository(migrated);
    const memories = repo.listMemories("proj_old");
    migrated.close();

    expect(version?.value).toBe("2");
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "pinned",
        "priority",
        "use_count",
        "last_retrieved_at",
        "last_injected_at",
        "conflict_group",
        "safety_flags_json",
        "redaction_status"
      ])
    );
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({
      id: "mem_old",
      content: "Preserve old memory.",
      pinned: false,
      priority: 0,
      useCount: 0,
      lastRetrievedAt: null,
      lastInjectedAt: null,
      conflictGroup: null,
      safetyFlags: [],
      redactionStatus: "none"
    });
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
