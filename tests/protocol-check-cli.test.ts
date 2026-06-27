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

async function createCompliantSession(cwd: string): Promise<string> {
  await runCli(["init"], cwd);
  const sessionJson = await runCli(["session", "start", "Protocol check", "--json"], cwd);
  const sessionId = JSON.parse(sessionJson.stdout).sessionId as string;
  await runCli(["pack", "Protocol check", "--session", sessionId, "--json"], cwd);
  await runCli(["session", "finish", "--session", sessionId, "--summary", "Done.", "--json"], cwd);
  return sessionId;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("protocol check CLI", () => {
  test("prints JSON output", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-cli-json");
    workspaces.push(cwd);
    const sessionId = await createCompliantSession(cwd);

    const result = await runCli(["protocol", "check", "--session", sessionId, "--json"], cwd);
    const json = JSON.parse(result.stdout) as {
      compliant: boolean;
      required: { packLoaded: boolean };
    };

    expect(json.compliant).toBe(true);
    expect(json.required.packLoaded).toBe(true);
  });

  test("prints compact text output", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-cli-text");
    workspaces.push(cwd);
    const sessionId = await createCompliantSession(cwd);

    const result = await runCli(["protocol", "check", "--session", sessionId], cwd);

    expect(result.stdout).toContain("Protocol check: PASS");
    expect(result.stdout).toContain("session_started: yes");
    expect(result.stdout).toContain("pack_loaded: yes");
    expect(result.stdout).toContain("session_finished: yes");
  });

  test("prints missing checkpoints for non-compliant text output", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-cli-fail");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionJson = await runCli(["session", "start", "Missing pack", "--json"], cwd);
    const sessionId = JSON.parse(sessionJson.stdout).sessionId as string;
    await runCli(["session", "finish", "--session", sessionId, "--summary", "Done."], cwd);

    const result = await runCli(["protocol", "check", "--session", sessionId], cwd);

    expect(result.stdout).toContain("Protocol check: FAIL");
    expect(result.stdout).toContain("Missing:");
    expect(result.stdout).toContain("- pack_loaded");
  });

  test("requires the session option", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-cli-missing-option");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["protocol", "check"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Missing required option --session")
    });
  });

  test("rejects unknown protocol subcommands", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-cli-unknown");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["protocol", "launch", "Task"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Unknown protocol command. Run `agentmem help` for usage.")
    });
  });
});
