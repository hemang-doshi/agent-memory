import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { checkProtocolCompliance } from "../src/core/protocol-check.js";
import { startProtocol } from "../src/core/protocol-start.js";
import { finishSession } from "../src/core/session-finish.js";
import { initProject } from "../src/core/init-project.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("protocol start", () => {
  test("starts a session and generates a pack", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start");
    workspaces.push(cwd);
    await initProject({ cwd });

    const result = await startProtocol({ cwd, task: "Implement protocol start" });

    expect(result.sessionId).toMatch(/^ses_/);
    expect(result.task).toBe("Implement protocol start");
    expect(result.pack.markdown).toContain("Project Memory Pack");
    expect(result.pack.matchedMemoryIds).toEqual(expect.any(Array));
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });

  test("includes relevant memory in the pack", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-memory");
    workspaces.push(cwd);
    await initProject({ cwd });
    await createMemory({
      cwd,
      type: "failed_attempt",
      content: "Using defineEntry for JSX-child demos failed due to TypeScript limitations.",
      source: "user_explicit",
      tags: ["typescript", "component-browser"]
    });

    const result = await startProtocol({
      cwd,
      task: "Update component browser PanelCard demo"
    });

    expect(result.pack.markdown).toContain("Using defineEntry for JSX-child demos failed");
    expect(result.pack.matchedMemoryIds.length).toBeGreaterThanOrEqual(1);
  });

  test("creates receipts through existing session and pack behavior", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-receipts");
    workspaces.push(cwd);
    await initProject({ cwd });

    const result = await startProtocol({ cwd, task: "Implement protocol start" });
    const check = await checkProtocolCompliance({ cwd, sessionId: result.sessionId });

    expect(check.required.sessionStarted).toBe(true);
    expect(check.required.packLoaded).toBe(true);
    expect(check.required.sessionFinished).toBe(false);
    expect(check.compliant).toBe(false);
    expect(check.missingCheckpoints).toEqual(["session_finished"]);

    await finishSession({
      cwd,
      sessionId: result.sessionId,
      summary: "Done."
    });
    const afterFinish = await checkProtocolCompliance({
      cwd,
      sessionId: result.sessionId
    });

    expect(afterFinish.compliant).toBe(true);
    expect(afterFinish.missingCheckpoints).toEqual([]);
  });

  test("validates empty tasks", async () => {
    const cwd = await createTempWorkspace("agentmem-protocol-start-empty");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(startProtocol({ cwd, task: "" })).rejects.toThrow(
      "protocol start requires a task description"
    );
    await expect(startProtocol({ cwd, task: "   " })).rejects.toThrow(
      "protocol start requires a task description"
    );
  });
});
