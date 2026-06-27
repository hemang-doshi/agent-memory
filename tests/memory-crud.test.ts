import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { explainMemory } from "../src/core/explain-memory.js";
import { forgetMemory } from "../src/core/forget-memory.js";
import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
import { markMemoryStale } from "../src/core/mark-memory-stale.js";
import { searchMemories } from "../src/core/search-memories.js";
import { updateMemory } from "../src/core/update-memory.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("memory CRUD", () => {
  test("stores typed memories and searches active records", async () => {
    const cwd = await createTempWorkspace("agentmem-crud");
    workspaces.push(cwd);
    await initProject({ cwd });

    const decision = await createMemory({
      cwd,
      content: "Use reusable component library for reel scenes.",
      type: "decision",
      source: "user_explicit",
      tags: ["design-system"],
      paths: ["src/reel/A04.tsx"]
    });

    await createMemory({
      cwd,
      content: "Do not run npm run render unless explicitly asked.",
      type: "command_policy",
      source: "cli",
      severity: "high",
      metadata: {
        decision: "warn",
        commandPattern: "npm run render",
        matchType: "substring",
        suggestedAction: "Run pnpm test instead."
      }
    });

    const listed = await listMemories({ cwd, type: "decision" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(decision.id);

    const searchResults = await searchMemories({
      cwd,
      query: "component library",
      activeOnly: true
    });

    expect(searchResults[0]?.content).toContain("reusable component library");

    const reorderedSearchResults = await searchMemories({
      cwd,
      query: "library component",
      activeOnly: true
    });
    expect(reorderedSearchResults[0]?.content).toContain("reusable component library");

    const tagResults = await searchMemories({
      cwd,
      query: "design-system",
      activeOnly: true
    });
    expect(tagResults[0]?.id).toBe(decision.id);

    const pathResults = await searchMemories({
      cwd,
      query: "A04.tsx",
      path: "src/reel/A04.tsx",
      activeOnly: true
    });
    expect(pathResults[0]?.id).toBe(decision.id);
  });

  test("search excludes inactive memories by default", async () => {
    const cwd = await createTempWorkspace("agentmem-search-inactive");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Use legacy renderer.",
      type: "decision",
      source: "cli",
      status: "stale"
    });

    expect(await searchMemories({ cwd, query: "legacy renderer", activeOnly: true })).toEqual([]);
    expect(await searchMemories({ cwd, query: "legacy renderer", activeOnly: false })).toHaveLength(1);
  });

  test("marks memories stale and keeps explainability context", async () => {
    const cwd = await createTempWorkspace("agentmem-stale");
    workspaces.push(cwd);
    await initProject({ cwd });

    const memory = await createMemory({
      cwd,
      content: "Use npm for this project.",
      type: "workflow_rule",
      source: "user_explicit"
    });

    await markMemoryStale({
      cwd,
      memoryId: memory.id,
      reason: "Project moved to pnpm."
    });

    const allMemories = await listMemories({ cwd, activeOnly: false });
    expect(allMemories[0]?.status).toBe("stale");

    const explanation = await explainMemory({ cwd, memoryId: memory.id });
    expect(explanation.memory.metadata.staleReason).toBe("Project moved to pnpm.");
    expect(explanation.relatedEvents.some((event) => event.eventType === "memory_marked_stale")).toBe(true);
  });

  test("updates and forgets memories without deleting audit history", async () => {
    const cwd = await createTempWorkspace("agentmem-update-forget");
    workspaces.push(cwd);
    await initProject({ cwd });

    const memory = await createMemory({
      cwd,
      content: "Use npm for package operations.",
      type: "workflow_rule",
      source: "user_explicit"
    });

    const updated = await updateMemory({
      cwd,
      memoryId: memory.id,
      reason: "Project standardized on pnpm.",
      content: "Use pnpm for package operations.",
      pinned: true,
      priority: 2
    });
    expect(updated.content).toBe("Use pnpm for package operations.");
    expect(updated.pinned).toBe(true);
    expect(updated.priority).toBe(2);

    const archived = await forgetMemory({
      cwd,
      memoryId: memory.id,
      reason: "Superseded by a newer package-manager memory."
    });
    expect(archived.status).toBe("archived");

    const allMemories = await listMemories({ cwd, activeOnly: false });
    expect(allMemories[0]?.id).toBe(memory.id);
    expect(allMemories[0]?.status).toBe("archived");

    const explanation = await explainMemory({ cwd, memoryId: memory.id });
    expect(explanation.relatedEvents.some((event) => event.eventType === "memory_updated")).toBe(true);
  });

  test("direct memory writes reject obvious secrets", async () => {
    const cwd = await createTempWorkspace("agentmem-memory-secret");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(
      createMemory({
        cwd,
        content: "api_key=sk-live-secret",
        type: "decision",
        source: "cli"
      })
    ).rejects.toThrow("Candidate rejected by hygiene check: possible secret detected.");
  });

  test("memory updates reject obvious secrets", async () => {
    const cwd = await createTempWorkspace("agentmem-update-secret");
    workspaces.push(cwd);
    await initProject({ cwd });

    const memory = await createMemory({
      cwd,
      content: "Use pnpm for package operations.",
      type: "workflow_rule",
      source: "cli"
    });

    await expect(
      updateMemory({
        cwd,
        memoryId: memory.id,
        reason: "Do not store credentials.",
        content: "token=secret-value"
      })
    ).rejects.toThrow("Candidate rejected by hygiene check: possible secret detected.");
  });

  test("updateMemory rejects type change to command_policy without required metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-update-cmd-policy-invalid");
    workspaces.push(cwd);
    await initProject({ cwd });

    const memory = await createMemory({
      cwd,
      content: "Use pnpm for package operations.",
      type: "workflow_rule",
      source: "cli"
    });

    await expect(
      updateMemory({
        cwd,
        memoryId: memory.id,
        reason: "Make this a command policy.",
        type: "command_policy"
      })
    ).rejects.toThrow("Missing required command policy metadata: commandPattern");
  });

  test("createMemory rejects secrets in metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-meta-secret");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(
      createMemory({
        cwd,
        content: "Use this API carefully.",
        type: "command_policy",
        source: "cli",
        metadata: {
          commandPattern: "curl",
          matchType: "substring",
          decision: "warn",
          suggestedAction: "Use token=abc123 for auth."
        }
      })
    ).rejects.toThrow("possible secret detected in metadata");
  });

  test("createMemory rejects secrets in summary", async () => {
    const cwd = await createTempWorkspace("agentmem-summary-secret");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(
      createMemory({
        cwd,
        content: "Normal content.",
        type: "decision",
        source: "cli",
        summary: "Setup with token=secret-value."
      })
    ).rejects.toThrow("Candidate rejected by hygiene check: possible secret detected.");
  });
});
