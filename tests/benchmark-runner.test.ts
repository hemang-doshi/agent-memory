import { describe, expect, test } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBenchmarkFixture } from "../src/core/benchmark/load-fixture.js";
import { runProtocolBenchmarks } from "../src/core/benchmark/run-benchmarks.js";
import { runBenchmarkFixture } from "../src/core/benchmark/run-fixture.js";
import type { BenchmarkFixture } from "../src/core/benchmark/types.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function fixturePath(name: string): string {
  return resolve(repoRoot, "benchmarks", "fixtures", "protocol", `${name}.json`);
}

async function readCommittedFixture(name: string): Promise<BenchmarkFixture> {
  const fixture = await import("../src/core/benchmark/load-fixture.js").then(({ loadBenchmarkFixture }) =>
    loadBenchmarkFixture(fixturePath(name))
  );
  return fixture;
}

describe("benchmark runner", () => {
  test.each([
    "old-mistake-avoidance",
    "command-preflight-warn",
    "event-backed-candidate",
    "noise-control"
  ])("runs committed protocol fixture %s", async (name) => {
    const result = await runBenchmarkFixture(await readCommittedFixture(name));
    expect(result.passed).toBe(true);
    expect(result.sessionId).toMatch(/^ses_/);
    expect(result.receiptTypes).toContain("session_started");
    expect(result.receiptTypes).toContain("session_finished");
  });

  test("event-backed candidate fixture records candidate evidence event ids", async () => {
    const result = await runBenchmarkFixture(await readCommittedFixture("event-backed-candidate"));

    expect(result.passed).toBe(true);
    expect(result.candidateIds).toHaveLength(1);
    expect(result.candidateEvidenceEventIds).toHaveLength(1);
    expect(result.candidateEvidenceEventIds[0]?.[0]).toMatch(/^evt_[a-f0-9]{10}$/);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: "candidate 0 receipt cites evidence event",
        passed: true
      })
    );
  });

  test("supports non-command evidence event fixture types", async () => {
    const fixture = parseBenchmarkFixture({
      schema: "agent-memory-benchmark/v1",
      name: "agent-observation-candidate",
      task: "Capture agent observation",
      events: [
        {
          type: "agent_observation",
          summary: "Agent observed the repeated setup failure."
        }
      ],
      candidates: [
        {
          type: "workflow_rule",
          content: "Check setup logs before retrying.",
          evidenceEventIndex: 0
        }
      ],
      expectations: {
        candidateCount: 1,
        receiptTypes: ["event_recorded", "candidate_proposed"]
      }
    });

    const result = await runBenchmarkFixture(fixture);
    expect(result.passed).toBe(true);
    expect(result.candidateEvidenceEventIds[0]?.[0]).toMatch(/^evt_[a-f0-9]{10}$/);
  });

  test("returns failed result when packIncludes expectation is missing", async () => {
    const fixture = parseBenchmarkFixture({
      schema: "agent-memory-benchmark/v1",
      name: "missing-pack-include",
      task: "Update component browser PanelCard demo",
      memories: [
        {
          type: "failed_attempt",
          content: "Using defineEntry for JSX-child demos failed due to TypeScript limitations.",
          source: "cli"
        }
      ],
      expectations: {
        packIncludes: ["This text is not in the generated pack"]
      }
    });

    const result = await runBenchmarkFixture(fixture);
    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        passed: false,
        message: "Missing expected pack text: This text is not in the generated pack"
      })
    );
  });

  test("returns failed result when preflight decision differs", async () => {
    const fixture = parseBenchmarkFixture({
      schema: "agent-memory-benchmark/v1",
      name: "wrong-preflight-decision",
      task: "Verify command",
      memories: [
        {
          type: "command_policy",
          content: "Do not run npm run render unless explicitly requested.",
          source: "user_explicit",
          metadata: {
            commandPattern: "npm run render",
            matchType: "exact",
            decision: "warn"
          }
        }
      ],
      preflightCommands: [
        {
          command: "npm run render"
        }
      ],
      expectations: {
        preflight: [
          {
            command: "npm run render",
            decision: "block"
          }
        ]
      }
    });

    const result = await runBenchmarkFixture(fixture);
    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        passed: false,
        message: "Expected preflight decision block for npm run render, got warn"
      })
    );
  });

  test("validates malformed fixtures", () => {
    expect(() =>
      parseBenchmarkFixture({
        schema: "agent-memory-benchmark/v1",
        name: "event-backed-candidate",
        task: "Fix typecheck",
        events: [],
        candidates: [
          {
            type: "failed_attempt",
            content: "Bad candidate.",
            evidenceEventIndex: 0
          }
        ],
        expectations: {}
      })
    ).toThrow("candidates[0].evidenceEventIndex points to missing event");

    expect(() =>
      parseBenchmarkFixture({
        schema: "wrong",
        name: "bad-schema",
        task: "x",
        expectations: {}
      })
    ).toThrow("expected schema agent-memory-benchmark/v1");
  });

  test("all-style runner loads protocol fixtures from cwd", async () => {
    const report = await runProtocolBenchmarks({ cwd: repoRoot });
    expect(report.summary.total).toBeGreaterThanOrEqual(4);
    expect(report.summary.failed).toBe(0);
    expect(report.results.map((result) => result.name)).toEqual([
      "command-preflight-warn",
      "event-backed-candidate",
      "noise-control",
      "old-mistake-avoidance"
    ]);
  });

  test("can load all-style fixtures from an isolated cwd", async () => {
    const cwd = await createTempWorkspace("agentmem-benchmark-all");
    try {
      const fixturesDir = resolve(cwd, "benchmarks", "fixtures", "protocol");
      mkdirSync(fixturesDir, { recursive: true });
      writeFileSync(
        resolve(fixturesDir, "single.json"),
        JSON.stringify({
          schema: "agent-memory-benchmark/v1",
          name: "single",
          task: "Use deterministic protocol benchmarks",
          memories: [
            {
              type: "decision",
              content: "Use deterministic protocol benchmarks.",
              source: "cli"
            }
          ],
          expectations: {
            packIncludes: ["deterministic protocol benchmarks"]
          }
        })
      );

      const report = await runProtocolBenchmarks({ cwd });
      expect(report.summary).toEqual({ total: 1, passed: 1, failed: 0 });
    } finally {
      await cleanupWorkspace(cwd);
    }
  });
});
