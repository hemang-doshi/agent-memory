import type { CandidateType, MemoryCandidateRecord } from "../domain/types.js";
import { assertNoObviousSecret, assertNoObviousSecretInUnknown } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { eventSummary, isEvidenceEventType } from "./evidence-events.js";
import { requireSession, shortId, writeProtocolReceipt } from "./protocol-receipts.js";

export async function proposeCandidate({
  cwd,
  sessionId,
  type,
  content,
  evidence,
  evidenceEventId,
  metadata
}: {
  cwd: string;
  sessionId: string;
  type: CandidateType;
  content: string;
  evidence?: string;
  evidenceEventId?: string;
  metadata?: Record<string, unknown>;
}): Promise<MemoryCandidateRecord> {
  if (content.trim().length === 0) {
    throw new Error("candidate propose requires --content");
  }

  const trimmedEvidence = evidence?.trim();
  const trimmedEvidenceEventId = evidenceEventId?.trim();
  if (!trimmedEvidence && !trimmedEvidenceEventId) {
    throw new Error("candidate propose requires --evidence or --evidence-event");
  }

  assertNoObviousSecret(content);
  if (metadata) {
    assertNoObviousSecretInUnknown(metadata, "metadata");
  }

  const loaded = await loadProject(cwd);

  try {
    requireSession(loaded, sessionId);
    const evidenceEventIds: string[] = [];
    let storedEvidence = trimmedEvidence ?? "";

    if (trimmedEvidenceEventId) {
      const event = loaded.repo.getEvent(trimmedEvidenceEventId);
      if (!event || event.projectId !== loaded.project.projectId) {
        throw new Error(`Unknown event: ${trimmedEvidenceEventId}`);
      }

      if (!isEvidenceEventType(event.eventType)) {
        throw new Error(`Event cannot be used as candidate evidence: ${trimmedEvidenceEventId}`);
      }

      if (event.payload.sessionId !== sessionId) {
        throw new Error(`Evidence event does not belong to session: ${trimmedEvidenceEventId}`);
      }

      evidenceEventIds.push(event.eventId);
      if (!storedEvidence) {
        storedEvidence = eventSummary(event);
      }
    }

    if (storedEvidence.trim().length === 0) {
      throw new Error("candidate propose requires --evidence or --evidence-event");
    }

    assertNoObviousSecret(storedEvidence);
    const now = new Date().toISOString();
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
      evidence: storedEvidence,
      evidenceEventIds,
      candidateStatus: "proposed",
      proposedBy: "agent",
      createdAt: now,
      reviewedAt: null,
      reviewReason: null,
      targetMemoryId: null,
      metadata: metadata ?? {}
    };

    loaded.repo.insertMemoryCandidate(candidate);
    writeProtocolReceipt(loaded, {
      sessionId,
      receiptType: "candidate_proposed",
      payload: {
        candidateId: candidate.candidateId,
        type,
        content,
        evidence: storedEvidence,
        evidenceEventIds
      }
    });

    return candidate;
  } finally {
    loaded.close();
  }
}
