import type { MemoryRecord } from "../domain/types.js";

export interface PackPlan {
  selected: MemoryRecord[];
  omitted: Array<{
    memoryId: string;
    type: MemoryRecord["type"];
    reason: string;
  }>;
}

function isMandatory(memory: MemoryRecord): boolean {
  if (memory.pinned) return true;
  if (memory.priority > 0) return true;
  if (memory.type === "command_policy" && memory.metadata.decision === "block") return true;
  if (
    memory.severity === "high" &&
    (memory.type === "fragile_file" ||
      memory.type === "failed_attempt" ||
      memory.type === "known_fix" ||
      memory.type === "agent_mistake")
  )
    return true;
  return false;
}

function estimatedCharSize(memory: MemoryRecord): number {
  return memory.content.length + 80;
}

export function planPackMemories({
  memories,
  budgetCharacters,
  reservedCharacters = 0
}: {
  memories: MemoryRecord[];
  budgetCharacters: number;
  reservedCharacters?: number;
}): PackPlan {
  const available = budgetCharacters - reservedCharacters;
  if (available <= 0) {
    return { selected: [], omitted: memories.map((m) => ({ memoryId: m.id, type: m.type, reason: "No budget remaining" })) };
  }

  const mandatory = memories.filter(isMandatory);
  const optional = memories
    .filter((m) => !isMandatory(m))
    .sort((a, b) => {
      const scoreA = typeof a.metadata.retrieval === "object" && a.metadata.retrieval && "score" in a.metadata.retrieval
        ? (a.metadata.retrieval.score as number) : 0;
      const scoreB = typeof b.metadata.retrieval === "object" && b.metadata.retrieval && "score" in b.metadata.retrieval
        ? (b.metadata.retrieval.score as number) : 0;
      return scoreB - scoreA || b.createdAt.localeCompare(a.createdAt);
    });

  const selected: MemoryRecord[] = [];
  let used = 0;

  for (const memory of mandatory) {
    selected.push(memory);
    used += estimatedCharSize(memory);
  }

  for (const memory of optional) {
    if (used >= available) break;
    selected.push(memory);
    used += estimatedCharSize(memory);
  }

  const selectedIds = new Set(selected.map((m) => m.id));
  const omitted = memories
    .filter((m) => !selectedIds.has(m.id))
    .map((m) => ({
      memoryId: m.id,
      type: m.type,
      reason: "Lower priority — omitted due to configured memory budget"
    }));

  return { selected, omitted };
}
