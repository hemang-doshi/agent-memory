import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const run = promisify(execFile);
const workspaces: string[] = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const cliPath = resolve(repoRoot, "src/cli/main.ts");
const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

function runCli(args: string[], cwd: string) {
  return run("node", [tsxCli, cliPath, ...args], { cwd });
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("protocol start CLI", () => {
  test("prints JSON output", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-cli-json");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    const result = await runCli(["protocol", "start", "Implement protocol start", "--json"], cwd);
    const json = JSON.parse(result.stdout) as {
      sessionId: string;
      task: string;
      pack: { markdown: string; matchedMemoryIds: string[] };
      nextSteps: string[];
    };

    expect(json.sessionId).toMatch(/^ses_/);
    expect(json.task).toBe("Implement protocol start");
    expect(json.pack.markdown).toContain("Project Memory Pack");
    expect(Array.isArray(json.pack.matchedMemoryIds)).toBe(true);
    expect(json.nextSteps.length).toBeGreaterThan(0);
  });

  test("prints text output with the memory pack", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-cli-text");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    const result = await runCli(["protocol", "start", "Implement protocol start"], cwd);

    expect(result.stdout).toContain("Started protocol session:");
    expect(result.stdout).toContain("Task: Implement protocol start");
    expect(result.stdout).toContain("Matched memories:");
    expect(result.stdout).toContain("Next:");
    expect(result.stdout).toContain("Memory pack:");
    expect(result.stdout).toContain("Project Memory Pack");
  });

  test("errors for an empty task", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-cli-empty");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["protocol", "start"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("protocol start requires a task description")
    });
  });

  test("integrates with protocol check before and after session finish", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-cli-check");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    const start = await runCli(["protocol", "start", "Protocol start CLI integration", "--json"], cwd);
    const sessionId = JSON.parse(start.stdout).sessionId as string;
    const before = await runCli(["protocol", "check", "--session", sessionId, "--json"], cwd);
    const beforeJson = JSON.parse(before.stdout) as {
      compliant: boolean;
      required: {
        sessionStarted: boolean;
        packLoaded: boolean;
        sessionFinished: boolean;
      };
    };

    expect(beforeJson.required.sessionStarted).toBe(true);
    expect(beforeJson.required.packLoaded).toBe(true);
    expect(beforeJson.required.sessionFinished).toBe(false);
    expect(beforeJson.compliant).toBe(false);

    await runCli(["session", "finish", "--session", sessionId, "--summary", "Done.", "--json"], cwd);
    const after = await runCli(["protocol", "check", "--session", sessionId, "--json"], cwd);
    const afterJson = JSON.parse(after.stdout) as { compliant: boolean };

    expect(afterJson.compliant).toBe(true);
  });
});
