import type { EventRecord } from "../domain/types.js";

import { loadProject } from "./context.js";
import { requireSession, writeProtocolReceipt } from "./protocol-receipts.js";

const ALLOWED_EVENT_TYPES: EventRecord["eventType"][] = [
  "evidence_recorded",
  "command_result",
  "test_result",
  "user_correction",
  "reusable_observation"
];

export async function recordEvent({
  cwd,
  type,
  summary,
  actor = "agent",
  sessionId
}: {
  cwd: string;
  type: string;
  summary: string;
  actor?: EventRecord["actor"];
  sessionId?: string;
}): Promise<EventRecord> {
  if (summary.trim().length === 0) {
    throw new Error("event record requires --summary");
  }

  if (!ALLOWED_EVENT_TYPES.includes(type as EventRecord["eventType"])) {
    throw new Error(`Unsupported event type: ${type}`);
  }

  const loaded = await loadProject(cwd);

  try {
    if (sessionId) {
      requireSession(loaded, sessionId);
    }

    const event = loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: type as EventRecord["eventType"],
      actor,
      payload: { summary, sessionId: sessionId ?? null }
    });

    if (sessionId) {
      writeProtocolReceipt(loaded, {
        sessionId,
        receiptType: "evidence_recorded",
        payload: {
          eventId: event.eventId,
          eventType: event.eventType,
          summary
        }
      });
    }

    return event;
  } finally {
    loaded.close();
  }
}
