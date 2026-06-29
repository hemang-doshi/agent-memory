import type { PreflightResult, MemoryRecord } from "../../domain/types.js";

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

export async function runProjectMindEval(): Promise<ProjectMindResult> {
  const { loadProject } = await import("../../core/context.js");
  const { createMemory } = await import("../../core/create-memory.js");
  const { retrieveMemories } = await import("../../core/retrieve-memories.js");
  const { preflightCommand } = await import("../../core/preflight-command.js");
  const { quarantineMemory } = await import("../../safety/quarantine.js");

  const cwd = process.cwd();
  const limitations = [
    "Scenarios run against the current project's .agent-memory/ store.",
    "This is a deterministic local harness — does not invoke external coding agents.",
    "Results depend on project state; run from a clean initialized project for reproducible proof."
  ];

  const scenarios: ProjectMindScenario[] = [];

  try {
    // Scenario 1: package-manager-policy
    const noMemory1 = await preflightCommand({ cwd, command: "npm install lodash" });
    const mem1 = await createMemory({
      cwd,
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
    const withMemory1 = await preflightCommand({ cwd, command: "npm install lodash" });
    scenarios.push({
      name: "package-manager-policy",
      passed: noMemory1.decision !== "block" && withMemory1.decision === "block" && withMemory1.matchedMemoryIds.length > 0,
      noMemory: { decision: noMemory1.decision },
      withMemory: { decision: withMemory1.decision, matchedMemoryIds: withMemory1.matchedMemoryIds },
      delta: withMemory1.decision !== noMemory1.decision ? "memory changed preflight decision from warn/allow to block" : "no delta"
    });

    // Scenario 2: fragile-file
    await createMemory({
      cwd,
      content: "src/router.ts is fragile — editing it requires running full regression suite.",
      type: "fragile_file",
      source: "user_explicit",
      paths: ["src/router.ts"],
      severity: "high"
    });
    const noMemory2 = await retrieveMemories({ cwd, task: "edit a CSS file", dryRun: true });
    const withMemory2 = await retrieveMemories({ cwd, task: "add a route to src/router.ts", dryRun: true });
    const hasFragile = withMemory2.some((m) => m.type === "fragile_file" && m.paths.includes("src/router.ts"));
    scenarios.push({
      name: "fragile-file",
      passed: !noMemory2.some((m) => m.type === "fragile_file") && hasFragile,
      noMemory: { memoryCount: noMemory2.length },
      withMemory: { memoryCount: withMemory2.length, includesFragileFile: hasFragile },
      delta: hasFragile ? "fragile file surfaced when relevant task references file" : "no delta"
    });

    // Scenario 3: failed-approach
    await createMemory({
      cwd,
      content: "Do not fix auth by editing middleware directly. Use the token refresh utility.",
      type: "failed_attempt",
      source: "user_explicit",
      severity: "high"
    });
    const noMemory3 = await retrieveMemories({ cwd, task: "update README", dryRun: true });
    const withMemory3 = await retrieveMemories({ cwd, task: "fix auth session refresh bug", dryRun: true });
    const hasFailed = withMemory3.some((m) => m.type === "failed_attempt");
    scenarios.push({
      name: "failed-approach",
      passed: !noMemory3.some((m) => m.type === "failed_attempt") && hasFailed,
      noMemory: { memoryCount: noMemory3.length },
      withMemory: { memoryCount: withMemory3.length, includesFailedAttempt: hasFailed },
      delta: hasFailed ? "failed attempt surfaced for similar task" : "no delta"
    });

    // Scenario 4: unsafe-exclusion
    const mem4 = await createMemory({
      cwd,
      content: "API key sk-test12345 should not appear in retrieval after quarantine",
      type: "decision",
      source: "user_explicit"
    });
    await quarantineMemory({ cwd, memoryId: mem4.id, reason: "Contains test secret" });
    const results4 = await retrieveMemories({ cwd, task: "API key", dryRun: true });
    const isQuarantined4 = !results4.some((m) => m.id === mem4.id);
    scenarios.push({
      name: "unsafe-exclusion",
      passed: isQuarantined4,
      noMemory: {},
      withMemory: { retrievedCount: results4.length, memoryExcluded: isQuarantined4 },
      delta: "quarantined memory excluded from retrieval"
    });

    const passed = scenarios.filter((s) => s.passed).length;
    const failed = scenarios.filter((s) => !s.passed).length;

    return {
      name: "projectmind-causal-proof",
      passed: failed === 0,
      summary: { passed, failed },
      scenarios,
      limitations
    };
  } catch (error) {
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
