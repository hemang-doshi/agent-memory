import { randomUUID } from "node:crypto";

import { ensureString } from "../domain/guards.js";
import type { CreateMemoryInput, MemoryRecord } from "../domain/types.js";

import { loadProject } from "./context.js";

export async function createMemory(input: CreateMemoryInput): Promise<MemoryRecord> {
  const loaded = await loadProject(input.cwd, true);

  try {
    const now = new Date().toISOString();
    const memory: MemoryRecord = {
      id: `mem_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      projectId: loaded.project.projectId,
      scope: input.scope ?? loaded.context.config.default_scope,
      type: input.type,
      content: ensureString(input.content, "content"),
      summary: input.summary ?? null,
      status: input.status ?? "active",
      confidence: input.confidence ?? "high",
      source: input.source,
      paths: input.paths ?? [],
      tags: input.tags ?? [],
      severity: input.severity ?? "medium",
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: input.expiresAt ?? null,
      relatedMemoryIds: input.relatedMemoryIds ?? [],
      supersedesMemoryId: input.supersedesMemoryId ?? null,
      metadata: input.metadata ?? {}
    };

    loaded.repo.insertMemory(memory);
    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "memory_created",
      actor: "user",
      payload: { memoryId: memory.id, type: memory.type, source: memory.source }
    });

    return memory;
  } finally {
    loaded.close();
  }
}
