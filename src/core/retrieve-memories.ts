import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, RetrieveMemoriesInput } from "../domain/types.js";

import { loadProject } from "./context.js";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

function computeScore(memory: MemoryRecord, queryTokens: string[], files: string[]): number {
  let score = TYPE_PRIORITIES[memory.type] ?? 0;
  score += (SEVERITY_SCORES[memory.severity] ?? 0) * 10;
  score += (CONFIDENCE_SCORES[memory.confidence] ?? 0) * 6;
  if (memory.status === "active") {
    score += 12;
  }

  const haystack = `${memory.content} ${memory.summary ?? ""} ${memory.tags.join(" ")} ${memory.paths.join(" ")}`.toLowerCase();
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 6;
    }
  }

  if (files.length > 0 && memory.paths.some((path) => files.some((file) => path.includes(file)))) {
    score += 12;
  }

  return score;
}

export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<MemoryRecord[]> {
  const loaded = await loadProject(input.cwd, false);

  try {
    const files = input.files ?? [];
    const queryTokens = tokenize(`${input.task} ${input.command ?? ""}`);
    const memories = loaded.repo.listMemories(loaded.project.projectId);

    const results = memories
      .filter((memory) => {
        if (memory.status === "archived" || memory.status === "rejected") {
          return false;
        }

        if (memory.status === "stale" && !loaded.context.config.retrieval.include_stale) {
          return false;
        }

        if (memory.status === "unverified" && !loaded.context.config.retrieval.include_unverified) {
          return false;
        }

        return true;
      })
      .map((memory) => ({
        memory,
        score: computeScore(memory, queryTokens, files)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, input.maxResults ?? loaded.context.config.retrieval.max_results)
      .map((entry) => entry.memory);

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "memory_retrieved",
      actor: "system",
      payload: {
        task: input.task,
        command: input.command ?? null,
        matchedMemoryIds: results.map((memory) => memory.id)
      }
    });

    return results;
  } finally {
    loaded.close();
  }
}
