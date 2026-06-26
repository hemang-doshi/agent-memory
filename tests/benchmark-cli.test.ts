import { describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const run = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const cliPath = resolve(repoRoot, "src/cli/main.ts");
const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

function runCli(args: string[], cwd: string = repoRoot) {
  return run("node", [tsxCli, cliPath, ...args], { cwd });
}

describe("benchmark CLI", () => {
  test("runs a single fixture as JSON", async () => {
    const fixture = resolve(repoRoot, "benchmarks", "fixtures", "protocol", "old-mistake-avoidance.json");
    const output = await runCli(["benchmark", "run", "--fixture", fixture, "--json"]);
    const parsed = JSON.parse(output.stdout) as {
      summary: { total: number; passed: number; failed: number };
      results: Array<{ name: string; passed: boolean; sessionId: string; matchedMemoryIds: string[] }>;
    };

    expect(parsed.summary).toEqual({ total: 1, passed: 1, failed: 0 });
    expect(parsed.results[0]?.name).toBe("old-mistake-avoidance");
    expect(parsed.results[0]?.passed).toBe(true);
    expect(parsed.results[0]?.sessionId).toMatch(/^ses_/);
    expect(parsed.results[0]?.matchedMemoryIds.length).toBeGreaterThanOrEqual(1);
  });

  test("runs all protocol fixtures as JSON", async () => {
    const output = await runCli(["benchmark", "run", "--all", "--json"]);
    const parsed = JSON.parse(output.stdout) as {
      summary: { total: number; passed: number; failed: number };
    };

    expect(parsed.summary.total).toBeGreaterThanOrEqual(4);
    expect(parsed.summary.failed).toBe(0);
  });

  test("prints concise text output", async () => {
    const fixture = resolve(repoRoot, "benchmarks", "fixtures", "protocol", "old-mistake-avoidance.json");
    const output = await runCli(["benchmark", "run", "--fixture", fixture]);

    expect(output.stdout).toContain("Benchmark results:");
    expect(output.stdout).toContain("- old-mistake-avoidance: PASS");
    expect(output.stdout).toContain("Passed 1/1.");
  });

  test("validates benchmark run options clearly", async () => {
    const cwd = await createTempWorkspace("agentmem-benchmark-cli-errors");
    try {
      await expect(runCli(["benchmark", "run"], cwd)).rejects.toMatchObject({
        stderr: expect.stringContaining("benchmark run requires --fixture or --all")
      });
      await expect(
        runCli(["benchmark", "run", "--fixture", "x.json", "--all"], cwd)
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("benchmark run accepts only one of --fixture or --all")
      });
      await expect(runCli(["benchmark", "list"], cwd)).rejects.toMatchObject({
        stderr: expect.stringContaining("Unknown benchmark command. Run `agentmem help` for usage.")
      });
    } finally {
      await cleanupWorkspace(cwd);
    }
  });
});
