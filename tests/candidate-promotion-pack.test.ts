import { afterEach, describe, expect, test } from "vitest";

import { approveCandidate } from "../src/core/candidate-approve.js";
import { proposeCandidate } from "../src/core/candidate-propose.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { startSession } from "../src/core/session-start.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("candidate promotion into future packs", () => {
  test("session A learns, approved candidate becomes active memory, session B retrieves it", async () => {
    const cwd = await createTempWorkspace("agentmem-candidate-promotion");
    workspaces.push(cwd);

    await initProject({ cwd });

    const sessionA = await startSession({
      cwd,
      task: "Fix component browser"
    });

    const candidate = await proposeCandidate({
      cwd,
      sessionId: sessionA.sessionId,
      type: "failed_attempt",
      content: "Using defineEntry for JSX-child demos fails with JSX children.",
      evidence: "Typecheck failed when JSX children were stored in defineEntry props."
    });

    const approved = await approveCandidate({
      cwd,
      candidateId: candidate.candidateId,
      reason: "test review"
    });
    expect(approved.memory.status).toBe("active");

    const sessionB = await startSession({
      cwd,
      task: "Update component browser PanelCard demo"
    });

    const pack = await generatePack({
      cwd,
      task: "Update component browser PanelCard demo without repeating failed JSX-child defineEntry approach",
      sessionId: sessionB.sessionId
    });

    expect(pack.markdown).toContain("Using defineEntry for JSX-child demos fails");
    expect(pack.matchedMemoryIds).toContain(approved.memory.id);
  });
});
