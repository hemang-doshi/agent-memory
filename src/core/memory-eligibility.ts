import type { MemoryRecord, ProjectConfig } from "../domain/types.js";

export function isAgentVisibleMemory({
  memory,
  config,
  now = Date.now()
}: {
  memory: MemoryRecord;
  config: ProjectConfig;
  now?: number;
}): boolean {
  if (
    memory.status === "archived" ||
    memory.status === "rejected" ||
    memory.status === "quarantined" ||
    memory.status === "superseded"
  ) {
    return false;
  }

  if (memory.status === "stale" && config.retrieval.include_stale !== true) {
    return false;
  }

  if (memory.status === "unverified" && config.retrieval.include_unverified !== true) {
    return false;
  }

  const excludedSafetyFlags = new Set([
    "secret",
    "unsafe",
    "prompt_injection",
    "quarantined",
    "redacted"
  ]);
  if (
    memory.redactionStatus !== "none" ||
    memory.safetyFlags.some((flag) => excludedSafetyFlags.has(flag))
  ) {
    return false;
  }

  if (memory.metadata.doNotInclude === true || memory.metadata.negative === true) {
    return false;
  }

  if (memory.trustLevel === "untrusted") {
    return false;
  }

  if (memory.expiresAt) {
    const expiresAt = Date.parse(memory.expiresAt);
    if (!Number.isNaN(expiresAt) && expiresAt <= now) {
      return false;
    }
  }

  return true;
}

export function excludeRelationSupersededMemories(memories: MemoryRecord[]): MemoryRecord[] {
  const supersededIds = new Set(
    memories
      .map((memory) => memory.supersedesMemoryId)
      .filter((memoryId): memoryId is string => typeof memoryId === "string" && memoryId.length > 0)
  );
  return memories.filter((memory) => !supersededIds.has(memory.id));
}
