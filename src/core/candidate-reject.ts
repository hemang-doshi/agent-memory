import type { MemoryCandidateRecord } from "../domain/types.js";

import { loadProject } from "./context.js";

function requireProposedCandidate(candidate: MemoryCandidateRecord): void {
  if (candidate.candidateStatus !== "proposed") {
    throw new Error(
      `Candidate is not proposed: ${candidate.candidateId} is already ${candidate.candidateStatus}.`
    );
  }
}

export async function rejectCandidate({
  cwd,
  candidateId,
  reason
}: {
  cwd: string;
  candidateId: string;
  reason: string;
}): Promise<MemoryCandidateRecord> {
  if (reason.trim().length === 0) {
    throw new Error("Missing required option --reason");
  }

  const loaded = await loadProject(cwd);

  try {
    const existing = loaded.repo.getMemoryCandidate(candidateId);
    if (!existing || existing.projectId !== loaded.project.projectId) {
      throw new Error(`Unknown candidate: ${candidateId}`);
    }

    requireProposedCandidate(existing);

    const candidate: MemoryCandidateRecord = {
      ...existing,
      candidateStatus: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewReason: reason
    };

    loaded.repo.rejectCandidateWithReceipt({
      candidate,
      receipt: {
        projectId: loaded.project.projectId,
        sessionId: candidate.sessionId,
        receiptType: "candidate_reviewed",
        payload: {
          candidateId: candidate.candidateId,
          decision: "rejected",
          reason
        }
      }
    });

    return candidate;
  } finally {
    loaded.close();
  }
}
