import type { EventRecord } from "../domain/types.js";

import { loadProject } from "./context.js";
import { isEvidenceEventType } from "./evidence-events.js";
import { requireSession } from "./protocol-receipts.js";

export async function listEvidenceEvents({
  cwd,
  sessionId
}: {
  cwd: string;
  sessionId: string;
}): Promise<EventRecord[]> {
  const loaded = await loadProject(cwd);

  try {
    requireSession(loaded, sessionId, { allowFinished: true });
    return loaded.repo
      .listEvents(loaded.project.projectId)
      .filter(
        (event) =>
          isEvidenceEventType(event.eventType) &&
          event.payload.sessionId === sessionId
      );
  } finally {
    loaded.close();
  }
}
