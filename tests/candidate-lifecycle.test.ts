import { afterEach, describe, expect, test } from "vitest";

import { listCandidates } from "../src/core/candidate-list.js";
import { proposeCandidate } from "../src/core/candidate-propose.js";
import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
import { recordEvent } from "../src/core/record-event.js";
import { getSessionReceipt } from "../src/core/session-receipt.js";
import { startSession } from "../src/core/session-start.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("candidate lifecycle", () => {
  test("proposing candidate stores it as proposed without creating trusted memory", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-store");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Capture candidate" });

    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "failed_attempt",
      content: "Using defineEntry for JSX-child demos fails with JSX children.",
      evidence: "Typecheck failed when JSX children were stored in defineEntry props."
    });

    expect(candidate.candidateId).toMatch(/^cand_[a-f0-9]{10}$/);
    expect(candidate.candidateStatus).toBe("proposed");
    expect(candidate.source).toBe("agent_reported");
    expect(await listMemories({ cwd, activeOnly: false })).toHaveLength(0);
  });

  test("proposal validates content, evidence, and obvious secrets", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-validation");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Validate candidate" });

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "failed_attempt",
        content: "",
        evidence: "Evidence"
      })
    ).rejects.toThrow("candidate propose requires --content");

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "failed_attempt",
        content: "Content",
        evidence: ""
      })
    ).rejects.toThrow("candidate propose requires --evidence or --evidence-event");

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "failed_attempt",
        content: "Do not store token=abc123",
        evidence: "Evidence"
      })
    ).rejects.toThrow("Candidate rejected by hygiene check: possible secret detected.");
  });

  test("candidate proposal writes a receipt", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-receipt");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Receipt candidate" });

    await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "known_fix",
      content: "Use pnpm test for quick verification.",
      evidence: "pnpm test passed for this change."
    });

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.candidatesProposed).toBe(1);
    expect(receipt.receipts.some((item) => item.type === "candidate_proposed")).toBe(true);
  });

  test("candidate proposal can cite an evidence event", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-event");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Event candidate" });
    const event = await recordEvent({
      cwd,
      sessionId: session.sessionId,
      type: "test_result",
      summary: "pnpm test failed until the package manager command was corrected."
    });

    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "agent_mistake",
      content: "Use pnpm instead of npm install in this repository.",
      evidenceEventId: event.eventId
    });

    expect(candidate.evidence).toBe(`Evidence event: ${event.eventId}`);
    expect(candidate.evidenceEventIds).toEqual([event.eventId]);

    const [stored] = await listCandidates({ cwd });
    expect(stored?.evidenceEventIds).toEqual([event.eventId]);

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    const proposed = receipt.receipts.find((item) => item.type === "candidate_proposed");
    expect(proposed?.payload).toMatchObject({
      candidateId: candidate.candidateId,
      evidenceEventIds: [event.eventId]
    });
  });

  test("candidate proposal rejects unknown or cross-session evidence events", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-event-errors");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Event candidate" });
    const otherSession = await startSession({ cwd, task: "Other session" });
    const event = await recordEvent({
      cwd,
      sessionId: otherSession.sessionId,
      type: "test_result",
      summary: "Other session evidence."
    });

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "agent_mistake",
        content: "Use pnpm.",
        evidenceEventId: "evt_missing"
      })
    ).rejects.toThrow("Unknown evidence event: evt_missing");

    await expect(
      proposeCandidate({
        cwd,
        sessionId: session.sessionId,
        type: "agent_mistake",
        content: "Use pnpm.",
        evidenceEventId: event.eventId
      })
    ).rejects.toThrow(
      `Evidence event ${event.eventId} does not belong to session ${session.sessionId}.`
    );
  });

  test("candidate list returns newest first and can filter proposed", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-list");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "List candidates" });

    const first = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "workflow_rule",
      content: "First candidate.",
      evidence: "First evidence."
    });
    await wait(5);
    const second = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "agent_mistake",
      content: "Second candidate.",
      evidence: "Second evidence."
    });

    const candidates = await listCandidates({ cwd });
    expect(candidates.map((candidate) => candidate.candidateId)).toEqual([
      second.candidateId,
      first.candidateId
    ]);

    const proposed = await listCandidates({ cwd, status: "proposed" });
    expect(proposed).toHaveLength(2);
  });
});
