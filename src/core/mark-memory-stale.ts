import { loadProject } from "./context.js";

export async function markMemoryStale({
  cwd,
  memoryId,
  reason
}: {
  cwd: string;
  memoryId: string;
  reason: string;
}): Promise<void> {
  const loaded = await loadProject(cwd);

  try {
    const memory = loaded.repo.getMemory(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    memory.status = "stale";
    memory.updatedAt = new Date().toISOString();
    memory.metadata = { ...memory.metadata, staleReason: reason };
    loaded.repo.updateMemoryWithEvent(memory, {
      projectId: loaded.project.projectId,
      eventType: "memory_marked_stale",
      actor: "user",
      payload: { memoryId, reason }
    });
  } finally {
    loaded.close();
  }
}
