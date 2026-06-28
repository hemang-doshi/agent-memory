import type { EventRecord, EvidenceEventType } from "../domain/types.js";
import { assertNoObviousSecret, parseEvidenceEventType } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { requireSession, writeProtocolReceipt } from "./protocol-receipts.js";

function actorFor(type: EvidenceEventType): EventRecord["actor"] {
  if (type === "agent_observation") {
    return "agent";
  }

  if (type === "user_correction") {
    return "user";
  }

  return "system";
}

export async function recordEvidenceEvent({
  cwd,
  sessionId,
  type,
  summary,
  command,
  exitCode
}: {
  cwd: string;
  sessionId: string;
  type: EvidenceEventType;
  summary: string;
  command?: string;
  exitCode?: number;
}): Promise<EventRecord> {
  const eventType = parseEvidenceEventType(type);
  if (summary.trim().length === 0) {
    throw new Error("event record requires --summary");
  }

  assertNoObviousSecret(summary);
  if (command) {
    assertNoObviousSecret(command);
  }

  const loaded = await loadProject(cwd);

  try {
    requireSession(loaded, sessionId);
    const payload = {
      sessionId,
      summary,
      ...(eventType === "command_result" && command ? { command } : {}),
      ...(eventType === "command_result" && exitCode !== undefined ? { exitCode } : {})
    };
    const event = loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType,
      actor: actorFor(eventType),
      payload
    });

    writeProtocolReceipt(loaded, {
      sessionId,
      receiptType: "event_recorded",
      payload: {
        eventId: event.eventId,
        eventType,
        summary
      }
    });

    return event;
  } finally {
    loaded.close();
  }
}

export async function recordEvent({
  cwd,
  type,
  summary,
  sessionId
}: {
  cwd: string;
  type: string;
  summary: string;
  sessionId?: string;
}): Promise<EventRecord> {
  if (!sessionId) {
    throw new Error("Missing required option --session");
  }

  return recordEvidenceEvent({
    cwd,
    sessionId,
    type: parseEvidenceEventType(type),
    summary
  });
}
