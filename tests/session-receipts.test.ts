import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { initProject } from "../src/core/init-project.js";
import { finishSession } from "../src/core/session-finish.js";
import { getSessionReceipt } from "../src/core/session-receipt.js";
import { startSession } from "../src/core/session-start.js";
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

describe("session receipts", () => {
  test("session start creates an active ses_* row and writes session_started", async () => {
    const cwd = await createTempWorkspace("agentmem-session-start");
    workspaces.push(cwd);
    await initProject({ cwd });

    const session = await startSession({ cwd, task: "Implement feature" });
    expect(session.sessionId).toMatch(/^ses_[a-f0-9]{10}$/);
    expect(session.status).toBe("active");

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.receipts[0]?.type).toBe("session_started");
  });

  test("session finish updates status and writes session_finished", async () => {
    const cwd = await createTempWorkspace("agentmem-session-finish");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Finish feature" });

    const finished = await finishSession({
      cwd,
      sessionId: session.sessionId,
      summary: "Done."
    });

    expect(finished.status).toBe("finished");
    expect(finished.finishedAt).toBeTruthy();
    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.sessionFinished).toBe(true);
    expect(receipt.receipts.some((item) => item.type === "session_finished")).toBe(true);
  });

  test("receipt works for an empty session", async () => {
    const cwd = await createTempWorkspace("agentmem-session-empty");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Empty audit" });

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.packLoaded).toBe(false);
    expect(receipt.preflightChecks).toBe(0);
    expect(receipt.candidatesProposed).toBe(0);
    expect(receipt.receipts).toHaveLength(1);
  });

  test("invalid session ID errors clearly through CLI receipt command", async () => {
    const cwd = await createTempWorkspace("agentmem-session-invalid");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(
      runCli(["session", "receipt", "--session", "ses_missing", "--json"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Unknown session: ses_missing")
    });
  });
});
