import type { CandidateStatus, ManagePlan } from "../domain/types.js";

import { loadProject } from "./context.js";

const CANDIDATE_STATUSES: CandidateStatus[] = [
  "proposed",
  "approved",
  "rejected",
  "merged",
  "superseded",
  "expired"
];

export async function getManagePlan({ cwd }: { cwd: string }): Promise<ManagePlan> {
  const loaded = await loadProject(cwd);

  try {
    const candidates = loaded.repo.listMemoryCandidates(loaded.project.projectId);
    const counts = Object.fromEntries(
      CANDIDATE_STATUSES.map((status) => [
        status,
        candidates.filter((candidate) => candidate.candidateStatus === status).length
      ])
    ) as Record<CandidateStatus, number>;

    return {
      counts,
      proposedCandidates: candidates
        .filter((candidate) => candidate.candidateStatus === "proposed")
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          type: candidate.type,
          content: candidate.content,
          evidence: candidate.evidence,
          sessionId: candidate.sessionId,
          createdAt: candidate.createdAt
        }))
    };
  } finally {
    loaded.close();
  }
}

export function formatManagePlanText(plan: ManagePlan): string {
  const lines = [
    "Memory review plan:",
    `- proposed: ${plan.counts.proposed}`,
    `- approved: ${plan.counts.approved}`,
    `- rejected: ${plan.counts.rejected}`
  ];

  if (plan.proposedCandidates.length === 0) {
    return [...lines, "No candidates need review."].join("\n");
  }

  for (const candidate of plan.proposedCandidates) {
    lines.push(
      "",
      `Candidate ${candidate.candidateId}`,
      `type: ${candidate.type}`,
      `content: ${candidate.content}`,
      `evidence: ${candidate.evidence}`,
      "suggested action: approve | reject"
    );
  }

  return lines.join("\n");
}
