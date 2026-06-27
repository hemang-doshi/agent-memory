import { afterEach, describe, expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { createMemory } from "../src/core/create-memory.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { retrieveMemories } from "../src/core/retrieve-memories.js";
import { MEMORY_TYPES } from "../src/domain/types.js";
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
      task: "Implement a reel scene with the component browser and avoid full renders"
    });

    expect(pack.markdown).toContain("# Project Memory Pack");
    expect(pack.markdown).toContain("## Critical Constraints");
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

  test("chooses the strongest matching preflight policy", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-ranking");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Warn before rendering.",
      type: "command_policy",
      source: "user_explicit",
      severity: "high",
      metadata: { decision: "warn", commandPattern: "render", matchType: "substring" }
    });
    await createMemory({
      cwd,
      content: "Block exact render command.",
      type: "command_policy",
      source: "user_explicit",
      severity: "low",
      metadata: { decision: "block", commandPattern: "npm run render", matchType: "exact" }
    });

    const result = await preflightCommand({ cwd, command: "npm run render" });
    expect(result.decision).toBe("block");
    expect(result.message).toBe("Block exact render command.");
    expect(result.matchedMemoryIds).toHaveLength(2);
  });

  test("warn beats allow and exact beats substring when decisions are equal", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-ties");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Allow render generally.",
      type: "command_policy",
      source: "user_explicit",
      metadata: { decision: "allow", commandPattern: "render", matchType: "substring" }
    });
    await createMemory({
      cwd,
      content: "Warn render generally.",
      type: "command_policy",
      source: "user_explicit",
      metadata: { decision: "warn", commandPattern: "render", matchType: "substring" }
    });
    await createMemory({
      cwd,
      content: "Warn exact render.",
      type: "command_policy",
      source: "user_explicit",
      metadata: { decision: "warn", commandPattern: "npm run render", matchType: "exact" }
    });

    const result = await preflightCommand({ cwd, command: "npm run render" });
    expect(result.decision).toBe("warn");
    expect(result.message).toBe("Warn exact render.");
  });

  test("ignores stale archived and rejected policies", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-status");
    workspaces.push(cwd);
    await initProject({ cwd });

    for (const status of ["stale", "archived", "rejected"] as const) {
      await createMemory({
        cwd,
        content: `Ignored ${status} policy.`,
        type: "command_policy",
        source: "user_explicit",
        status,
        metadata: { decision: "block", commandPattern: "render", matchType: "substring" }
      });
    }

    const result = await preflightCommand({ cwd, command: "npm run render" });
    expect(result.decision).toBe("allow");
    expect(result.matchedMemoryIds).toEqual([]);
  });

  test("ignores unsafe agent-invisible command policies during preflight", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-unsafe");
    workspaces.push(cwd);
    await initProject({ cwd });

    const unsafePolicies = [
      { content: "Redacted policy.", redactionStatus: "redacted" as const },
      { content: "Blocked policy.", redactionStatus: "blocked" as const },
      { content: "Secret policy.", safetyFlags: ["secret"] },
      { content: "Superseded policy.", status: "superseded" as const },
      { content: "Expired policy.", expiresAt: "2020-01-01T00:00:00.000Z" },
      { content: "Do not include policy.", metadata: { doNotInclude: true } }
    ];

    for (const policy of unsafePolicies) {
      await createMemory({
        cwd,
        content: policy.content,
        type: "command_policy",
        source: "user_explicit",
        status: policy.status ?? "active",
        redactionStatus: policy.redactionStatus ?? "none",
        safetyFlags: policy.safetyFlags ?? [],
        expiresAt: policy.expiresAt ?? null,
        metadata: {
          decision: "block",
          commandPattern: "npm install",
          matchType: "substring",
          ...(policy.metadata ?? {})
        }
      });
    }

    const result = await preflightCommand({ cwd, command: "npm install zod" });
    expect(result.decision).toBe("allow");
    expect(result.matchedMemoryIds).toEqual([]);
  });

  test("preflight still matches safe active command policies", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-safe-control");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Block npm install because this repo uses pnpm.",
      type: "command_policy",
      source: "user_explicit",
      metadata: {
        decision: "block",
        commandPattern: "npm install",
        matchType: "substring",
        suggestedAction: "Use pnpm add instead."
      }
    });

    const result = await preflightCommand({ cwd, command: "npm install zod" });
    expect(result.decision).toBe("block");
    expect(result.matchedMemoryIds).toHaveLength(1);
    expect(result.suggestedAction).toBe("Use pnpm add instead.");
  });

  test("invalid stored regex does not crash preflight", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-regex");
    workspaces.push(cwd);
    await initProject({ cwd });
    const policy = await createMemory({
      cwd,
      content: "Legacy bad regex policy.",
      type: "command_policy",
      source: "user_explicit",
      metadata: { decision: "block", commandPattern: "render", matchType: "substring" }
    });
    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    db.prepare("UPDATE memories SET metadata_json = ? WHERE id = ?").run(
      JSON.stringify({ decision: "block", commandPattern: "[", matchType: "regex" }),
      policy.id
    );
    db.close();

    const result = await preflightCommand({ cwd, command: "npm run render" });
    expect(result.decision).toBe("allow");
  });

  test("preflight disabled returns allow without policy checks", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-disabled");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(
      `${cwd}/.agent-memory/config.json`,
      JSON.stringify({ preflight: { enabled: false } })
    );

    const result = await preflightCommand({ cwd, command: "npm run render" });
    expect(result).toEqual({
      decision: "allow",
      reason: "Preflight disabled in project config.",
      message: "No command policy checks were run.",
      matchedMemoryIds: []
    });
  });

  test("retrieval requires actual relevance signals", async () => {
    const cwd = await createTempWorkspace("agentmem-relevance");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Block destructive deploy command.",
      type: "command_policy",
      source: "user_explicit",
      severity: "high",
      metadata: { decision: "block", commandPattern: "deploy --prod", matchType: "exact" }
    });
    await createMemory({
      cwd,
      content: "Using npm install caused lockfile drift.",
      type: "failed_attempt",
      source: "cli"
    });
    await createMemory({
      cwd,
      content: "src/core/context.ts has fragile initialization behavior.",
      type: "fragile_file",
      source: "cli",
      paths: ["src/core/context.ts"]
    });
    await createMemory({
      cwd,
      content: "Unverified pnpm rule.",
      type: "workflow_rule",
      source: "cli",
      status: "unverified"
    });
    await createMemory({
      cwd,
      content: "Stale pnpm rule.",
      type: "workflow_rule",
      source: "cli",
      status: "stale"
    });

    const taskMatches = await retrieveMemories({ cwd, task: "avoid lockfile drift" });
    expect(taskMatches.map((memory) => memory.content)).toContain(
      "Using npm install caused lockfile drift."
    );
    expect(taskMatches.map((memory) => memory.content)).not.toContain(
      "Block destructive deploy command."
    );
    expect(taskMatches.map((memory) => memory.content)).not.toContain("Unverified pnpm rule.");
    expect(taskMatches.map((memory) => memory.content)).not.toContain("Stale pnpm rule.");

    const pathMatches = await retrieveMemories({
      cwd,
      task: "initialize safely",
      files: ["src/core/context.ts"]
    });
    expect(pathMatches.map((memory) => memory.content)).toContain(
      "src/core/context.ts has fragile initialization behavior."
    );
  });

  test("retrieval includes pinned memories and records score/use metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-retrieval-pinned");
    workspaces.push(cwd);
    await initProject({ cwd });

    const pinned = await createMemory({
      cwd,
      content: "Always use pnpm in this repository.",
      type: "workflow_rule",
      source: "user_explicit",
      pinned: true,
      priority: 2
    });
    await createMemory({
      cwd,
      content: "Use route handlers for API endpoints.",
      type: "architecture_note",
      source: "cli"
    });

    const results = await retrieveMemories({ cwd, task: "implement a database migration" });
    const matchedPinned = results.find((memory) => memory.id === pinned.id);
    expect(matchedPinned?.metadata.retrieval).toMatchObject({
      reason: expect.stringContaining("pinned")
    });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    const row = db
      .prepare("SELECT use_count, last_retrieved_at FROM memories WHERE id = ?")
      .get(pinned.id) as { use_count: number; last_retrieved_at: string | null };
    db.close();
    expect(row.use_count).toBe(1);
    expect(row.last_retrieved_at).toEqual(expect.any(String));
  });

  test("retrieval guarantees pinned and priority memories before normal matches under limit", async () => {
    const cwd = await createTempWorkspace("agentmem-retrieval-guaranteed");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Pinned repository rule with no query overlap.",
      type: "workflow_rule",
      source: "user_explicit",
      pinned: true
    });
    await createMemory({
      cwd,
      content: "High priority repository rule with no query overlap.",
      type: "workflow_rule",
      source: "user_explicit",
      priority: 3
    });

    for (let index = 0; index < 5; index += 1) {
      await createMemory({
        cwd,
        content: `database migration query overlap regular ${index}`,
        type: "decision",
        source: "cli"
      });
    }

    const results = await retrieveMemories({
      cwd,
      task: "database migration query overlap",
      maxResults: 2
    });

    expect(results.map((memory) => memory.content)).toEqual([
      "Pinned repository rule with no query overlap.",
      "High priority repository rule with no query overlap."
    ]);
  });

  test("retrieval excludes blocked and redacted memories from packs", async () => {
    const cwd = await createTempWorkspace("agentmem-retrieval-redacted");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Visible package manager rule.",
      type: "workflow_rule",
      source: "user_explicit"
    });
    await createMemory({
      cwd,
      content: "Redacted token sentinel should never appear.",
      type: "workflow_rule",
      source: "user_explicit",
      redactionStatus: "redacted",
      priority: 5
    });

    const pack = await generatePack({ cwd, task: "package manager token sentinel" });
    expect(pack.markdown).toContain("Visible package manager rule.");
    expect(pack.markdown).not.toContain("Redacted token sentinel");
    expect(JSON.stringify(pack.sections)).not.toContain("Redacted token sentinel");
  });

  test("retrieval suppresses superseded and lower-ranked conflict memories", async () => {
    const cwd = await createTempWorkspace("agentmem-retrieval-conflicts");
    workspaces.push(cwd);
    await initProject({ cwd });

    const oldRule = await createMemory({
      cwd,
      content: "Use npm for package installs.",
      type: "workflow_rule",
      source: "cli",
      tags: ["package-manager"]
    });
    await createMemory({
      cwd,
      content: "Use pnpm for package installs.",
      type: "workflow_rule",
      source: "user_explicit",
      tags: ["package-manager"],
      supersedesMemoryId: oldRule.id
    });
    await createMemory({
      cwd,
      content: "Prefer npm scripts for test runs.",
      type: "workflow_rule",
      source: "cli",
      tags: ["tests"],
      conflictGroup: "test-runner",
      priority: 0
    });
    await createMemory({
      cwd,
      content: "Prefer pnpm for test runs.",
      type: "workflow_rule",
      source: "user_explicit",
      tags: ["tests"],
      conflictGroup: "test-runner",
      priority: 2
    });

    const results = await retrieveMemories({ cwd, task: "package-manager tests" });
    const contents = results.map((memory) => memory.content);
    expect(contents).toContain("Use pnpm for package installs.");
    expect(contents).not.toContain("Use npm for package installs.");
    expect(contents).toContain("Prefer pnpm for test runs.");
    expect(contents).not.toContain("Prefer npm scripts for test runs.");
  });

  test("pack includes every supported memory type", async () => {
    const cwd = await createTempWorkspace("agentmem-pack-types");
    workspaces.push(cwd);
    await initProject({ cwd });
    writeFileSync(
      `${cwd}/.agent-memory/config.json`,
      JSON.stringify({ retrieval: { max_results: MEMORY_TYPES.length }, memory_pack_token_budget: 3000 })
    );

    for (const type of MEMORY_TYPES) {
      await createMemory({
        cwd,
        content: `shared-token content for ${type}`,
        type,
        source: "cli",
        metadata:
          type === "command_policy"
            ? { decision: "warn", commandPattern: "shared-token", matchType: "substring" }
            : {}
      });
    }

    const pack = await generatePack({ cwd, task: "shared-token" });
    for (const type of MEMORY_TYPES) {
      expect(pack.markdown).toContain(`shared-token content for ${type}`);
    }
  });
});
