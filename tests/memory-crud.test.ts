import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { explainMemory } from "../src/core/explain-memory.js";
import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
import { markMemoryStale } from "../src/core/mark-memory-stale.js";
import { searchMemories } from "../src/core/search-memories.js";
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
});
