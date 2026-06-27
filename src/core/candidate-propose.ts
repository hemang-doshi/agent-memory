import type { CandidateType, MemoryCandidateRecord } from "../domain/types.js";
import { assertNoObviousSecret } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { requireSession, shortId, writeProtocolReceipt } from "./protocol-receipts.js";

export async function proposeCandidate({
  cwd,
  sessionId,
  type,
  content,
  evidence,
  evidenceEventId
}: {
  cwd: string;
  sessionId: string;
  type: CandidateType;
  content: string;
  evidence?: string;
  evidenceEventId?: string;
}): Promise<MemoryCandidateRecord> {
  if (content.trim().length === 0) {
    throw new Error("candidate propose requires --content");
  }

  const trimmedEvidence = evidence?.trim() ?? "";
  const trimmedEventId = evidenceEventId?.trim() ?? "";
  if (trimmedEvidence.length === 0 && trimmedEventId.length === 0) {
    throw new Error("candidate propose requires --evidence or --evidence-event");
  }

  assertNoObviousSecret(content);
  if (trimmedEvidence.length > 0) {
    assertNoObviousSecret(trimmedEvidence);
  }

  const loaded = await loadProject(cwd);

  try {
    requireSession(loaded, sessionId);
    const evidenceEventIds: string[] = [];
    if (trimmedEventId.length > 0) {
      const event = loaded.repo.getEvent(trimmedEventId);
      if (!event || event.projectId !== loaded.project.projectId) {
        throw new Error(`Unknown evidence event: ${trimmedEventId}`);
      }

      if (event.payload.sessionId !== sessionId) {
        throw new Error(
          `Evidence event ${trimmedEventId} does not belong to session ${sessionId}.`
        );
      }

      evidenceEventIds.push(event.eventId);
    }

    const now = new Date().toISOString();
    const evidenceText =
      trimmedEvidence.length > 0 ? trimmedEvidence : `Evidence event: ${evidenceEventIds[0]}`;
    const candidate: MemoryCandidateRecord = {
      candidateId: shortId("cand"),
      projectId: loaded.project.projectId,
      sessionId,
      type,
      content,
      scope: "project",
      source: "agent_reported",
      confidence: "medium",
      severity: "medium",
      evidence: evidenceText,
      evidenceEventIds,
      candidateStatus: "proposed",
      proposedBy: "agent",
      createdAt: now,
      reviewedAt: null,
      reviewReason: null,
      targetMemoryId: null
    };

    loaded.repo.insertMemoryCandidate(candidate);
    writeProtocolReceipt(loaded, {
      sessionId,
      receiptType: "candidate_proposed",
      payload: {
        candidateId: candidate.candidateId,
        type,
        content,
        evidence: evidenceText,
        evidenceEventIds
      }
    });

    return candidate;
  } finally {
    loaded.close();
  }
}
