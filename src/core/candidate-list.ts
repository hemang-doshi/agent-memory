import type { CandidateStatus, MemoryCandidateRecord } from "../domain/types.js";

import { loadProject } from "./context.js";

export async function listCandidates({
  cwd,
  status
}: {
  cwd: string;
  status?: CandidateStatus;
}): Promise<MemoryCandidateRecord[]> {
  const loaded = await loadProject(cwd);

  try {
    return loaded.repo.listMemoryCandidates(loaded.project.projectId, status);
  } finally {
    loaded.close();
  }
}
