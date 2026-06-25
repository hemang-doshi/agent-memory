import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, SearchMemoryInput } from "../domain/types.js";

import { loadProject } from "./context.js";

function matchesQuery(memory: MemoryRecord, query: string): boolean {
  const haystack = [
    memory.content,
    memory.summary ?? "",
    memory.tags.join(" "),
    memory.paths.join(" ")
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function scoreMemory(memory: MemoryRecord, query: string): number {
  let score = TYPE_PRIORITIES[memory.type] ?? 0;
  score += (SEVERITY_SCORES[memory.severity] ?? 0) * 10;
  score += (CONFIDENCE_SCORES[memory.confidence] ?? 0) * 5;

  if (memory.content.toLowerCase().includes(query.toLowerCase())) {
    score += 15;
  }

  if (memory.tags.some((tag) => tag.toLowerCase().includes(query.toLowerCase()))) {
    score += 8;
  }

  if (memory.status === "active") {
    score += 10;
  }

  return score;
}

export async function searchMemories(input: SearchMemoryInput): Promise<MemoryRecord[]> {
  const loaded = await loadProject(input.cwd, false);

  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);

    return memories
      .filter((memory) => {
        if (input.activeOnly && memory.status !== "active") {
          return false;
        }

        if (input.type && memory.type !== input.type) {
          return false;
        }

        if (input.path && !memory.paths.some((path) => path.includes(input.path ?? ""))) {
          return false;
        }

        if (input.tag && !memory.tags.includes(input.tag)) {
          return false;
        }

        return matchesQuery(memory, input.query);
      })
      .sort((left, right) => scoreMemory(right, input.query) - scoreMemory(left, input.query));
  } finally {
    loaded.close();
  }
}
