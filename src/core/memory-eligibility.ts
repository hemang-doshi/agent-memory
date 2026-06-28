export {
  isAgentVisibleMemory,
  selectAgentVisibleMemories
} from "./memory-visibility.js";

export function excludeRelationSupersededMemories(memories: MemoryRecord[]): MemoryRecord[] {
  const supersededIds = new Set(
    memories
      .map((memory) => memory.supersedesMemoryId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  return memories.filter((memory) => !supersededIds.has(memory.id));
}

import type { MemoryRecord } from "../domain/types.js";
