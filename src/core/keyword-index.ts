import { loadProject } from "./context.js";

export interface KeywordIndexHealth {
  indexedMemories: number;
  eligibleMemories: number;
  stale: boolean;
}

export async function rebuildKeywordIndex(input: { cwd: string }): Promise<KeywordIndexHealth> {
  const loaded = await loadProject(input.cwd);

  try {
    loaded.repo.rebuildKeywordIndex(loaded.project.projectId);
    return loaded.repo.getKeywordIndexHealth(loaded.project.projectId);
  } finally {
    loaded.close();
  }
}

export async function getKeywordIndexHealth(input: { cwd: string }): Promise<KeywordIndexHealth> {
  const loaded = await loadProject(input.cwd);

  try {
    return loaded.repo.getKeywordIndexHealth(loaded.project.projectId);
  } finally {
    loaded.close();
  }
}
