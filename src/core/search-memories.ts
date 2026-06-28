import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, SearchMemoryInput } from "../domain/types.js";

import { loadProject } from "./context.js";
import { excludeRelationSupersededMemories, isAgentVisibleMemory } from "./memory-eligibility.js";

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .filter((token) => token.length > 1)
    )
  );
}

function haystack(memory: MemoryRecord): string {
  return [
    memory.content,
    memory.summary ?? "",
    memory.tags.join(" "),
    memory.paths.join(" ")
  ]
    .join(" ")
    .toLowerCase();
}

function matchesQuery(memory: MemoryRecord, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const value = haystack(memory);
  if (value.includes(lowerQuery)) {
    return true;
  }

  const queryTokens = tokenize(query);
  const memoryTokens = tokenize(value);
  return queryTokens.some((token) => memoryTokens.includes(token));
}

function scoreMemory(memory: MemoryRecord, query: string): number {
  const lowerQuery = query.toLowerCase();
  const value = haystack(memory);
  const queryTokens = tokenize(query);
  const memoryTokens = tokenize(value);
  const overlap = queryTokens.filter((token) => memoryTokens.includes(token)).length;

  let score = TYPE_PRIORITIES[memory.type] ?? 0;
  score += (SEVERITY_SCORES[memory.severity] ?? 0) * 10;
  score += (CONFIDENCE_SCORES[memory.confidence] ?? 0) * 5;

  if (value.includes(lowerQuery)) {
    score += 20;
  }

  score += overlap * 6;

  if (memory.tags.some((tag) => tag.toLowerCase().includes(lowerQuery) || queryTokens.includes(tag.toLowerCase()))) {
    score += 8;
  }

  if (memory.paths.some((path) => path.toLowerCase().includes(lowerQuery))) {
    score += 8;
  }

  if (memory.status === "active") {
    score += 10;
  }

  return score;
}

export async function searchMemories(input: SearchMemoryInput): Promise<MemoryRecord[]> {
  const loaded = await loadProject(input.cwd);

  try {
    const all = loaded.repo.listMemories(loaded.project.projectId);
    const memories = excludeRelationSupersededMemories(
      all.filter((memory) => isAgentVisibleMemory({ memory, config: loaded.context.config }))
    );

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
