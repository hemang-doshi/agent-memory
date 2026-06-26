import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMemory } from "../src/core/create-memory.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

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

      const fixturePath = resolve(repoRoot, "benchmarks", "fixtures", `${fixtureName}.json`);
      const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as BenchmarkFixture;

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
