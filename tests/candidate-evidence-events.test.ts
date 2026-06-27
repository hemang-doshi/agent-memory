import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { approveCandidate } from "../src/core/candidate-approve.js";
import { proposeCandidate } from "../src/core/candidate-propose.js";
import { loadProject } from "../src/core/context.js";
import { createMemory } from "../src/core/create-memory.js";
import { initProject } from "../src/core/init-project.js";
import { listCandidates } from "../src/core/candidate-list.js";
import { recordEvidenceEvent } from "../src/core/record-event.js";
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

describe("candidate evidence events", () => {
  test("candidate can cite evidence event, derive evidence, and preserve provenance on approval", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-event");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({
      cwd,
      task: "Fix component browser"
    });
    const event = await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "command_result",
      command: "pnpm typecheck",
      exitCode: 1,
      summary: "Typecheck failed when JSX children were stored in defineEntry props."
    });

    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "failed_attempt",
      content: "Using defineEntry for JSX-child demos fails with JSX children.",
      evidenceEventId: event.eventId
    });

    expect(candidate.evidence).toContain("Typecheck failed");
    expect(candidate.evidenceEventIds).toEqual([event.eventId]);

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.receipts).toContainEqual(
      expect.objectContaining({
        type: "candidate_proposed",
        payload: expect.objectContaining({
          candidateId: candidate.candidateId,
          evidenceEventIds: [event.eventId]
        })
      })
    );

    const approved = await approveCandidate({
      cwd,
      candidateId: candidate.candidateId
    });

    expect(approved.memory.metadata).toMatchObject({
      candidateId: candidate.candidateId,
      evidenceEventIds: [event.eventId],
      approvedFromCandidate: true
    });
  });

  test("candidate can store freeform evidence and event evidence together", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-event-both");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Store both evidence forms" });
    const event = await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "test_result",
      summary: "The targeted test failed."
    });

    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "known_fix",
      content: "Run the targeted test before the full suite.",
      evidence: "Human-readable summary.",
      evidenceEventId: event.eventId
    });

    expect(candidate.evidence).toBe("Human-readable summary.");
    expect(candidate.evidenceEventIds).toEqual([event.eventId]);
  });

  test("candidate cannot cite unknown, other-session, or internal events", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-event-errors");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Validate event evidence" });
    const otherSession = await startSession({ cwd, task: "Other session" });
    const otherEvent = await recordEvidenceEvent({
      cwd,
      sessionId: otherSession.sessionId,
      type: "agent_observation",
      summary: "Observation from another session."
    });
    await createMemory({
      cwd,
      type: "workflow_rule",
      source: "cli",
      content: "Internal event source."
    });
    const loaded = await loadProject(cwd);
    let internalEventId = "";
    try {
      internalEventId = loaded.repo
        .listEvents(loaded.project.projectId)
        .find((event) => event.eventType === "memory_created")!.eventId;
    } finally {
      loaded.close();
    }

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "failed_attempt",
        content: "Unknown event.",
        evidenceEventId: "evt_missing"
      })
    ).rejects.toThrow("Unknown event: evt_missing");

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "failed_attempt",
        content: "Other session event.",
        evidenceEventId: otherEvent.eventId
      })
    ).rejects.toThrow(`Evidence event does not belong to session: ${otherEvent.eventId}`);

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "failed_attempt",
        content: "Internal event.",
        evidenceEventId: internalEventId
      })
    ).rejects.toThrow(`Event cannot be used as candidate evidence: ${internalEventId}`);
  });

  test("existing freeform evidence proposal still works with empty evidenceEventIds", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-freeform");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Freeform evidence" });

    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "workflow_rule",
      content: "Keep using explicit freeform evidence.",
      evidence: "Observed manually."
    });

    expect(candidate.evidence).toBe("Observed manually.");
    expect(candidate.evidenceEventIds).toEqual([]);
    expect((await listCandidates({ cwd }))[0]?.evidenceEventIds).toEqual([]);
  });

  test("candidate propose with --evidence-event works through CLI JSON", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-event-cli");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionJson = await runCli(["session", "start", "CLI candidate evidence", "--json"], cwd);
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
        "Typecheck failed.",
        "--json"
      ],
      cwd
    );
    const eventId = JSON.parse(eventJson.stdout).eventId as string;

    const candidateJson = await runCli(
      [
        "candidate",
        "propose",
        "--session",
        sessionId,
        "--type",
        "failed_attempt",
        "--content",
        "Avoid the failed JSX-child approach.",
        "--evidence-event",
        eventId,
        "--json"
      ],
      cwd
    );

    expect(JSON.parse(candidateJson.stdout)).toMatchObject({
      evidence: "Typecheck failed.",
      evidenceEventIds: [eventId]
    });
  });
});
