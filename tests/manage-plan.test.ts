import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

import { approveCandidate } from "../src/core/candidate-approve.js";
import { proposeCandidate } from "../src/core/candidate-propose.js";
import { rejectCandidate } from "../src/core/candidate-reject.js";
import { initProject } from "../src/core/init-project.js";
import { formatManagePlanText, getManagePlan } from "../src/core/manage-plan.js";
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

async function propose(cwd: string, content: string) {
  const session = await startSession({ cwd, task: `Plan ${content}` });
  return proposeCandidate({
    cwd,
    sessionId: session.sessionId,
    type: "workflow_rule",
    content,
    evidence: `Evidence for ${content}`
  });
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("manage plan", () => {
  test("lists proposed candidates and returns counts by status", async () => {
    const cwd = await createTempWorkspace("agentmem-manage-plan");
    workspaces.push(cwd);
    await initProject({ cwd });

    const proposed = await propose(cwd, "Proposed candidate.");
    const approved = await propose(cwd, "Approved candidate.");
    const rejected = await propose(cwd, "Rejected candidate.");
    await approveCandidate({ cwd, candidateId: approved.candidateId, reason: "test review" });
    await rejectCandidate({
      cwd,
      candidateId: rejected.candidateId,
      reason: "Too task-specific."
    });

    const plan = await getManagePlan({ cwd });
    expect(plan.counts).toMatchObject({
      proposed: 1,
      approved: 1,
      rejected: 1,
      merged: 0,
      superseded: 0,
      expired: 0
    });
    expect(plan.proposedCandidates).toEqual([
      expect.objectContaining({
        candidateId: proposed.candidateId,
        content: "Proposed candidate."
      })
    ]);
    expect(plan.proposedCandidates.map((candidate) => candidate.candidateId)).not.toContain(
      approved.candidateId
    );
    expect(plan.proposedCandidates.map((candidate) => candidate.candidateId)).not.toContain(
      rejected.candidateId
    );
  });

  test("manage plan text says no candidates need review when none are proposed", async () => {
    const cwd = await createTempWorkspace("agentmem-manage-plan-empty");
    workspaces.push(cwd);
    await initProject({ cwd });

    const plan = await getManagePlan({ cwd });
    expect(formatManagePlanText(plan)).toContain("No candidates need review.");
  });

  test("manage --plan --json works through CLI", async () => {
    const cwd = await createTempWorkspace("agentmem-manage-plan-cli");
    workspaces.push(cwd);
    await runCli(["init"], cwd);
    const sessionJson = await runCli(["session", "start", "CLI manage", "--json"], cwd);
    const sessionId = JSON.parse(sessionJson.stdout).sessionId as string;
    const candidateJson = await runCli(
      [
        "candidate",
        "propose",
        "--session",
        sessionId,
        "--type",
        "workflow_rule",
        "--content",
        "Use manage plan to review candidates.",
        "--evidence",
        "Candidate was proposed during CLI test.",
        "--json"
      ],
      cwd
    );
    const candidateId = JSON.parse(candidateJson.stdout).candidateId as string;

    const planJson = await runCli(["manage", "--plan", "--json"], cwd);
    expect(JSON.parse(planJson.stdout)).toMatchObject({
      counts: {
        proposed: 1,
        approved: 0,
        rejected: 0,
        merged: 0,
        superseded: 0,
        expired: 0
      },
      proposedCandidates: [
        expect.objectContaining({
          candidateId,
          content: "Use manage plan to review candidates."
        })
      ]
    });
  });

  test("manage without plan errors clearly", async () => {
    const cwd = await createTempWorkspace("agentmem-manage-plan-error");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["manage"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("manage currently supports only --plan")
    });
  });
});
