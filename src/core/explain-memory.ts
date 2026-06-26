import type { EventRecord, MemoryRecord } from "../domain/types.js";

import { loadProject } from "./context.js";

export async function explainMemory({
  cwd,
  memoryId
}: {
  cwd: string;
  memoryId: string;
}): Promise<{ memory: MemoryRecord; relatedEvents: EventRecord[] }> {
  const loaded = await loadProject(cwd);

  try {
    const memory = loaded.repo.getMemory(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    return {
      memory,
      relatedEvents: loaded.repo.listEvents(loaded.project.projectId, memoryId)
    };
  } finally {
    loaded.close();
  }
}
