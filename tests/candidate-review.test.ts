import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { approveCandidate } from "../src/core/candidate-approve.js";
import { listCandidates } from "../src/core/candidate-list.js";
import { proposeCandidate } from "../src/core/candidate-propose.js";
import { rejectCandidate } from "../src/core/candidate-reject.js";
import { initProject } from "../src/core/init-project.js";
import { listMemories } from "../src/core/list-memories.js";
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

async function createCandidate(cwd: string) {
  const session = await startSession({ cwd, task: "Review candidate" });
  const candidate = await proposeCandidate({
    cwd,
    sessionId: session.sessionId,
    type: "failed_attempt",
    content: "Using defineEntry for JSX-child demos fails with JSX children.",
    evidence: "Typecheck failed when JSX children were stored in defineEntry props."
  });

  return { session, candidate };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("candidate review", () => {
  test("approve proposed candidate creates active memory and writes review receipt", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-approve");
    workspaces.push(cwd);
    await initProject({ cwd });
    const { session, candidate } = await createCandidate(cwd);

    const approved = await approveCandidate({ cwd, candidateId: candidate.candidateId });

    expect(approved.candidate.candidateStatus).toBe("approved");
    expect(approved.candidate.targetMemoryId).toBe(approved.memory.id);
    expect(approved.candidate.reviewedAt).toBeTruthy();
    expect(approved.memory.status).toBe("active");
    expect(approved.memory.source).toBe("agent_reported");
    expect(approved.memory.metadata).toMatchObject({
      candidateId: candidate.candidateId,
      evidence: candidate.evidence,
      approvedFromCandidate: true
    });

    const memories = await listMemories({ cwd, activeOnly: false });
    expect(memories.map((memory) => memory.id)).toContain(approved.memory.id);

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.candidatesReviewed).toBe(1);
    expect(receipt.receipts).toContainEqual(
      expect.objectContaining({
        type: "candidate_reviewed",
        payload: expect.objectContaining({
          candidateId: candidate.candidateId,
          decision: "approved",
          targetMemoryId: approved.memory.id
        })
      })
    );
  });

  test("approved or rejected candidates cannot be approved", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-approve-state");
    workspaces.push(cwd);
    await initProject({ cwd });
    const { candidate } = await createCandidate(cwd);

    await approveCandidate({ cwd, candidateId: candidate.candidateId });
    await expect(approveCandidate({ cwd, candidateId: candidate.candidateId })).rejects.toThrow(
      `Candidate is not proposed: ${candidate.candidateId} is already approved.`
    );

    const { candidate: rejectedCandidate } = await createCandidate(cwd);
    await rejectCandidate({
      cwd,
      candidateId: rejectedCandidate.candidateId,
      reason: "Too task-specific."
    });
    await expect(
      approveCandidate({ cwd, candidateId: rejectedCandidate.candidateId })
    ).rejects.toThrow(
      `Candidate is not proposed: ${rejectedCandidate.candidateId} is already rejected.`
    );
  });

  test("approving unknown or secret-bearing candidate errors clearly", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-approve-errors");
    workspaces.push(cwd);
    await initProject({ cwd });
    await expect(approveCandidate({ cwd, candidateId: "cand_missing" })).rejects.toThrow(
      "Unknown candidate: cand_missing"
    );

    const session = await startSession({ cwd, task: "Approve hygiene" });
    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "workflow_rule",
      content: "Use a normal setup.",
      evidence: "The setup worked."
    });
    const stored = (await listCandidates({ cwd }))[0]!;
    stored.content = "Do not store password=abc123";
    const loaded = await import("../src/core/context.js");
    const project = await loaded.loadProject(cwd);
    try {
      project.repo.updateMemoryCandidate(stored);
    } finally {
      project.close();
    }

    await expect(approveCandidate({ cwd, candidateId: candidate.candidateId })).rejects.toThrow(
      "Candidate rejected by hygiene check: possible secret detected."
    );
  });

  test("command_policy candidates cannot be approved without command metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-approve-policy");
    workspaces.push(cwd);
    await initProject({ cwd });
    const session = await startSession({ cwd, task: "Review command policy candidate" });
    const candidate = await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "command_policy",
      content: "Do not run npm run render.",
      evidence: "Render is expensive."
    });

    await expect(approveCandidate({ cwd, candidateId: candidate.candidateId })).rejects.toThrow(
      "Cannot approve command_policy candidates yet: commandPattern metadata is required."
    );

    expect(await listMemories({ cwd, activeOnly: false })).toHaveLength(0);
  });

  test("reject proposed candidate records reason, receipt, and creates no memory", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-reject");
    workspaces.push(cwd);
    await initProject({ cwd });
    const { session, candidate } = await createCandidate(cwd);

    const rejected = await rejectCandidate({
      cwd,
      candidateId: candidate.candidateId,
      reason: "Too task-specific."
    });

    expect(rejected.candidateStatus).toBe("rejected");
    expect(rejected.reviewReason).toBe("Too task-specific.");
    expect(rejected.reviewedAt).toBeTruthy();
    expect(await listMemories({ cwd, activeOnly: false })).toHaveLength(0);

    const receipt = await getSessionReceipt({ cwd, sessionId: session.sessionId });
    expect(receipt.candidatesReviewed).toBe(1);
    expect(receipt.receipts).toContainEqual(
      expect.objectContaining({
        type: "candidate_reviewed",
        payload: expect.objectContaining({
          candidateId: candidate.candidateId,
          decision: "rejected",
          reason: "Too task-specific."
        })
      })
    );
  });

  test("rejected candidate cannot be rejected again and unknown rejection errors clearly", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-reject-state");
    workspaces.push(cwd);
    await initProject({ cwd });
    await expect(
      rejectCandidate({ cwd, candidateId: "cand_missing", reason: "No evidence." })
    ).rejects.toThrow("Unknown candidate: cand_missing");

    const { candidate } = await createCandidate(cwd);
    await rejectCandidate({
      cwd,
      candidateId: candidate.candidateId,
      reason: "Too task-specific."
    });
    await expect(
      rejectCandidate({ cwd, candidateId: candidate.candidateId, reason: "Still bad." })
    ).rejects.toThrow(
      `Candidate is not proposed: ${candidate.candidateId} is already rejected.`
    );
  });

  test("candidate approve and reject work through CLI JSON", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-review-cli");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    const sessionJson = await runCli(["session", "start", "CLI review", "--json"], cwd);
    const sessionId = JSON.parse(sessionJson.stdout).sessionId as string;
    const proposedJson = await runCli(
      [
        "candidate",
        "propose",
        "--session",
        sessionId,
        "--type",
        "failed_attempt",
        "--content",
        "Avoid storing JSX children in defineEntry props.",
        "--evidence",
        "Typecheck failed for JSX children in defineEntry props.",
        "--json"
      ],
      cwd
    );
    const candidateId = JSON.parse(proposedJson.stdout).candidateId as string;

    const approvedJson = await runCli(["candidate", "approve", candidateId, "--json"], cwd);
    expect(JSON.parse(approvedJson.stdout)).toMatchObject({
      candidate: {
        candidateId,
        candidateStatus: "approved"
      },
      memory: {
        type: "failed_attempt",
        status: "active"
      }
    });

    const secondJson = await runCli(
      [
        "candidate",
        "propose",
        "--session",
        sessionId,
        "--type",
        "workflow_rule",
        "--content",
        "Remember a one-off task detail.",
        "--evidence",
        "Only relevant to this task.",
        "--json"
      ],
      cwd
    );
    const secondId = JSON.parse(secondJson.stdout).candidateId as string;
    const rejectedJson = await runCli(
      ["candidate", "reject", secondId, "--reason", "Too task-specific.", "--json"],
      cwd
    );
    expect(JSON.parse(rejectedJson.stdout)).toEqual({
      candidateId: secondId,
      candidateStatus: "rejected",
      reviewReason: "Too task-specific."
    });
  });
});
