import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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

describe("CLI smoke tests", () => {
  test("prints compact help for empty usage and help flags", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-help");
    workspaces.push(cwd);

    const noCommand = await runCli([], cwd);
    expect(noCommand.stdout).toContain("Agent Memory CLI");

    const help = await runCli(["help"], cwd);
    expect(help.stdout).toContain("agentmem init");

    const helpFlag = await runCli(["--help"], cwd);
    expect(helpFlag.stdout).toContain("agentmem preflight");
  });

  test("shows a help hint for unknown commands", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-unknown");
    workspaces.push(cwd);

    await expect(runCli(["wat"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Run `agentmem help` for usage.")
    });
  });

  test("initializes a project and emits JSON for pack and preflight", async () => {
    const cwd = await createTempWorkspace("agentmem-cli");
    workspaces.push(cwd);

    await runCli(["init"], cwd);

    await runCli(
      [
        "policy",
        "Do not run npm run render unless explicitly requested.",
        "--match",
        "npm run render",
        "--decision",
        "warn",
        "--suggest",
        "Run pnpm test instead."
      ],
      cwd
    );

    const pack = await runCli(
      [
        "pack",
        "Implement the reel scene",
        "--json"
      ],
      cwd
    );

    const packJson = JSON.parse(pack.stdout) as { markdown: string };
    expect(packJson.markdown).toContain("# Project Memory Pack");

    const preflight = await runCli(
      [
        "preflight",
        "--command",
        "npm run render",
        "--json"
      ],
      cwd
    );

    const preflightJson = JSON.parse(preflight.stdout) as { decision: string };
    expect(preflightJson.decision).toBe("warn");
  });

  test("fails clearly for invalid CLI enum inputs and regex policies", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-invalid");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["remember", "x", "--type", "banana"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid memory type")
    });
    await expect(
      runCli(["remember", "x", "--type", "decision", "--source", "banana"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid memory source")
    });
    await expect(
      runCli(["policy", "x", "--match", "render", "--decision", "explode"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid preflight decision")
    });
    await expect(
      runCli(["policy", "x", "--match", "render", "--match-type", "glob"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid command policy match type")
    });
    await expect(
      runCli(["policy", "x", "--match", "[", "--match-type", "regex"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid regex pattern")
    });
  });
});
