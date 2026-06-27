import type { MemoryRecord } from "../domain/types.js";

import { loadProject } from "./context.js";

export async function forgetMemory({
  cwd,
  memoryId,
  reason
}: {
  cwd: string;
  memoryId: string;
  reason: string;
}): Promise<MemoryRecord> {
  if (reason.trim().length === 0) {
    throw new Error("forget requires --reason");
  }

  const loaded = await loadProject(cwd);

  try {
    const memory = loaded.repo.getMemory(memoryId);
    if (!memory || memory.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    memory.status = "archived";
    memory.updatedAt = new Date().toISOString();
    memory.metadata = { ...memory.metadata, archivedReason: reason };
    loaded.repo.updateMemoryWithEvent(memory, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: { memoryId, reason, status: "archived" }
    });

    return memory;
  } finally {
    loaded.close();
  }
}
