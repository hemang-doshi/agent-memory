import type { MemoryRecord, MemoryType } from "../domain/types.js";

import { loadProject } from "./context.js";

export async function listMemories({
  cwd,
  type,
  activeOnly = true
}: {
  cwd: string;
  type?: MemoryType;
  activeOnly?: boolean;
}): Promise<MemoryRecord[]> {
  const loaded = await loadProject(cwd);

  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    return memories.filter((memory) => {
      if (type && memory.type !== type) {
        return false;
      }

      if (activeOnly && memory.status !== "active") {
        return false;
      }

      return true;
    });
  } finally {
    loaded.close();
  }
}
