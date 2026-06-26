import type { MemoryCandidateRecord, MemoryRecord } from "../domain/types.js";
import { assertNoObviousSecret } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { shortId } from "./protocol-receipts.js";

export interface CandidateApprovalResult {
  candidate: MemoryCandidateRecord;
  memory: MemoryRecord;
}

function requireProposedCandidate(candidate: MemoryCandidateRecord): void {
  if (candidate.candidateStatus !== "proposed") {
    throw new Error(
      `Candidate is not proposed: ${candidate.candidateId} is already ${candidate.candidateStatus}.`
    );
  }
}

export async function approveCandidate({
  cwd,
  candidateId
}: {
  cwd: string;
  candidateId: string;
}): Promise<CandidateApprovalResult> {
  const loaded = await loadProject(cwd);

  try {
    const existing = loaded.repo.getMemoryCandidate(candidateId);
    if (!existing || existing.projectId !== loaded.project.projectId) {
      throw new Error(`Unknown candidate: ${candidateId}`);
    }

    requireProposedCandidate(existing);
    if (existing.type === "command_policy") {
      throw new Error(
        "Cannot approve command_policy candidates yet: commandPattern metadata is required."
      );
    }

    assertNoObviousSecret(existing.content);
    assertNoObviousSecret(existing.evidence);

    const now = new Date().toISOString();
    const memory: MemoryRecord = {
      id: shortId("mem"),
      projectId: loaded.project.projectId,
      scope: existing.scope,
      type: existing.type,
      content: existing.content,
      summary: null,
      status: "active",
      confidence: existing.confidence,
      source: "agent_reported",
      paths: [],
      tags: [],
      severity: existing.severity,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: null,
      relatedMemoryIds: [],
      supersedesMemoryId: null,
      metadata: {
        candidateId: existing.candidateId,
        evidence: existing.evidence,
        evidenceEventIds: existing.evidenceEventIds,
        approvedFromCandidate: true
      }
    };

    const candidate: MemoryCandidateRecord = {
      ...existing,
      candidateStatus: "approved",
      reviewedAt: now,
      targetMemoryId: memory.id
    };

    loaded.repo.approveCandidateWithMemory({
      candidate,
      memory,
      receipt: {
        projectId: loaded.project.projectId,
        sessionId: candidate.sessionId,
        receiptType: "candidate_reviewed",
        payload: {
          candidateId: candidate.candidateId,
          decision: "approved",
          targetMemoryId: memory.id
        }
      }
    });

    return { candidate, memory };
  } finally {
    loaded.close();
  }
}
