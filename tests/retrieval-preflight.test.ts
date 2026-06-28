import { afterEach, describe, expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { createMemory } from "../src/core/create-memory.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { getKeywordIndexHealth, rebuildKeywordIndex } from "../src/core/keyword-index.js";
import { loadProject } from "../src/core/context.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { retrieveMemories } from "../src/core/retrieve-memories.js";
import { updateMemory } from "../src/core/update-memory.js";
import { MEMORY_TYPES } from "../src/domain/types.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("retrieval and preflight", () => {
  test("rebuilds and searches the keyword index from stored memory fields", async () => {
    const cwd = await createTempWorkspace("agentmem-keyword-index");
    workspaces.push(cwd);
    await initProject({ cwd });

    const lexical = await createMemory({
      cwd,
      content: "Use durable queue workers for invoice reconciliation.",
      summary: "Sidecar worker handles replay-safe invoice jobs.",
      type: "architecture_note",
      source: "cli",
      tags: ["shoreline"],
      paths: ["src/billing/reconciler.ts"],
      metadata: { indexProbe: "zephyrmarker" }
    });
    await createMemory({
      cwd,
      content: "Prefer pnpm for package manager operations.",
      type: "workflow_rule",
      source: "user_explicit",
      tags: ["package-manager"],
      paths: ["package.json"],
      metadata: { indexProbe: "differentmarker" }
    });

    await rebuildKeywordIndex({ cwd });

    await expect(getKeywordIndexHealth({ cwd })).resolves.toEqual({
      indexedMemories: 2,
      eligibleMemories: 2,
      stale: false
    });

    const loaded = await loadProject(cwd);
    try {
      expect(
        loaded.repo.searchKeywordIndex(loaded.project.projectId, "durable", 5)[0]?.memoryId
      ).toBe(lexical.id);
      expect(
        loaded.repo.searchKeywordIndex(loaded.project.projectId, "sidecar", 5)[0]?.memoryId
      ).toBe(lexical.id);
      expect(
        loaded.repo.searchKeywordIndex(loaded.project.projectId, "shoreline", 5)[0]?.memoryId
      ).toBe(lexical.id);
      expect(
        loaded.repo.searchKeywordIndex(loaded.project.projectId, "reconciler", 5)[0]?.memoryId
      ).toBe(lexical.id);
      expect(
        loaded.repo.searchKeywordIndex(loaded.project.projectId, "zephyrmarker", 5)[0]?.memoryId
      ).toBe(lexical.id);
    } finally {
      loaded.close();
    }
  });

  test("keeps the keyword index fresh when memories are created or updated", async () => {
    const cwd = await createTempWorkspace("agentmem-keyword-index-fresh");
    workspaces.push(cwd);
    await initProject({ cwd });

    const memory = await createMemory({
      cwd,
      content: "Initial checkout workflow uses a temporary marker.",
      type: "workflow_rule",
      source: "cli",
      metadata: { indexProbe: "beforemarker" }
    });

    const loadedAfterCreate = await loadProject(cwd);
    try {
      expect(
        loadedAfterCreate.repo.searchKeywordIndex(
          loadedAfterCreate.project.projectId,
          "beforemarker",
          5
        )[0]?.memoryId
      ).toBe(memory.id);
      expect(loadedAfterCreate.repo.getKeywordIndexHealth(loadedAfterCreate.project.projectId)).toEqual({
        indexedMemories: 1,
        eligibleMemories: 1,
        stale: false
      });
    } finally {
      loadedAfterCreate.close();
    }

    await updateMemory({
      cwd,
      memoryId: memory.id,
      reason: "Change indexed content marker.",
      content: "Updated checkout workflow uses aftermarker for validation."
    });

    const loadedAfterUpdate = await loadProject(cwd);
    try {
      expect(
        loadedAfterUpdate.repo.searchKeywordIndex(
          loadedAfterUpdate.project.projectId,
          "aftermarker",
          5
        )[0]?.memoryId
      ).toBe(memory.id);
      expect(
        loadedAfterUpdate.repo.searchKeywordIndex(
          loadedAfterUpdate.project.projectId,
          "Initial",
          5
        )
      ).toEqual([]);
      expect(loadedAfterUpdate.repo.getKeywordIndexHealth(loadedAfterUpdate.project.projectId)).toEqual({
        indexedMemories: 1,
        eligibleMemories: 1,
        stale: false
      });
    } finally {
      loadedAfterUpdate.close();
    }
  });

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
    expect(result.decision).toBe("warn");
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
    expect(result.decision).toBe("warn");
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

  test("preflight ignores command policies superseded by another memory relation", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-relation-superseded");
    workspaces.push(cwd);
    await initProject({ cwd });

    const oldPolicy = await createMemory({
      cwd,
      content: "Block npm install until the package policy is clarified.",
      type: "command_policy",
      source: "user_explicit",
      metadata: {
        decision: "block",
        commandPattern: "npm install",
        matchType: "substring"
      }
    });

    const replacement = await createMemory({
      cwd,
      content: "Warn on npm install because this repo prefers pnpm.",
      type: "command_policy",
      source: "user_explicit",
      supersedesMemoryId: oldPolicy.id,
      metadata: {
        decision: "warn",
        commandPattern: "npm install",
        matchType: "substring",
        suggestedAction: "Use pnpm add instead."
      }
    });

    const result = await preflightCommand({ cwd, command: "npm install zod" });
    expect(result.decision).toBe("warn");
    expect(result.matchedMemoryIds).toEqual([replacement.id]);
    expect(result.message).toBe("Warn on npm install because this repo prefers pnpm.");
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
    expect(result.decision).toBe("warn");
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

  test("retrieval modes support keyword and hybrid without changing deterministic default", async () => {
    const cwd = await createTempWorkspace("agentmem-retrieval-modes");
    workspaces.push(cwd);
    await initProject({ cwd });

    const deterministic = await createMemory({
      cwd,
      content: "Use pnpm for package installation.",
      type: "workflow_rule",
      source: "user_explicit",
      tags: ["package-manager"]
    });
    const keywordOnly = await createMemory({
      cwd,
      content: "Store billing retry notes near the reconciler.",
      type: "architecture_note",
      source: "cli",
      metadata: { retrievalProbe: "auroramarker" }
    });

    const defaultResults = await retrieveMemories({ cwd, task: "package-manager" });
    expect(defaultResults.map((memory) => memory.id)).toContain(deterministic.id);
    expect(defaultResults.map((memory) => memory.id)).not.toContain(keywordOnly.id);

    const keywordResults = await retrieveMemories({
      cwd,
      task: "auroramarker",
      mode: "keyword"
    });
    expect(keywordResults.map((memory) => memory.id)).toEqual([keywordOnly.id]);
    expect(keywordResults[0]?.metadata.retrieval).toMatchObject({
      mode: "keyword",
      reason: expect.stringContaining("keyword match"),
      signals: expect.objectContaining({ keywordMatch: true })
    });

    const hybridResults = await retrieveMemories({
      cwd,
      task: "package-manager auroramarker",
      mode: "hybrid"
    });
    expect(new Set(hybridResults.map((memory) => memory.id)).size).toBe(hybridResults.length);
    expect(hybridResults.map((memory) => memory.id)).toEqual(
      expect.arrayContaining([deterministic.id, keywordOnly.id])
    );
    expect(hybridResults.map((memory) => memory.metadata.retrieval)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "hybrid" })
      ])
    );
  });

  test("vector retrieval uses the local vector index", async () => {
    const cwd = await createTempWorkspace("agentmem-retrieval-vector");
    workspaces.push(cwd);
    await initProject({ cwd });

    const memory = await createMemory({
      cwd,
      content: "Billing retry reconciliation uses idempotent queue workers.",
      type: "architecture_note",
      source: "user_explicit"
    });

    const results = await retrieveMemories({
      cwd,
      task: "billing retry queue",
      mode: "vector",
      maxResults: 1
    });
    expect(results.map((item) => item.id)).toEqual([memory.id]);
    expect(results[0]?.metadata.retrieval).toMatchObject({
      mode: "vector",
      reason: expect.stringContaining("vector match")
    });
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

  test("preflight respects configured default_decision when no policy matches", async () => {
    const cwd = await createTempWorkspace("agentmem-preflight-default-decision");
    workspaces.push(cwd);
    await initProject({ cwd });

    // Default config default_decision is "warn" — verify warn
    let result = await preflightCommand({ cwd, command: "npm run test" });
    expect(result.decision).toBe("warn");
    expect(result.reason).toContain("warn");

    // Change to "allow" via config
    writeFileSync(
      `${cwd}/.agent-memory/config.json`,
      JSON.stringify({ preflight: { default_decision: "allow" } })
    );
    result = await preflightCommand({ cwd, command: "npm run test" });
    expect(result.decision).toBe("allow");
    expect(result.reason).toContain("allow");
  });
});
