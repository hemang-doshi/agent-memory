import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ProjectMindScenario {
  name: string;
  passed: boolean;
  noMemory: Record<string, unknown>;
  withMemory: Record<string, unknown>;
  delta: string;
}

export interface ProjectMindResult {
  name: string;
  passed: boolean;
  summary: { passed: number; failed: number };
  scenarios: ProjectMindScenario[];
  limitations: string[];
}

async function tempWorkspace(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return dir;
}

async function cleanup(workspaces: string[]): Promise<void> {
  await Promise.all(workspaces.map((dir) => rm(dir, { recursive: true, force: true })));
}

export async function runProjectMindEval(): Promise<ProjectMindResult> {
  const limitations = [
    "Each scenario creates isolated temp projects — does not pollute the user's store.",
    "This is a deterministic local harness; it does not invoke external coding agents.",
    "Claims are limited to observed behavior deltas, not universal agent improvement."
  ];
  const workspaces: string[] = [];
  const scenarios: ProjectMindScenario[] = [];

  try {
    const { initProject } = await import("../../core/init-project.js");
    const { createMemory } = await import("../../core/create-memory.js");
    const { retrieveMemories } = await import("../../core/retrieve-memories.js");
    const { preflightCommand } = await import("../../core/preflight-command.js");
    const { quarantineMemory } = await import("../../safety/quarantine.js");

    // Scenario 1: package-manager-policy
    {
      const noMemoryCwd = await tempWorkspace("pm-no-mem-");
      workspaces.push(noMemoryCwd);
      await initProject({ cwd: noMemoryCwd });
      const withMemoryCwd = await tempWorkspace("pm-with-mem-");
      workspaces.push(withMemoryCwd);
      await initProject({ cwd: withMemoryCwd });
      await createMemory({
        cwd: withMemoryCwd,
        content: "Do not run npm install. Use pnpm install instead.",
        type: "command_policy",
        source: "user_explicit",
        metadata: {
          commandPattern: "npm install",
          matchType: "substring",
          decision: "block",
          suggestedAction: "Use pnpm install"
        }
      });

      const noMem = await preflightCommand({ cwd: noMemoryCwd, command: "npm install lodash" });
      const withMem = await preflightCommand({ cwd: withMemoryCwd, command: "npm install lodash" });

      scenarios.push({
        name: "package-manager-policy",
        passed: noMem.decision !== "block" && withMem.decision === "block" && withMem.matchedMemoryIds.length > 0,
        noMemory: { decision: noMem.decision },
        withMemory: { decision: withMem.decision, matchedMemoryIds: withMem.matchedMemoryIds },
        delta: withMem.decision !== noMem.decision ? "memory changed preflight decision from allow/warn to block" : "no delta"
      });
    }

    // Scenario 2: fragile-file
    {
      const noMemoryCwd = await tempWorkspace("ff-no-mem-");
      workspaces.push(noMemoryCwd);
      await initProject({ cwd: noMemoryCwd });
      const withMemoryCwd = await tempWorkspace("ff-with-mem-");
      workspaces.push(withMemoryCwd);
      await initProject({ cwd: withMemoryCwd });
      await createMemory({
        cwd: withMemoryCwd,
        content: "src/router.ts is fragile — editing it requires running full regression suite.",
        type: "fragile_file",
        source: "user_explicit",
        paths: ["src/router.ts"],
        severity: "high"
      });

      const noMem = await retrieveMemories({ cwd: noMemoryCwd, task: "edit a CSS file", dryRun: true });
      const withMem = await retrieveMemories({ cwd: withMemoryCwd, task: "add a route to src/router.ts", dryRun: true });
      const hasFragile = withMem.some((m) => m.type === "fragile_file" && m.paths.includes("src/router.ts"));

      scenarios.push({
        name: "fragile-file",
        passed: !noMem.some((m) => m.type === "fragile_file") && hasFragile,
        noMemory: { memoryCount: noMem.length },
        withMemory: { memoryCount: withMem.length, includesFragileFile: hasFragile },
        delta: hasFragile ? "fragile file surfaced when task references file" : "no delta"
      });
    }

    // Scenario 3: failed-approach
    {
      const noMemoryCwd = await tempWorkspace("fa-no-mem-");
      workspaces.push(noMemoryCwd);
      await initProject({ cwd: noMemoryCwd });
      const withMemoryCwd = await tempWorkspace("fa-with-mem-");
      workspaces.push(withMemoryCwd);
      await initProject({ cwd: withMemoryCwd });
      await createMemory({
        cwd: withMemoryCwd,
        content: "Do not fix auth by editing middleware directly. Use the token refresh utility.",
        type: "failed_attempt",
        source: "user_explicit",
        severity: "high"
      });

      const noMem = await retrieveMemories({ cwd: noMemoryCwd, task: "update README", dryRun: true });
      const withMem = await retrieveMemories({ cwd: withMemoryCwd, task: "fix auth session refresh bug", dryRun: true });
      const hasFailed = withMem.some((m) => m.type === "failed_attempt");

      scenarios.push({
        name: "failed-approach",
        passed: !noMem.some((m) => m.type === "failed_attempt") && hasFailed,
        noMemory: { memoryCount: noMem.length },
        withMemory: { memoryCount: withMem.length, includesFailedAttempt: hasFailed },
        delta: hasFailed ? "failed attempt surfaced for similar task" : "no delta"
      });
    }

    // Scenario 4: unsafe-exclusion
    {
      const cwd = await tempWorkspace("ue-mem-");
      workspaces.push(cwd);
      await initProject({ cwd });
      const mem = await createMemory({
        cwd,
        content: "API key test value that should be quarantined.",
        type: "decision",
        source: "user_explicit"
      });
      await quarantineMemory({ cwd, memoryId: mem.id, reason: "Contains test secret" });
      const results = await retrieveMemories({ cwd, task: "API key", dryRun: true });
      const excluded = !results.some((m) => m.id === mem.id);

      scenarios.push({
        name: "unsafe-exclusion",
        passed: excluded,
        noMemory: {},
        withMemory: { retrievedCount: results.length, memoryExcluded: excluded },
        delta: "quarantined memory excluded from retrieval"
      });
    }

    // Scenario 5: architecture-decision
    {
      const noMemoryCwd = await tempWorkspace("ad-no-mem-");
      workspaces.push(noMemoryCwd);
      await initProject({ cwd: noMemoryCwd });
      const withMemoryCwd = await tempWorkspace("ad-with-mem-");
      workspaces.push(withMemoryCwd);
      await initProject({ cwd: withMemoryCwd });
      await createMemory({
        cwd: withMemoryCwd,
        content: "Use repository layer; no direct DB access from route handlers.",
        type: "architecture_note",
        source: "user_explicit",
        severity: "high"
      });

      const noMem = await retrieveMemories({ cwd: noMemoryCwd, task: "update package.json", dryRun: true });
      const withMem = await retrieveMemories({ cwd: withMemoryCwd, task: "add direct DB query to the user route handler", dryRun: true });
      const hasDecision = withMem.some((m) => m.type === "architecture_note");

      scenarios.push({
        name: "architecture-decision",
        passed: !noMem.some((m) => m.type === "architecture_note") && hasDecision,
        noMemory: { memoryCount: noMem.length },
        withMemory: { memoryCount: withMem.length, includesArchitectureNote: hasDecision },
        delta: hasDecision ? "architecture decision surfaced for DB-related task" : "no delta"
      });
    }

    // Scenario 6: supersession-visibility
    {
      const cwd = await tempWorkspace("ss-mem-");
      workspaces.push(cwd);
      await initProject({ cwd });
      const old = await createMemory({
        cwd,
        content: "Use npm for package management.",
        type: "workflow_rule",
        source: "user_explicit"
      });
      const replacement = await createMemory({
        cwd,
        content: "Use pnpm for all package operations.",
        type: "workflow_rule",
        source: "user_explicit"
      });
      const { supersedeMemory } = await import("../../lifecycle/lifecycle.js");
      await supersedeMemory({ cwd, oldMemoryId: old.id, newMemoryId: replacement.id, reason: "Updated to pnpm" });

      let results = await retrieveMemories({ cwd, task: "package manager", dryRun: true });
      const oldHidden = !results.some((m) => m.id === old.id);
      const replacementVisible = results.some((m) => m.id === replacement.id);

      await quarantineMemory({ cwd, memoryId: replacement.id, reason: "Test quarantine" });
      results = await retrieveMemories({ cwd, task: "package manager", dryRun: true });
      const replacementHidden = !results.some((m) => m.id === replacement.id);

      scenarios.push({
        name: "supersession-visibility",
        passed: oldHidden && replacementVisible && replacementHidden,
        noMemory: {},
        withMemory: { oldSupersededAndHidden: oldHidden, replacementVisible, replacementHiddenAfterQuarantine: replacementHidden },
        delta: "superseded memory hidden; superseding memory hidden after quarantine"
      });
    }

    const passed = scenarios.filter((s) => s.passed).length;
    const failed = scenarios.filter((s) => !s.passed).length;

    await cleanup(workspaces);

    return {
      name: "projectmind-causal-proof",
      passed: failed === 0,
      summary: { passed, failed },
      scenarios,
      limitations
    };
  } catch (error) {
    await cleanup(workspaces);
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "projectmind-causal-proof",
      passed: false,
      summary: { passed: 0, failed: 1 },
      scenarios,
      limitations: [...limitations, `Harness error: ${message}`]
    };
  }
}
