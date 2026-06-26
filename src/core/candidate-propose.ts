import type { CandidateType, MemoryCandidateRecord } from "../domain/types.js";
import { assertNoObviousSecret } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { requireSession, shortId, writeProtocolReceipt } from "./protocol-receipts.js";

export async function proposeCandidate({
  cwd,
  sessionId,
  type,
  content,
  evidence
}: {
  cwd: string;
  sessionId: string;
  type: CandidateType;
  content: string;
  evidence: string;
}): Promise<MemoryCandidateRecord> {
  if (content.trim().length === 0) {
    throw new Error("candidate propose requires --content");
  }

  if (evidence.trim().length === 0) {
    throw new Error("candidate propose requires --evidence");
  }

  assertNoObviousSecret(content);
  assertNoObviousSecret(evidence);

  const loaded = await loadProject(cwd);

  try {
    requireSession(loaded, sessionId);
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
      evidence,
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
        evidence
      }
    });

    return candidate;
  } finally {
    loaded.close();
  }
}
