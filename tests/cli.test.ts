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

  test("supports V1 add retrieve inject update forget and event commands", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-v1");
    workspaces.push(cwd);

    await runCli(["init"], cwd);

    const created = await runCli(
      [
        "add",
        "Use pnpm for package operations.",
        "--type",
        "workflow_rule",
        "--pinned",
        "--priority",
        "2",
        "--tags",
        "package-manager",
        "--json"
      ],
      cwd
    );
    const createdJson = JSON.parse(created.stdout) as { id: string; pinned: boolean };
    expect(createdJson.pinned).toBe(true);

    const retrieved = await runCli(["retrieve", "package manager setup", "--json"], cwd);
    const retrievedJson = JSON.parse(retrieved.stdout) as { matchedMemoryIds: string[] };
    expect(retrievedJson.matchedMemoryIds).toContain(createdJson.id);

    const injected = await runCli(["inject", "package manager setup", "--format", "json"], cwd);
    const injectedJson = JSON.parse(injected.stdout) as { schemaVersion: string; sections: unknown[] };
    expect(injectedJson.schemaVersion).toBe("agent-memory.packet.v1");
    expect(injectedJson.sections.length).toBeGreaterThan(0);

    const updated = await runCli(
      [
        "update",
        createdJson.id,
        "--reason",
        "Clarify package manager.",
        "--content",
        "Use pnpm for all package operations.",
        "--json"
      ],
      cwd
    );
    const updatedJson = JSON.parse(updated.stdout) as { content: string };
    expect(updatedJson.content).toBe("Use pnpm for all package operations.");

    const session = await runCli(["session", "start", "CLI V1 smoke", "--json"], cwd);
    const sessionJson = JSON.parse(session.stdout) as { sessionId: string };
    const event = await runCli(
      [
        "event",
        "record",
        "--session",
        sessionJson.sessionId,
        "--type",
        "command_result",
        "--summary",
        "CLI V1 smoke test passed.",
        "--json"
      ],
      cwd
    );
    const eventJson = JSON.parse(event.stdout) as { eventId: string; eventType: string };
    expect(eventJson.eventType).toBe("command_result");

    const candidate = await runCli(
      [
        "candidate",
        "propose",
        "--session",
        sessionJson.sessionId,
        "--type",
        "workflow_rule",
        "--content",
        "Use pnpm for package operations.",
        "--evidence-event",
        eventJson.eventId,
        "--json"
      ],
      cwd
    );
    const candidateJson = JSON.parse(candidate.stdout) as { evidenceEventIds: string[] };
    expect(candidateJson.evidenceEventIds).toEqual([eventJson.eventId]);

    await expect(
      runCli(
        [
          "event",
          "record",
          "--session",
          "ses_missing",
          "--type",
          "command_result",
          "--summary",
          "Should fail."
        ],
        cwd
      )
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Unknown session: ses_missing")
    });

    const receipt = await runCli(
      ["session", "receipt", "--session", sessionJson.sessionId, "--json"],
      cwd
    );
    const receiptJson = JSON.parse(receipt.stdout) as { receipts: Array<{ type: string }> };
    expect(receiptJson.receipts.map((item) => item.type)).toContain("event_recorded");

    const forgotten = await runCli(
      ["forget", createdJson.id, "--reason", "No longer needed.", "--json"],
      cwd
    );
    const forgottenJson = JSON.parse(forgotten.stdout) as { status: string };
    expect(forgottenJson.status).toBe("archived");

    const evalRun = await runCli(["eval", "--json"], cwd);
    const evalJson = JSON.parse(evalRun.stdout) as { passed: boolean; checks: unknown[] };
    expect(evalJson.passed).toBe(true);
    expect(evalJson.checks.length).toBeGreaterThan(0);
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
    await expect(
      runCli(["add", "Invalid priority", "--type", "decision", "--priority", "high"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid --priority: expected an integer")
    });
    await expect(
      runCli(["retrieve", "query", "--limit", "many"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid --limit: expected an integer")
    });
  });
});
