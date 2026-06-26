import type { SessionRecord } from "../domain/types.js";

import { loadProject } from "./context.js";
import { shortId, writeProtocolReceipt } from "./protocol-receipts.js";

export async function startSession({
  cwd,
  task
}: {
  cwd: string;
  task: string;
}): Promise<SessionRecord> {
  if (task.trim().length === 0) {
    throw new Error("session start requires a task");
  }

  const loaded = await loadProject(cwd);

  try {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      sessionId: shortId("ses"),
      projectId: loaded.project.projectId,
      task,
      status: "active",
      startedAt: now,
      finishedAt: null,
      summary: null
    };

    loaded.repo.insertSession(session);
    writeProtocolReceipt(loaded, {
      sessionId: session.sessionId,
      receiptType: "session_started",
      payload: { task }
    });

    return session;
  } finally {
    loaded.close();
  }
}
