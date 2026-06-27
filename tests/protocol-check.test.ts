import { afterEach, describe, expect, test } from "vitest";

import { approveCandidate } from "../src/core/candidate-approve.js";
import { proposeCandidate } from "../src/core/candidate-propose.js";
import { checkProtocolCompliance } from "../src/core/protocol-check.js";
import { createMemory } from "../src/core/create-memory.js";
import { finishSession } from "../src/core/session-finish.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { recordEvidenceEvent } from "../src/core/record-event.js";
import { startSession } from "../src/core/session-start.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("protocol check", () => {
  test("reports a compliant minimal session", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-pass");
    workspaces.push(cwd);
    await initProject({ cwd });

    const session = await startSession({ cwd, task: "Tiny edit" });
    await generatePack({ cwd, task: "Tiny edit", sessionId: session.sessionId });
    await finishSession({ cwd, sessionId: session.sessionId, summary: "Done." });

    const report = await checkProtocolCompliance({ cwd, sessionId: session.sessionId });

    expect(report.compliant).toBe(true);
    expect(report.required).toEqual({
      sessionStarted: true,
      packLoaded: true,
      sessionFinished: true
    });
    expect(report.missingCheckpoints).toEqual([]);
  });

  test("reports a missing pack checkpoint without throwing", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-missing-pack");
    workspaces.push(cwd);
    await initProject({ cwd });

    const session = await startSession({ cwd, task: "Tiny edit" });
    await finishSession({ cwd, sessionId: session.sessionId, summary: "Done." });

    const report = await checkProtocolCompliance({ cwd, sessionId: session.sessionId });

    expect(report.compliant).toBe(false);
    expect(report.missingCheckpoints).toContain("pack_loaded");
  });

  test("reports active sessions as non-compliant until finished", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-active");
    workspaces.push(cwd);
    await initProject({ cwd });

    const session = await startSession({ cwd, task: "Active work" });
    await generatePack({ cwd, task: "Active work", sessionId: session.sessionId });

    const report = await checkProtocolCompliance({ cwd, sessionId: session.sessionId });

    expect(report.status).toBe("active");
    expect(report.compliant).toBe(false);
    expect(report.required.sessionFinished).toBe(false);
    expect(report.missingCheckpoints).toContain("session_finished");
  });

  test("counts optional protocol activity without requiring it", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-activity");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Do not run npm run render unless explicitly requested.",
      type: "command_policy",
      source: "user_explicit",
      severity: "high",
      metadata: {
        commandPattern: "npm run render",
        matchType: "exact",
        decision: "warn",
        suggestedAction: "Run pnpm test instead."
      }
    });

    const session = await startSession({ cwd, task: "Implement render guard" });
    await generatePack({
      cwd,
      task: "Implement render guard and avoid npm run render",
      sessionId: session.sessionId
    });
    await preflightCommand({
      cwd,
      command: "npm run render",
      sessionId: session.sessionId
    });
    await recordEvidenceEvent({
      cwd,
      sessionId: session.sessionId,
      type: "command_result",
      command: "pnpm test",
      exitCode: 0,
      summary: "Tests passed."
    });
    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "failed_attempt",
      content: "Using render during routine tests is avoidable.",
      evidence: "Preflight warned before render."
    });
    await approveCandidate({ cwd, candidateId: candidate.candidateId });
    await finishSession({ cwd, sessionId: session.sessionId, summary: "Done." });

    const report = await checkProtocolCompliance({ cwd, sessionId: session.sessionId });

    expect(report.compliant).toBe(true);
    expect(report.activity.preflightChecks).toBe(1);
    expect(report.activity.warningsTriggered).toBe(1);
    expect(report.activity.blocksTriggered).toBe(0);
    expect(report.activity.eventsRecorded).toBe(1);
    expect(report.activity.candidatesProposed).toBe(1);
    expect(report.activity.candidatesReviewed).toBe(1);
    expect(report.activity.memoriesInjected.length).toBeGreaterThanOrEqual(1);
    expect(report.receiptTypes).toEqual(expect.arrayContaining([
      "session_started",
      "pack_loaded",
      "preflight_checked",
      "warning_triggered",
      "event_recorded",
      "candidate_proposed",
      "candidate_reviewed",
      "session_finished"
    ]));
  });

  test("does not require optional preflights, events, or candidates", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-optional");
    workspaces.push(cwd);
    await initProject({ cwd });

    const session = await startSession({ cwd, task: "Tiny edit" });
    await generatePack({ cwd, task: "Tiny edit", sessionId: session.sessionId });
    await finishSession({ cwd, sessionId: session.sessionId, summary: "Done." });

    const report = await checkProtocolCompliance({ cwd, sessionId: session.sessionId });

    expect(report.compliant).toBe(true);
    expect(report.activity.preflightChecks).toBe(0);
    expect(report.activity.eventsRecorded).toBe(0);
    expect(report.activity.candidatesProposed).toBe(0);
  });

  test("throws clearly for unknown sessions", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-check-missing-session");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(
      checkProtocolCompliance({ cwd, sessionId: "ses_missing" })
    ).rejects.toThrow("Unknown session: ses_missing");
  });
});
