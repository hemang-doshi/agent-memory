import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, RetrieveMemoriesInput } from "../domain/types.js";
import { parseCommandPolicyMatchType } from "../domain/validators.js";

import { loadProject } from "./context.js";

function tokenize(text: string): string[] {
  return Array.from(new Set(text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 1)));
}

interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
  signals: {
    tokenOverlap: number;
    pathMatch: boolean;
    tagMatch: boolean;
    commandMatch: boolean;
  };
}

function commandMatches(command: string | undefined, memory: MemoryRecord): boolean {
  if (!command || memory.type !== "command_policy") {
    return false;
  }

  const pattern =
    typeof memory.metadata.commandPattern === "string" ? memory.metadata.commandPattern : "";
  if (!pattern) {
    return false;
  }

  let matchType: "substring" | "exact" | "regex";
  try {
    matchType = parseCommandPolicyMatchType(memory.metadata.matchType ?? "substring");
  } catch {
    return false;
  }

  if (matchType === "exact") {
    return command === pattern;
  }

  if (matchType === "regex") {
    try {
      return new RegExp(pattern).test(command);
    } catch {
      return false;
    }
  }

  return command.includes(pattern);
}

function scoreMemory(
  memory: MemoryRecord,
  queryTokens: string[],
  files: string[],
  command: string | undefined
): ScoredMemory {
  let score = TYPE_PRIORITIES[memory.type] ?? 0;
  score += (SEVERITY_SCORES[memory.severity] ?? 0) * 10;
  score += (CONFIDENCE_SCORES[memory.confidence] ?? 0) * 6;
  if (memory.status === "active") {
    score += 12;
  }

  const haystack = `${memory.content} ${memory.summary ?? ""} ${memory.tags.join(" ")} ${memory.paths.join(" ")}`.toLowerCase();
  let tokenOverlap = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      tokenOverlap += 1;
      score += 6;
    }
  }

  const pathMatch =
    files.length > 0 &&
    memory.paths.some((path) => files.some((file) => path.includes(file) || file.includes(path)));
  if (pathMatch) {
    score += 12;
  }

  const tagMatch = memory.tags.some((tag) => queryTokens.includes(tag.toLowerCase()));
  if (tagMatch) {
    score += 10;
  }

  const commandMatch = commandMatches(command, memory);
  if (commandMatch) {
    score += 20;
  }

  return {
    memory,
    score,
    signals: {
      tokenOverlap,
      pathMatch,
      tagMatch,
      commandMatch
    }
  };
}

function hasRelevanceSignal(scored: ScoredMemory): boolean {
  return (
    scored.signals.tokenOverlap > 0 ||
    scored.signals.pathMatch ||
    scored.signals.tagMatch ||
    scored.signals.commandMatch
  );
}

export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<MemoryRecord[]> {
  const loaded = await loadProject(input.cwd);

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
      .map((memory) => scoreMemory(memory, queryTokens, files, input.command))
      .filter(hasRelevanceSignal)
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
