import type { MemoryRecord, MemoryStatus, MemoryType } from "../domain/types.js";
import { assertNoObviousSecret, validateMemoryRecordForType } from "../domain/validators.js";

import { loadProject } from "./context.js";

export async function updateMemory({
  cwd,
  memoryId,
  reason,
  content,
  type,
  status,
  tags,
  paths,
  pinned,
  priority
}: {
  cwd: string;
  memoryId: string;
  reason: string;
  content?: string;
  type?: MemoryType;
  status?: MemoryStatus;
  tags?: string[];
  paths?: string[];
  pinned?: boolean;
  priority?: number;
}): Promise<MemoryRecord> {
  if (reason.trim().length === 0) {
    throw new Error("update requires --reason");
  }

  const loaded = await loadProject(cwd);

  try {
    const memory = loaded.repo.getMemory(memoryId);
    if (!memory || memory.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const before = {
      content: memory.content,
      type: memory.type,
      status: memory.status,
      tags: memory.tags,
      paths: memory.paths,
      pinned: memory.pinned,
      priority: memory.priority
    };

    if (content !== undefined) {
      assertNoObviousSecret(content);
      memory.content = content;
    }
    if (type !== undefined) {
      memory.type = type;
    }
    if (status !== undefined) {
      memory.status = status;
    }
    if (tags !== undefined) {
      for (const tag of tags) {
        assertNoObviousSecret(tag);
      }
      memory.tags = tags;
    }
    if (paths !== undefined) {
      for (const path of paths) {
        assertNoObviousSecret(path);
      }
      memory.paths = paths;
    }
    if (pinned !== undefined) {
      memory.pinned = pinned;
    }
    if (priority !== undefined) {
      memory.priority = priority;
    }

    memory.updatedAt = new Date().toISOString();
    validateMemoryRecordForType(memory);
    loaded.repo.updateMemoryWithEvent(memory, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: { memoryId, reason, before }
    });

    return memory;
  } finally {
    loaded.close();
  }
}
