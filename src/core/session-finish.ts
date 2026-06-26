import type { SessionRecord } from "../domain/types.js";

import { loadProject } from "./context.js";
import { requireSession, writeProtocolReceipt } from "./protocol-receipts.js";

export async function finishSession({
  cwd,
  sessionId,
  summary
}: {
  cwd: string;
  sessionId: string;
  summary: string;
}): Promise<SessionRecord> {
  if (summary.trim().length === 0) {
    throw new Error("Missing required option --summary");
  }

  const loaded = await loadProject(cwd);

  try {
    requireSession(loaded, sessionId);
    const session = loaded.repo.finishSession({
      sessionId,
      summary,
      finishedAt: new Date().toISOString()
    });
    writeProtocolReceipt(loaded, {
      sessionId,
      receiptType: "session_finished",
      payload: { summary }
    });

    return session;
  } finally {
    loaded.close();
  }
}
