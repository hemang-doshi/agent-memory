import type { MemoryRecord } from "../domain/types.js";
import { loadProject } from "../core/context.js";
import { isAgentVisibleMemory } from "../core/memory-eligibility.js";

export interface DuplicateGroup {
  key: string;
  memoryIds: string[];
  content: string;
}

export interface LifecycleReviewReport {
  generatedAt: string;
  needsReview: Array<{
    memoryId: string;
    reasons: string[];
  }>;
}

export interface MemoryQualityReport {
  generatedAt: string;
  summary: {
    totalMemories: number;
    injectableMemories: number;
    duplicateGroups: number;
    staleMemories: number;
    unsafeMemories: number;
    lowTrustMemories: number;
  };
  duplicates: DuplicateGroup[];
}

function normalizeContent(memory: MemoryRecord): string {
  return `${memory.type}:${memory.content}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function isActionableForLifecycle(memory: MemoryRecord): boolean {
  return !["archived", "rejected", "superseded", "quarantined"].includes(memory.status);
}

function duplicateGroups(memories: MemoryRecord[]): DuplicateGroup[] {
  const groups = new Map<string, MemoryRecord[]>();
  for (const memory of memories.filter(isActionableForLifecycle)) {
    const key = normalizeContent(memory);
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      memoryIds: group.map((memory) => memory.id).sort(),
      content: group[0]?.content ?? ""
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function reviewReasons(memory: MemoryRecord): string[] {
  const reasons: string[] = [];
  if (memory.status === "unverified") reasons.push("unverified");
  if (memory.status === "stale") reasons.push("stale");
  if (memory.status === "quarantined") reasons.push("quarantined");
  if (memory.confidence === "low") reasons.push("low confidence");
  if (memory.safetyFlags.length > 0) reasons.push(`safety flags: ${memory.safetyFlags.join(",")}`);
  if (memory.redactionStatus !== "none") reasons.push(`redaction: ${memory.redactionStatus}`);
  if (memory.metadata.trustLevel === "low" || memory.metadata.trustLevel === "untrusted") {
    reasons.push(`trust level: ${String(memory.metadata.trustLevel)}`);
  }
  return reasons;
}

export async function reviewMemories({ cwd }: { cwd: string }): Promise<LifecycleReviewReport> {
  const loaded = await loadProject(cwd);
  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    return {
      generatedAt: new Date().toISOString(),
      needsReview: memories
        .map((memory) => ({ memoryId: memory.id, reasons: reviewReasons(memory) }))
        .filter((entry) => entry.reasons.length > 0)
    };
  } finally {
    loaded.close();
  }
}

export async function purgeExpired({ cwd }: { cwd: string }): Promise<{
  purged: number;
  expiredIds: string[];
}> {
  const loaded = await loadProject(cwd);
  try {
    const now = new Date().toISOString();
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    const expired = memories.filter((memory) => {
      if (!memory.expiresAt) {
        return false;
      }
      return memory.expiresAt <= now;
    });

    for (const memory of expired) {
      memory.status = "archived";
      memory.updatedAt = now;
      memory.metadata = {
        ...memory.metadata,
        expiredPurge: {
          at: now,
          previousStatus: memory.status
        }
      };
      loaded.repo.updateMemoryWithEvent(memory, {
        projectId: loaded.project.projectId,
        eventType: "memory_updated",
        actor: "system",
        payload: {
          memoryId: memory.id,
          status: "archived",
          reason: "Expired memory purged"
        }
      });
    }

    return {
      purged: expired.length,
      expiredIds: expired.map((m) => m.id)
    };
  } finally {
    loaded.close();
  }
}

export async function dedupeResolve({ cwd }: { cwd: string }): Promise<{
  resolved: number;
  groups: Array<{ target: string; mergedSources: string[]; content: string }>;
}> {
  const loaded = await loadProject(cwd);
  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    const groups = duplicateGroups(memories);
    const resolved: Array<{ target: string; mergedSources: string[]; content: string }> = [];

    for (const group of groups) {
      if (group.memoryIds.length < 2) {
        continue;
      }

      const [target, ...sources] = group.memoryIds;
      if (!target || sources.length === 0) {
        continue;
      }

      for (const sourceId of sources) {
        if (!sourceId) {
          continue;
        }
        try {
          await mergeMemories({
            cwd,
            targetMemoryId: target,
            sourceMemoryId: sourceId,
            reason: "Automatic deduplication merge"
          });
        } catch {
          continue;
        }
      }

      resolved.push({ target, mergedSources: sources, content: group.content });
    }

    return { resolved: resolved.length, groups: resolved };
  } finally {
    loaded.close();
  }
}

export async function dedupeMemories({ cwd }: { cwd: string }): Promise<{ duplicateGroups: DuplicateGroup[] }> {
  const loaded = await loadProject(cwd);
  try {
    return {
      duplicateGroups: duplicateGroups(loaded.repo.listMemories(loaded.project.projectId))
    };
  } finally {
    loaded.close();
  }
}

export async function qualityReport({ cwd }: { cwd: string }): Promise<MemoryQualityReport> {
  const loaded = await loadProject(cwd);
  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    const duplicates = duplicateGroups(memories);
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalMemories: memories.length,
        injectableMemories: memories.filter((memory) =>
          isAgentVisibleMemory({ memory, config: loaded.context.config })
        ).length,
        duplicateGroups: duplicates.length,
        staleMemories: memories.filter((memory) => memory.status === "stale").length,
        unsafeMemories: memories.filter((memory) =>
          memory.status === "quarantined" ||
          memory.redactionStatus !== "none" ||
          memory.safetyFlags.length > 0
        ).length,
        lowTrustMemories: memories.filter((memory) =>
          memory.confidence === "low" ||
          memory.metadata.trustLevel === "low" ||
          memory.metadata.trustLevel === "untrusted"
        ).length
      },
      duplicates
    };
  } finally {
    loaded.close();
  }
}

export async function mergeMemories({
  cwd,
  targetMemoryId,
  sourceMemoryId,
  reason
}: {
  cwd: string;
  targetMemoryId: string;
  sourceMemoryId: string;
  reason: string;
}): Promise<{ target: MemoryRecord; source: MemoryRecord }> {
  if (reason.trim().length === 0) {
    throw new Error("merge requires --reason");
  }
  if (targetMemoryId === sourceMemoryId) {
    throw new Error("merge requires distinct --target and --source memory ids");
  }

  const loaded = await loadProject(cwd);
  try {
    const target = loaded.repo.getMemory(targetMemoryId);
    const source = loaded.repo.getMemory(sourceMemoryId);
    if (!target || target.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${targetMemoryId}`);
    }
    if (!source || source.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${sourceMemoryId}`);
    }

    const now = new Date().toISOString();
    target.tags = Array.from(new Set([...target.tags, ...source.tags])).sort();
    target.paths = Array.from(new Set([...target.paths, ...source.paths])).sort();
    target.relatedMemoryIds = Array.from(new Set([
      ...target.relatedMemoryIds,
      ...source.relatedMemoryIds,
      source.id
    ])).filter((id) => id !== target.id).sort();
    target.priority = Math.max(target.priority, source.priority);
    target.pinned = target.pinned || source.pinned;
    target.updatedAt = now;
    target.metadata = {
      ...target.metadata,
      mergedMemoryIds: Array.from(new Set([
        ...(
          Array.isArray(target.metadata.mergedMemoryIds)
            ? target.metadata.mergedMemoryIds.filter((id): id is string => typeof id === "string")
            : []
        ),
        source.id
      ])),
      mergeReason: reason
    };

    source.status = "archived";
    source.updatedAt = now;
    source.metadata = {
      ...source.metadata,
      archivedReason: `Merged into ${target.id}: ${reason}`,
      mergedIntoMemoryId: target.id
    };

    loaded.repo.updateMemoryWithEvent(target, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: { memoryId: target.id, reason, mergedFrom: source.id }
    });
    loaded.repo.updateMemoryWithEvent(source, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: { memoryId: source.id, reason, status: "archived", mergedInto: target.id }
    });

    return { target, source };
  } finally {
    loaded.close();
  }
}

export async function supersedeMemory({
  cwd,
  oldMemoryId,
  newMemoryId,
  reason
}: {
  cwd: string;
  oldMemoryId: string;
  newMemoryId: string;
  reason: string;
}): Promise<{ oldMemory: MemoryRecord; newMemory: MemoryRecord }> {
  if (reason.trim().length === 0) {
    throw new Error("supersede requires --reason");
  }
  if (oldMemoryId === newMemoryId) {
    throw new Error("supersede requires distinct old and replacement memory ids");
  }

  const loaded = await loadProject(cwd);
  try {
    const oldMemory = loaded.repo.getMemory(oldMemoryId);
    const newMemory = loaded.repo.getMemory(newMemoryId);
    if (!oldMemory || oldMemory.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${oldMemoryId}`);
    }
    if (!newMemory || newMemory.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${newMemoryId}`);
    }

    const now = new Date().toISOString();
    oldMemory.status = "superseded";
    oldMemory.updatedAt = now;
    oldMemory.metadata = {
      ...oldMemory.metadata,
      supersededByMemoryId: newMemory.id,
      supersedeReason: reason
    };
    newMemory.supersedesMemoryId = oldMemory.id;
    newMemory.relatedMemoryIds = Array.from(new Set([...newMemory.relatedMemoryIds, oldMemory.id])).sort();
    newMemory.updatedAt = now;

    loaded.repo.updateMemoryWithEvent(oldMemory, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: { memoryId: oldMemory.id, status: "superseded", supersededBy: newMemory.id, reason }
    });
    loaded.repo.updateMemoryWithEvent(newMemory, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: { memoryId: newMemory.id, supersedesMemoryId: oldMemory.id, reason }
    });

    return { oldMemory, newMemory };
  } finally {
    loaded.close();
  }
}
