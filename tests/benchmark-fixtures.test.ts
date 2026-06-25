import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

import { createMemory } from "../src/core/create-memory.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

interface FixtureMemory {
  content: string;
  type: "command_policy" | "failed_attempt" | "decision" | "workflow_rule";
  source: "user_explicit" | "cli";
  metadata?: Record<string, unknown>;
  status?: "active" | "stale";
}

interface BenchmarkFixture {
  task: string;
  command?: string;
  memories: FixtureMemory[];
  expectedDecision?: string;
  expectedPackIncludes: string[];
}

describe("benchmark fixtures", () => {
  for (const fixtureName of [
    "render-guard",
    "failed-attempt",
    "design-continuity",
    "stale-memory-conflict"
  ]) {
    test(`replays ${fixtureName}`, async () => {
      const cwd = await createTempWorkspace(`agentmem-${fixtureName}`);
      workspaces.push(cwd);
      await initProject({ cwd });

      const fixture = JSON.parse(
        readFileSync(
          `/Users/hemangdoshi/Developer/agent-memory/benchmarks/fixtures/${fixtureName}.json`,
          "utf8"
        )
      ) as BenchmarkFixture;

      for (const memory of fixture.memories) {
        await createMemory({
          cwd,
          ...memory
        });
      }

      const pack = await generatePack({ cwd, task: fixture.task });
      for (const snippet of fixture.expectedPackIncludes) {
        expect(pack.markdown).toContain(snippet);
      }

      if (fixture.command) {
        const preflight = await preflightCommand({
          cwd,
          command: fixture.command
        });
        expect(preflight.decision).toBe(fixture.expectedDecision);
      }
    });
  }
});
