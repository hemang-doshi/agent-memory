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

  if (memory.trustLevel === "untrusted") {
    return false;
  }

  if (memory.metadata.doNotInclude === true || memory.metadata.negative === true) {
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

export function selectAgentVisibleMemories({
  memories,
  config,
  now = Date.now()
}: {
  memories: MemoryRecord[];
  config: ProjectConfig;
  now?: number;
}): MemoryRecord[] {
  const individuallyVisible = memories.filter((memory) =>
    isAgentVisibleMemory({ memory, config, now })
  );

  const visibleSupersededIds = new Set(
    individuallyVisible
      .map((memory) => memory.supersedesMemoryId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );

  return individuallyVisible.filter(
    (memory) => !visibleSupersededIds.has(memory.id)
  );
}
