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

async function startProtocolSession(cwd: string): Promise<string> {
  const result = await runCli(["protocol", "start", "Dogfood report CLI", "--json"], cwd);
  return JSON.parse(result.stdout).sessionId as string;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("dogfood report CLI", () => {
  test("prints JSON output", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-cli-json");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionId = await startProtocolSession(cwd);
    await runCli(["session", "finish", "--session", sessionId, "--summary", "Done.", "--json"], cwd);

    const result = await runCli(["dogfood", "report", "--session", sessionId, "--json"], cwd);
    const json = JSON.parse(result.stdout) as {
      sessionId: string;
      protocol: { compliant: boolean };
      signals: Record<string, boolean>;
    };

    expect(json.sessionId).toBe(sessionId);
    expect(json.protocol.compliant).toBe(true);
    expect(json.signals).toEqual(expect.objectContaining({
      memoryUsed: expect.any(Boolean),
      preflightUsed: expect.any(Boolean),
      evidenceCaptured: expect.any(Boolean),
      learningCaptured: expect.any(Boolean),
      reviewHappened: expect.any(Boolean)
    }));
  });

  test("prints compact text output", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-cli-text");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionId = await startProtocolSession(cwd);
    await runCli(["session", "finish", "--session", sessionId, "--summary", "Done.", "--json"], cwd);

    const result = await runCli(["dogfood", "report", "--session", sessionId], cwd);

    expect(result.stdout).toContain("Dogfood report: PASS");
    expect(result.stdout).toContain("Protocol:");
    expect(result.stdout).toContain("Activity:");
    expect(result.stdout).toContain("Dogfood signals:");
    expect(result.stdout).toContain("Notes:");
  });

  test("prints incomplete output for active sessions", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-cli-active");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionId = await startProtocolSession(cwd);

    const result = await runCli(["dogfood", "report", "--session", sessionId], cwd);

    expect(result.stdout).toContain("Dogfood report: INCOMPLETE");
    expect(result.stdout).toContain("missing checkpoints: session_finished");
  });

  test("requires the session option", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-cli-missing-option");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["dogfood", "report"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Missing required option --session")
    });
  });

  test("rejects unknown dogfood subcommands", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-cli-unknown");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["dogfood", "summary", "--session", "ses_missing"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Unknown dogfood command. Run `agentmem help` for usage.")
    });
  });
});
