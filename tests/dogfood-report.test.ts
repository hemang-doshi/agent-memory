import { afterEach, describe, expect, test } from "vitest";

import { proposeCandidate } from "../src/core/candidate-propose.js";
import { checkProtocolCompliance } from "../src/core/protocol-check.js";
import { createMemory } from "../src/core/create-memory.js";
import { getDogfoodReport } from "../src/core/dogfood-report.js";
import { finishSession } from "../src/core/session-finish.js";
import { initProject } from "../src/core/init-project.js";
import { recordEvidenceEvent } from "../src/core/record-event.js";
import { startProtocol } from "../src/core/protocol-start.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("dogfood report", () => {
  test("reports a compliant minimal dogfood session", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-minimal");
    workspaces.push(cwd);
    await initProject({ cwd });
    const start = await startProtocol({ cwd, task: "Tiny dogfood task" });
    await finishSession({
      cwd,
      sessionId: start.sessionId,
      summary: "Done."
    });

    const report = await getDogfoodReport({ cwd, sessionId: start.sessionId });

    expect(report.protocol.compliant).toBe(true);
    expect(report.protocol.missingCheckpoints).toEqual([]);
    expect(report.signals.memoryUsed).toBe(false);
    expect(report.signals.learningCaptured).toBe(false);
    expect(report.notes).toContain("Protocol completed successfully.");
  });

  test("reports memory usage when a pack injects memories", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-memory");
    workspaces.push(cwd);
    await initProject({ cwd });
    await createMemory({
      cwd,
      type: "workflow_rule",
      content: "Protocol dogfood reports should stay read-only.",
      source: "user_explicit",
      tags: ["dogfood", "protocol"]
    });

    const start = await startProtocol({
      cwd,
      task: "Implement dogfood protocol report"
    });
    await finishSession({ cwd, sessionId: start.sessionId, summary: "Done." });

    const report = await getDogfoodReport({ cwd, sessionId: start.sessionId });

    expect(report.activity.memoriesInjected.length).toBeGreaterThanOrEqual(1);
    expect(report.signals.memoryUsed).toBe(true);
    expect(report.notes).toContain("Memory was injected into the session.");
  });

  test("reports evidence and learning signals", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-learning");
    workspaces.push(cwd);
    await initProject({ cwd });
    const start = await startProtocol({ cwd, task: "Dogfood report with learning" });

    await recordEvidenceEvent({
      cwd,
      sessionId: start.sessionId,
      type: "command_result",
      command: "pnpm test",
      exitCode: 0,
      summary: "Tests passed."
    });
    await proposeCandidate({
      cwd,
      sessionId: start.sessionId,
      type: "known_fix",
      content: "Dogfood report should derive from protocol check instead of raw receipt parsing.",
      evidence: "Implemented during dogfood report slice."
    });
    await finishSession({ cwd, sessionId: start.sessionId, summary: "Done." });

    const report = await getDogfoodReport({ cwd, sessionId: start.sessionId });

    expect(report.activity.eventsRecorded).toBe(1);
    expect(report.activity.candidatesProposed).toBe(1);
    expect(report.signals.evidenceCaptured).toBe(true);
    expect(report.signals.learningCaptured).toBe(true);
  });

  test("reports active sessions as incomplete", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-active");
    workspaces.push(cwd);
    await initProject({ cwd });
    const start = await startProtocol({ cwd, task: "Active dogfood task" });

    const report = await getDogfoodReport({ cwd, sessionId: start.sessionId });

    expect(report.status).toBe("active");
    expect(report.protocol.compliant).toBe(false);
    expect(report.protocol.missingCheckpoints).toEqual(["session_finished"]);
    expect(report.notes.join("\n")).toContain("session_finished");
  });

  test("throws clearly for unknown sessions", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-missing-session");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(
      getDogfoodReport({ cwd, sessionId: "ses_missing" })
    ).rejects.toThrow("Unknown session: ses_missing");
  });

  test("does not mutate protocol compliance state", async () => {
    const cwd = await createTempWorkspace("agentmem-dogfood-report-readonly");
    workspaces.push(cwd);
    await initProject({ cwd });
    const start = await startProtocol({ cwd, task: "Read-only dogfood task" });
    await finishSession({ cwd, sessionId: start.sessionId, summary: "Done." });

    const before = await checkProtocolCompliance({ cwd, sessionId: start.sessionId });
    await getDogfoodReport({ cwd, sessionId: start.sessionId });
    const after = await checkProtocolCompliance({ cwd, sessionId: start.sessionId });

    expect(after.receiptTypes).toEqual(before.receiptTypes);
    expect(after.activity).toEqual(before.activity);
    expect(after.missingCheckpoints).toEqual(before.missingCheckpoints);
  });
});
