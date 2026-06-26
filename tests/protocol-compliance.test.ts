import { afterEach, describe, expect, test } from "vitest";

import { proposeCandidate } from "../src/core/candidate-propose.js";
import { createMemory } from "../src/core/create-memory.js";
import { finishSession } from "../src/core/session-finish.js";
import { getSessionReceipt } from "../src/core/session-receipt.js";
import { startSession } from "../src/core/session-start.js";
import { generatePack } from "../src/core/generate-pack.js";
import { initProject } from "../src/core/init-project.js";
import { preflightCommand } from "../src/core/preflight-command.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("protocol compliance", () => {
  test("proves the v0.2-alpha protocol spine from DB receipts", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol");
    workspaces.push(cwd);

    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Do not run npm run render unless explicitly requested.",
      type: "command_policy",
      source: "user_explicit",
      severity: "high",
      metadata: {
        decision: "warn",
        commandPattern: "npm run render",
        matchType: "exact",
        suggestedAction: "Run pnpm test instead."
      }
    });

    const session = await startSession({
      cwd,
      task: "Implement reel scene"
    });

    const pack = await generatePack({
      cwd,
      task: "Implement reel scene and avoid render",
      sessionId: session.sessionId
    });
    expect(pack.sessionId).toBe(session.sessionId);

    const preflight = await preflightCommand({
      cwd,
      command: "npm run render",
      sessionId: session.sessionId
    });
    expect(preflight.decision).toBe("warn");

    await proposeCandidate({
      cwd,
      sessionId: session.sessionId,
      type: "failed_attempt",
      content: "Using defineEntry for JSX-child demos fails with JSX children.",
      evidence: "Typecheck failed when JSX children were stored in defineEntry props."
    });

    await finishSession({
      cwd,
      sessionId: session.sessionId,
      summary: "Implemented safe path."
    });

    const receipt = await getSessionReceipt({
      cwd,
      sessionId: session.sessionId
    });

    expect(receipt.packLoaded).toBe(true);
    expect(receipt.memoriesInjected.length).toBeGreaterThan(0);
    expect(receipt.preflightChecks).toBe(1);
    expect(receipt.warningsTriggered).toBe(1);
    expect(receipt.blocksTriggered).toBe(0);
    expect(receipt.candidatesProposed).toBe(1);
    expect(receipt.sessionFinished).toBe(true);
  });
});
