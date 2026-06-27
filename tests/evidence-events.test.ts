import { execFile } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { openDatabase } from "../src/db/database.js";
import { loadProject } from "../src/core/context.js";
import { createMemory } from "../src/core/create-memory.js";
import { initProject } from "../src/core/init-project.js";
import { listEvidenceEvents } from "../src/core/list-events.js";
import { recordEvidenceEvent } from "../src/core/record-event.js";
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

describe("evidence events", () => {
  test("records command_result event with command, exit code, and receipt", async () => {
    const cwd = await createTempWorkspace("agentmem-evidence-command");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Record command evidence" });

    const event = await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "command_result",
      command: "pnpm typecheck",
      exitCode: 1,
      summary: "Typecheck failed when JSX children were stored in defineEntry props."
    });

    expect(event.eventId).toMatch(/^evt_[a-f0-9]{10}$/);
    expect(event.eventType).toBe("command_result");
    expect(event.actor).toBe("system");
    expect(event.payload).toMatchObject({
      sessionId: session.sessionId,
      command: "pnpm typecheck",
      exitCode: 1,
      summary: "Typecheck failed when JSX children were stored in defineEntry props."
    });

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.eventsRecorded).toBe(1);
    expect(receipt.receipts).toContainEqual(
      expect.objectContaining({
        type: "event_recorded",
        payload: expect.objectContaining({
          eventId: event.eventId,
          eventType: "command_result"
        })
      })
    );
  });

  test("records supported non-command event types with expected actors", async () => {
    const cwd = await createTempWorkspace("agentmem-evidence-types");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Record evidence types" });

    const testResult = await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "test_result",
      summary: "Unit tests passed."
    });
    const userCorrection = await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "user_correction",
      summary: "User corrected the storage path."
    });
    const agentObservation = await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "agent_observation",
      summary: "Agent observed repeated command failure."
    });

    expect(testResult.actor).toBe("system");
    expect(userCorrection.actor).toBe("user");
    expect(agentObservation.actor).toBe("agent");
  });

  test("validates summary, event type, secrets, and exit code through core and CLI", async () => {
    const cwd = await createTempWorkspace("agentmem-evidence-validation");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Validate evidence" });

    await expect(
      recordEvidenceEvent({
        cwd,
        sessionId: session.sessionId,
        type: "test_result",
        summary: ""
      })
    ).rejects.toThrow("event record requires --summary");

    await expect(
      recordEvidenceEvent({
        cwd,
        sessionId: session.sessionId,
        type: "test_result",
        summary: "Do not store token=abc123"
      })
    ).rejects.toThrow("Candidate rejected by hygiene check: possible secret detected.");

    await expect(
      runCli(["event", "record", "--session", session.sessionId, "--type", "xyz", "--summary", "Nope"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid event type: xyz")
    });

    await expect(
      runCli([
        "event",
        "record",
        "--session",
        session.sessionId,
        "--type",
        "command_result",
        "--summary",
        "Bad exit.",
        "--exit-code",
        "abc"
      ], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid --exit-code: abc")
    });
  });

  test("lists only evidence events for the requested session and allows finished sessions", async () => {
    const cwd = await createTempWorkspace("agentmem-evidence-list");
    workspaces.push(cwd);
    await initProject({ cwd });
    const first = await startSession({ cwd, task: "First session" });
    const second = await startSession({ cwd, task: "Second session" });
    const event = await recordEvidenceEvent({
      cwd,
      sessionId: first.sessionId,
      type: "agent_observation",
      summary: "Relevant session observation."
    });
    await recordEvidenceEvent({
      cwd,
      sessionId: second.sessionId,
      type: "agent_observation",
      summary: "Other session observation."
    });
    await createMemory({
      cwd,
      type: "workflow_rule",
      source: "cli",
      content: "Internal event should not be listed."
    });
    await finishSession({ cwd, sessionId: first.sessionId, summary: "Done." });

    const events = await listEvidenceEvents({ cwd, sessionId: first.sessionId });
    expect(events.map((item) => item.eventId)).toEqual([event.eventId]);
  });

  test("event record/list works through CLI JSON", async () => {
    const cwd = await createTempWorkspace("agentmem-evidence-cli");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionJson = await runCli(["session", "start", "CLI evidence", "--json"], cwd);
    const sessionId = JSON.parse(sessionJson.stdout).sessionId as string;

    const eventJson = await runCli(
      [
        "event",
        "record",
        "--session",
        sessionId,
        "--type",
        "command_result",
        "--command",
        "pnpm typecheck",
        "--exit-code",
        "1",
        "--summary",
        "Failed.",
        "--json"
      ],
      cwd
    );
    const event = JSON.parse(eventJson.stdout);
    expect(event.eventType).toBe("command_result");
    expect(event.payload.exitCode).toBe(1);

    const listJson = await runCli(["event", "list", "--session", sessionId, "--json"], cwd);
    expect(JSON.parse(listJson.stdout)).toEqual([
      expect.objectContaining({
        eventId: event.eventId,
        eventType: "command_result"
      })
    ]);
  });

  test("openDatabase migrates old memory_candidates tables with evidence_event_ids_json", async () => {
    const cwd = await createTempWorkspace("agentmem-evidence-migration");
    workspaces.push(cwd);
    const dbPath = join(cwd, "memory.db");
    const oldDb = new DatabaseSync(dbPath);
    try {
      oldDb.exec(`
        CREATE TABLE memory_candidates (
          candidate_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          session_id TEXT,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          scope TEXT NOT NULL,
          source TEXT NOT NULL,
          confidence TEXT NOT NULL,
          severity TEXT NOT NULL,
          evidence TEXT NOT NULL,
          candidate_status TEXT NOT NULL,
          proposed_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          reviewed_at TEXT,
          review_reason TEXT,
          target_memory_id TEXT
        );
      `);
    } finally {
      oldDb.close();
    }

    const migrated = openDatabase(dbPath);
    try {
      const columns = migrated.prepare("PRAGMA table_info(memory_candidates)").all() as Array<{
        name: string;
      }>;
      expect(columns.map((column) => column.name)).toContain("evidence_event_ids_json");
    } finally {
      migrated.close();
    }
  });
});
